import { effect, pingPong, sampler } from "vgpu"
import type { Frame, Target } from "vgpu"
import { release } from "../release.ts"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

export interface SnowSources {
  readonly snow: Wgsl
  readonly scene: Wgsl
}

/**
 * Two passes: the snow on the bench, then the picture. The fingertip and the
 * weather are worked out here. Press and drag to write: the fingertip digs a
 * trench through the snow and heaps what it moves along both sides. Snow
 * keeps falling, so every mark slowly fills back in. Left alone, an unseen
 * finger draws a heart now and then.
 */
type V2 = [number, number]
type V4 = [number, number, number, number]

/** The snow grid's long edge. Trenches are soft, so it need not match the screen. */
const MAX_EDGE = 1400
/** Fingertip radius, screen heights. */
const TIP = 0.016
const FLAKES = 40

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** Where the unseen finger draws its heart, and how big. */
export function heartPlace(aspect: number): { c: V2; s: number } {
  if (aspect >= 1) return { c: [aspect * 0.66, 0.5], s: 0.17 }
  return { c: [aspect * 0.5, 0.6], s: Math.min(0.17, aspect * 0.3) }
}

function heart(k: number, c: V2, s: number): V2 {
  // The classic heart curve, from the dip at the top round and back.
  const t = k * Math.PI * 2
  const x = 16 * Math.sin(t) ** 3
  const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
  return [c[0] + (x / 32) * s, c[1] + (y / 32) * s + s * 0.08]
}

type V3 = [number, number, number]

interface Limb {
  a: V3
  b: V3
  ra: number
  rb: number
}

/**
 * A bare deciduous tree, in its own units (it stands 1 tall at the origin):
 * a leaning trunk that forks into limbs, each forking again five times down
 * to twigs. 63 segments.
 */
function growTree(): Limb[] {
  const out: Limb[] = []
  let seed = 3
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const norm = (v: V3): V3 => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1
    return [v[0] / l, v[1] / l, v[2] / l]
  }
  function branch(a: V3, dir: V3, len: number, r: number, depth: number) {
    const b: V3 = [a[0] + dir[0] * len, a[1] + dir[1] * len, a[2] + dir[2] * len]
    out.push({ a, b, ra: r, rb: r * 0.72 })
    if (depth >= 5) return
    const kids = 2
    const spin = rnd() * Math.PI * 2
    for (let k = 0; k < kids; k++) {
      // Spread away from the parent, around it, and a little upward.
      const ang = spin + k * Math.PI + (rnd() - 0.5) * 0.8
      const spread = 0.7 + rnd() * 0.45
      const side: V3 = [Math.cos(ang), Math.sin(ang), 0]
      const d = norm([dir[0] + side[0] * spread, dir[1] + side[1] * spread, dir[2] + 0.05])
      // Start part way up the parent for the outer forks, so limbs do not all leave one point.
      const at = k === 0 ? b : [a[0] + (b[0] - a[0]) * 0.8, a[1] + (b[1] - a[1]) * 0.8, a[2] + (b[2] - a[2]) * 0.8] as V3
      branch(at, d, len * (0.66 + rnd() * 0.14), r * 0.62, depth + 1)
    }
  }
  branch([0, 0, 0], norm([0.08, -0.05, 1]), 0.42, 0.045, 0)
  return out
}

const TREE = growTree()

/** Moves a point across the slats to the middle of the slat under it (matches bench.wgsl). */
function onSlat(p: V2, shift = 0): V2 {
  const TURN = 0.07
  const PITCH = 0.158
  const c = Math.cos(TURN)
  const s = Math.sin(TURN)
  const qx = c * p[0] + s * p[1]
  const qy = -s * p[0] + c * p[1] + 0.031
  const my = (Math.floor(qy / PITCH) + 0.5 + shift) * PITCH - 0.031
  return [c * qx - s * my, s * qx + c * my]
}

interface Flake {
  x: number
  y: number
  z: number
  size: number
  phase: number
}

export function createSnow(setup: EffectSetup, src: SnowSources): EffectInstance {
  const { gpu, target, quality } = setup

  const dims = (w: number, h: number): [number, number] => {
    const scale = Math.min(quality, MAX_EDGE / Math.max(w, h, 1))
    return [Math.max(8, Math.round(w * scale)), Math.max(8, Math.round(h * scale))]
  }
  const [w0, h0] = dims(target.size[0], target.size[1])
  const state = pingPong(gpu, w0, h0, { format: "rgba16float" })
  const linear = sampler(gpu, { minFilter: "linear", magFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" })
  const snowFx = effect(gpu, src.snow)
  const scene = effect(gpu, src.scene, { set: { samp: linear } })

  let lastDims: readonly [number, number] = [w0, h0]
  let needInit = true
  let lastAspect = 0

  let tip: V2 = [0, 0]
  let prevTip: V2 | null = null
  let hover = 0
  let lastActive = -100
  let heartAt = 2.2
  const flakes: Flake[] = []

  function spawnFlake(aspect: number, i: number, anywhere: boolean): Flake {
    const n = i + flakes.length * 0.37 + Math.random() * 100
    return {
      x: hash(n * 1.7) * (aspect + 0.2) - 0.1,
      y: hash(n * 2.3) * 1.2 - 0.1,
      z: anywhere ? hash(n * 3.1) * 0.35 : 0.3 + hash(n * 3.1) * 0.05,
      size: 0.006 + hash(n * 4.9) * 0.006,
      phase: hash(n * 5.3) * 6.28,
    }
  }

  function render(frame: Frame, tgt: Target, inputs: FrameInputs) {
    const aspect = tgt.size[0] / Math.max(tgt.size[1], 1)
    const dt = Math.min(Math.max(inputs.dt, 1 / 240), 1 / 20)
    const t = inputs.time
    const live = inputs.pointer > 0.05
    const pressed = inputs.pressed ?? false
    const hand: V2 = [inputs.mouse[0] * aspect, 1 - inputs.mouse[1]]
    if (Math.abs(aspect - lastAspect) > 1e-3) {
      if (lastAspect !== 0) needInit = true
      lastAspect = aspect
    }
    if (live || pressed) lastActive = t

    // Where the fingertip is, and whether it is in the snow.
    let touching = false
    let want: V2 = tip
    if (pressed) {
      touching = true
      want = hand
      heartAt = Math.max(heartAt, t + 40)
    } else if (t >= heartAt && t - lastActive > 5) {
      const k = (t - heartAt) / 2.6
      if (k <= 1) {
        const { c, s } = heartPlace(aspect)
        want = heart(k, c, s)
        touching = k > 0.0
      } else {
        heartAt = t + 75
      }
    } else if (live) {
      want = hand
    }
    if (!touching || !prevTip) {
      tip = want
    } else {
      tip = [tip[0] + (want[0] - tip[0]) * 0.6, tip[1] + (want[1] - tip[1]) * 0.6]
    }
    hover += ((live && !pressed ? 1 : 0) - hover) * (1 - Math.exp(-dt * 8))

    const a: V2 = touching && prevTip ? prevTip : tip
    // Snow falling: marks fill back in over a minute or two.
    const refill = 1 - Math.exp(-dt / 45)
    snowFx.set({
      state: state.read.color,
      dig: {
        seg: [a[0], a[1], tip[0], tip[1]],
        aspect,
        radius: TIP * (inputs.controls.tip ?? 1),
        touching: touching ? 1 : 0,
        init: needInit ? 1 : 0,
        refill,
        _p0: 0,
        _p1: 0,
        _p2: 0,
      },
    })
    needInit = false
    frame.pass(state.write, snowFx)
    state.swap()
    prevTip = touching ? tip : null

    // Flakes drift down and across, and land.
    const fall = inputs.controls.snowfall ?? 1
    const count = Math.round(FLAKES * Math.min(1, fall))
    while (flakes.length < count) flakes.push(spawnFlake(aspect, flakes.length, true))
    flakes.length = Math.min(flakes.length, count)
    for (let i = 0; i < flakes.length; i++) {
      const f = flakes[i]
      f.z -= dt * 0.03 * (0.7 + 0.6 * hash(i * 9.1))
      f.x += (0.012 + Math.sin(t * 0.8 + f.phase) * 0.01) * dt
      f.y += Math.cos(t * 0.6 + f.phase) * 0.006 * dt
      if (f.z <= 0) flakes[i] = spawnFlake(aspect, i, false)
    }
    const flakeU: V4[] = []
    for (let i = 0; i < FLAKES; i++) {
      const f = flakes[i]
      flakeU.push(f ? [f.x, f.y, f.z, f.size] : [0, 0, 0, 0])
    }

    // Three dry leaves that blew in before the snow stopped.
    const leafU: V4[] = [
      [...onSlat([aspect * 0.18, 0.64]), 0.6, 0.042],
      [...onSlat([aspect * 0.88, 0.24]), -1.1, 0.036],
      [...onSlat([aspect * 0.47, 0.1]), 2.4, 0.038],
      [0, 0, 0, 0],
    ]

    // A low winter sun from the upper right; the control lifts it.
    const sunCtl = inputs.controls.sun ?? 0.3
    const elev = 0.16 + sunCtl * 0.6
    const az = 0.62
    const sun: V4 = [Math.cos(az) * Math.cos(elev), Math.sin(az) * Math.cos(elev), Math.sin(elev), 2.5]
    // The tree stands off screen toward the sun, placed so its crown's
    // shadow lands across the lower left; each limb is cast onto the bench
    // along the sun, and sways a little with height.
    const lx = sun[0] / sun[2]
    const ly = sun[1] / sun[2]
    const H = 0.44
    const crownAt: V2 = aspect >= 1 ? [aspect * 0.3, 0.3] : [aspect * 0.35, 0.28]
    const foot: V2 = [crownAt[0] + lx * H * 0.95, crownAt[1] + ly * H * 0.95]
    const wind = Math.sin(t * 0.45) * 0.6 + Math.sin(t * 1.2 + 1) * 0.25 + Math.sin(t * 2.9) * 0.08
    const cast = (v: V3): V2 => {
      const z = v[2] * H
      const sw = wind * 0.012 * v[2] * v[2]
      return [foot[0] + v[0] * H + sw - lx * z, foot[1] + v[1] * H + sw * 0.4 - ly * z]
    }
    const segU: V4[] = []
    const segW: V4[] = []
    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9
    for (const limb of TREE) {
      const a = cast(limb.a)
      const b = cast(limb.b)
      segU.push([a[0], a[1], b[0], b[1]])
      // Penumbra: the sun is half a degree wide, so blur grows with height.
      segW.push([limb.ra * H, limb.rb * H, 0.0012 + limb.a[2] * H * 0.012, 0.0012 + limb.b[2] * H * 0.012])
      bx0 = Math.min(bx0, a[0], b[0]); by0 = Math.min(by0, a[1], b[1])
      bx1 = Math.max(bx1, a[0], b[0]); by1 = Math.max(by1, a[1], b[1])
    }
    while (segU.length < 64) { segU.push([0, 0, 0, 0]); segW.push([0, 0, 0, 0]) }
    const m = 0.06

    scene.set({
      state: state.read.color,
      view: {
        res: tgt.size,
        aspect,
        time: t,
        sun,
        finger: [hand[0], hand[1], TIP * (inputs.controls.tip ?? 1), hover],
        crown: [bx0 - m, by0 - m, bx1 + m, by1 + m],
        seg: segU,
        segW,
        flake: flakeU,
        leaf: leafU,
        depth: 0.024,
        flakes: flakes.length,
        _p0: 0,
        _p1: 0,
      },
    })
    frame.pass(tgt, scene)
  }

  return {
    render,
    resize(width, height) {
      const [w, h] = dims(width, height)
      if (w === lastDims[0] && h === lastDims[1]) return
      const near = (x: number, y: number) => Math.abs(x - y) / Math.max(y, 1) < 0.2
      if (near(w, lastDims[0]) && near(h, lastDims[1]) && !needInit) return
      lastDims = [w, h]
      state.read.resize([w, h])
      state.write.resize([w, h])
      needInit = true
    },
    dispose() {
      release(state.read, state.write)
    },
  }
}
