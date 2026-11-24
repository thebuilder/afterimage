import { effect, pingPong, sampler } from "vgpu"
import type { Frame, Target } from "vgpu"
import { release } from "../release.ts"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

export interface KoiSources {
  readonly water: Wgsl
  readonly pond: Wgsl
}

/**
 * Two passes: the water surface, then the pond as seen through it. The koi
 * live here. Each fish is a head that steers (wandering, keeping to the pond,
 * giving the others room, drawn to food or a quiet hand, startled by a quick
 * one) and a spine of ten points that follows the head, with a swimming wave
 * added for drawing. Ripples come from the hand, from food landing, from a
 * koi gulping at the surface and from shallow fish pushing the water.
 */
type V2 = [number, number]
type V4 = [number, number, number, number]

const MAXF = 10
const SEGS = 10
const MAXITEMS = 12
const MAXFOOD = 8
const MAXDROPS = 8
/** The ripple grid's long edge. */
const SIM_EDGE = 480

let seed = 20261124
function rnd(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI
  return a
}

/** Kohaku, sanke, showa, ogon, platinum, chagoi, tancho, asagi. */
const VARIETIES = [0, 3, 1, 6, 2, 0, 4, 5, 7, 1]

interface Fish {
  p: V2
  heading: number
  speed: number
  len: number
  spine: V2[]
  depth: number
  depthWant: number
  wander: number
  tail: number
  fin: number
  variety: number
  seed: number
  scared: number
  gulp: number
}

interface Item {
  p: V2
  rot: number
  spin: number
  size: number
  kind: number
  seed: number
  v: V2
}

interface Food {
  p: V2
  born: number
}

export function createKoi(setup: EffectSetup, src: KoiSources): EffectInstance {
  const { gpu, target } = setup
  const simDims = (w: number, h: number): [number, number] => {
    const s = SIM_EDGE / Math.max(w, h, 1)
    return [Math.max(8, Math.round(w * s)), Math.max(8, Math.round(h * s))]
  }
  let simSize = simDims(target.size[0], target.size[1])
  const state = pingPong(gpu, simSize[0], simSize[1], { format: "rgba16float" })
  const linear = sampler(gpu, { minFilter: "linear", magFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" })
  const nearest = sampler(gpu, { minFilter: "nearest", magFilter: "nearest", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" })
  const waterFx = effect(gpu, src.water, { set: { samp: nearest } })
  const pondFx = effect(gpu, src.pond, { set: { samp: linear } })

  let fish: Fish[] = []
  let items: Item[] = []
  let food: Food[] = []
  let started = false
  let needInit = true
  let lastAspect = 0
  let prevHand: V2 | null = null
  let wasPressed = false
  let nextGulp = 1.0
  let nextFeed = 1.4
  let lastActive = -100
  let drops: V4[] = []

  function addDrop(x: number, y: number, strength: number, radius: number) {
    if (drops.length < MAXDROPS) drops.push([x, y, strength, radius])
  }

  function spawn(aspect: number) {
    const count = aspect >= 1 ? 9 : 6
    const scale = aspect >= 1 ? 1 : Math.max(0.62, aspect * 1.25)
    fish = []
    for (let i = 0; i < count; i++) {
      const len = (0.15 + 0.09 * rnd()) * scale
      const p: V2 = [aspect * (0.15 + 0.7 * rnd()), 0.15 + 0.7 * rnd()]
      const heading = rnd() * Math.PI * 2
      const spine: V2[] = []
      for (let k = 0; k < SEGS; k++) {
        const d = (k * len) / (SEGS - 1)
        spine.push([p[0] - Math.cos(heading) * d, p[1] - Math.sin(heading) * d])
      }
      const depth = 0.2 + 0.6 * rnd()
      fish.push({
        p,
        heading,
        speed: 0.04,
        len,
        spine,
        depth,
        depthWant: depth,
        wander: rnd() * 100,
        tail: rnd() * 10,
        fin: rnd() * 10,
        variety: VARIETIES[i % VARIETIES.length],
        seed: rnd() * 50,
        scared: 0,
        gulp: -10,
      })
    }
    items = []
    // Lily pads gathered toward the upper right, and ginkgo leaves drifting.
    const pads = aspect >= 1 ? 5 : 4
    for (let i = 0; i < pads; i++) {
      const cx = aspect >= 1 ? aspect * (0.8 + 0.16 * rnd()) : aspect * (0.55 + 0.4 * rnd())
      const cy = aspect >= 1 ? 0.62 + 0.33 * rnd() : 0.72 + 0.25 * rnd()
      items.push({ p: [cx, cy], rot: rnd() * 6.28, spin: (rnd() - 0.5) * 0.02, size: (0.055 + 0.04 * rnd()) * scale, kind: 0, seed: rnd() * 50, v: [0, 0] })
    }
    // A water lily in flower beside the first pad.
    const pad = items[0]
    items.push({ p: [pad.p[0] - pad.size * 0.7, pad.p[1] - pad.size * 0.75], rot: rnd() * 6.28, spin: 0, size: 0.042 * scale, kind: 2, seed: rnd() * 50, v: [0, 0] })
    for (let i = 0; i < 5; i++) {
      items.push({ p: [aspect * rnd(), rnd()], rot: rnd() * 6.28, spin: (rnd() - 0.5) * 0.15, size: (0.028 + 0.01 * rnd()) * scale, kind: 1, seed: rnd() * 50, v: [0.006 + 0.006 * rnd(), -0.002 + 0.004 * rnd()] })
    }
    food = []
  }

  function dropFood(at: V2, n: number, t: number) {
    for (let i = 0; i < n; i++) {
      if (food.length >= MAXFOOD) food.shift()
      const a = rnd() * 6.28
      const r = 0.012 + 0.03 * rnd()
      const p: V2 = [at[0] + Math.cos(a) * r, at[1] + Math.sin(a) * r]
      food.push({ p, born: t + i * 0.06 })
      addDrop(p[0], p[1], 0.9, 0.007)
    }
  }

  function steer(f: Fish, i: number, t: number, dt: number, aspect: number, hand: V2 | null, handSpeed: number) {
    let want = f.heading + Math.sin(t * 0.23 + f.wander) * 0.9 + Math.sin(t * 0.61 + f.wander * 2.3) * 0.5
    let speedWant = 0.035 + 0.02 * (0.5 + 0.5 * Math.sin(t * 0.17 + f.wander))
    let turn = 1.2

    // Food first: the nearest floating pellet.
    let best: Food | null = null
    let bestD = 0.75
    for (const fd of food) {
      if (fd.born > t) continue
      const d = Math.hypot(fd.p[0] - f.p[0], fd.p[1] - f.p[1])
      if (d < bestD) {
        bestD = d
        best = fd
      }
    }
    if (best) {
      want = Math.atan2(best.p[1] - f.p[1], best.p[0] - f.p[0])
      speedWant = 0.07 + 0.12 * Math.min(1, bestD / 0.2)
      turn = 3.2
      f.depthWant = 0.06
    } else if (hand && handSpeed < 0.7) {
      // A quiet hand: the nearest fish come to see if it holds food.
      const d = Math.hypot(hand[0] - f.p[0], hand[1] - f.p[1])
      if (d < 0.55 && i < 3) {
        const a = Math.atan2(hand[1] - f.p[1], hand[0] - f.p[0])
        want = d > 0.06 ? a : want
        speedWant = d > 0.06 ? 0.06 : 0.02
        turn = 2.2
        f.depthWant = 0.15
      }
    }
    // A quick hand startles the fish near it.
    if (hand && handSpeed > 1.1) {
      const d = Math.hypot(hand[0] - f.p[0], hand[1] - f.p[1])
      if (d < 0.2) f.scared = 0.9
    }
    if (f.scared > 0 && hand) {
      want = Math.atan2(f.p[1] - hand[1], f.p[0] - hand[0])
      speedWant = 0.32
      turn = 5
      f.depthWant = 0.75
      f.scared -= dt
    }

    // Give the others room.
    for (const o of fish) {
      if (o === f) continue
      const dx = f.p[0] - o.p[0]
      const dy = f.p[1] - o.p[1]
      const d = Math.hypot(dx, dy)
      const room = (f.len + o.len) * 0.45
      if (d < room && d > 1e-4) {
        const away = Math.atan2(dy, dx)
        want += wrapAngle(away - want) * 0.5 * (1 - d / room)
      }
    }
    // Keep to the pond, and keep the lower left quiet on wide screens.
    const m = 0.1
    const cx = aspect * 0.55
    const cy = 0.55
    const edge = Math.max(0, m - f.p[0], f.p[0] - (aspect - m), m - f.p[1], f.p[1] - (1 - m))
    const corner = aspect >= 1 ? Math.max(0, 1 - Math.hypot(f.p[0] / (aspect * 0.36), f.p[1] / 0.44)) * 2 : 0
    const home = Math.min(1, edge / m * 1.5 + corner)
    if (home > 0) {
      const back = Math.atan2(cy - f.p[1], cx - f.p[0])
      want += wrapAngle(back - want) * home
    }

    const dh = wrapAngle(want - f.heading)
    f.heading += Math.max(-turn * dt, Math.min(turn * dt, dh))
    f.speed += (speedWant - f.speed) * (1 - Math.exp(-dt * (f.scared > 0 ? 8 : 2)))
    if (!best && f.scared <= 0 && f.gulp < t - 3) f.depthWant += (0.2 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.05 + f.wander)) - f.depthWant) * dt * 0.2
    f.depth += (f.depthWant - f.depth) * (1 - Math.exp(-dt * 1.2))

    f.p = [f.p[0] + Math.cos(f.heading) * f.speed * dt, f.p[1] + Math.sin(f.heading) * f.speed * dt]
    f.tail += dt * (2.2 + f.speed * 40)
    f.fin += dt * (1.5 + f.speed * 10)

    // The body follows the head, link by link.
    const seg = f.len / (SEGS - 1)
    f.spine[0] = f.p
    // Each joint bends at most so far, so a sharp turn becomes an arc, never a fold.
    let dirPrev = f.heading + Math.PI
    for (let k = 1; k < SEGS; k++) {
      const a = f.spine[k - 1]
      const b = f.spine[k]
      let dir = Math.atan2(b[1] - a[1], b[0] - a[0])
      const bend = wrapAngle(dir - dirPrev)
      const lim = 0.32
      if (Math.abs(bend) > lim) dir = dirPrev + Math.sign(bend) * lim
      f.spine[k] = [a[0] + Math.cos(dir) * seg, a[1] + Math.sin(dir) * seg]
      dirPrev = dir
    }

    // Eating.
    if (best && Math.hypot(best.p[0] - f.p[0], best.p[1] - f.p[1]) < f.len * 0.08 + 0.006) {
      food = food.filter((x) => x !== best)
      addDrop(f.p[0], f.p[1], 1.4, 0.01)
      f.gulp = t
    }
  }

  /** The spine as drawn: the swimming wave runs back along it. */
  function drawnSpine(f: Fish): V2[] {
    const out: V2[] = []
    const amp = f.len * (0.035 + Math.min(0.06, f.speed * 0.35))
    for (let k = 0; k < SEGS; k++) {
      const a = f.spine[Math.max(0, k - 1)]
      const b = f.spine[Math.min(SEGS - 1, k + 1)]
      const tx = b[0] - a[0]
      const ty = b[1] - a[1]
      const tl = Math.hypot(tx, ty) || 1
      const u = k / (SEGS - 1)
      const w = amp * Math.pow(u, 1.7) * Math.sin(f.tail - u * 4.2)
      out.push([f.spine[k][0] - (ty / tl) * w, f.spine[k][1] + (tx / tl) * w])
    }
    return out
  }

  function render(frame: Frame, tgt: Target, inputs: FrameInputs) {
    const t = inputs.time
    const dt = Math.min(Math.max(inputs.dt, 1 / 240), 1 / 20)
    const aspect = tgt.size[0] / Math.max(tgt.size[1], 1)
    const live = inputs.pointer > 0.05
    const pressed = inputs.pressed ?? false
    const hand: V2 = [inputs.mouse[0] * aspect, 1 - inputs.mouse[1]]
    drops = []

    if (!started || Math.abs(aspect - lastAspect) > 0.25) {
      started = true
      spawn(aspect)
      needInit = true
    } else if (aspect !== lastAspect) {
      const k = aspect / lastAspect
      for (const f of fish) {
        f.p = [f.p[0] * k, f.p[1]]
        f.spine = f.spine.map((s) => [s[0] * k, s[1]] as V2)
      }
      for (const it of items) it.p = [it.p[0] * k, it.p[1]]
    }
    lastAspect = aspect

    // The hand on the water.
    let handSpeed = 0
    if (live && prevHand) {
      const step = Math.hypot(hand[0] - prevHand[0], hand[1] - prevHand[1])
      handSpeed = step < 0.25 ? step / dt : 0
      if (step < 0.25 && step > 0.0005) addDrop(hand[0], hand[1], Math.min(0.5, handSpeed * 0.35), 0.01)
      // The hand stirs what floats near it.
      for (const it of items) {
        const d = Math.hypot(it.p[0] - hand[0], it.p[1] - hand[1])
        const k = Math.exp(-(d * d) / 0.006) * 0.6
        it.v = [it.v[0] + (hand[0] - prevHand[0]) * k, it.v[1] + (hand[1] - prevHand[1]) * k]
      }
    }
    prevHand = live ? hand : null
    if (live || pressed) lastActive = t
    if (pressed && !wasPressed) dropFood(hand, 4, t)
    wasPressed = pressed

    // Someone feeds the fish now and then, and a koi rises to gulp.
    if (t >= nextFeed) {
      if (t - lastActive > 6 || nextFeed < 2) {
        const spot: V2 = aspect >= 1 ? [aspect * (0.45 + 0.4 * rnd()), 0.3 + 0.5 * rnd()] : [aspect * (0.25 + 0.5 * rnd()), 0.4 + 0.4 * rnd()]
        dropFood(spot, 5, t)
      }
      nextFeed = t + 16 + 8 * rnd()
    }
    if (t >= nextGulp && fish.length) {
      const f = fish[Math.floor(rnd() * fish.length)]
      if (f.depth < 0.35) {
        addDrop(f.p[0], f.p[1], 1.0, 0.009)
        f.gulp = t
      } else {
        f.depthWant = 0.05
      }
      nextGulp = t + 2.5 + 4 * rnd()
    }

    fish.forEach((f, i) => steer(f, i, t, dt, aspect, live ? hand : null, handSpeed))
    // The nearest fish to the hand are listed first next frame.
    if (live) fish.sort((a, b) => Math.hypot(a.p[0] - hand[0], a.p[1] - hand[1]) - Math.hypot(b.p[0] - hand[0], b.p[1] - hand[1]))
    // Shallow, quick fish push the water.
    for (const f of fish) if (f.depth < 0.2 && f.speed > 0.08) addDrop(f.p[0], f.p[1], 0.12, 0.012)

    // Floating things drift, turn and wrap around.
    for (const it of items) {
      const drag = it.kind === 1 ? 0.6 : 2.5
      it.v = [it.v[0] * Math.exp(-dt * drag), it.v[1] * Math.exp(-dt * drag)]
      if (it.kind === 1) it.v = [it.v[0] + 0.004 * dt, it.v[1] + 0.001 * Math.sin(t * 0.3 + it.seed) * dt]
      it.p = [it.p[0] + it.v[0] * dt, it.p[1] + it.v[1] * dt]
      it.rot += it.spin * dt
      if (it.kind === 1) {
        if (it.p[0] > aspect + 0.06) it.p = [-0.06, 0.1 + 0.8 * rnd()]
        if (it.p[0] < -0.08) it.p = [aspect + 0.05, it.p[1]]
        if (it.p[1] > 1.08) it.p = [it.p[0], -0.05]
        if (it.p[1] < -0.08) it.p = [it.p[0], 1.05]
      }
    }
    for (const fd of food) fd.p = [fd.p[0] + Math.sin(t * 0.7 + fd.born) * 0.002 * dt, fd.p[1] + Math.cos(t * 0.5 + fd.born) * 0.002 * dt]
    food = food.filter((fd) => t - fd.born < 40)

    // Ripples.
    const dropArr: V4[] = []
    for (let i = 0; i < MAXDROPS; i++) dropArr.push(drops[i] ?? [0, 0, 0, 1])
    waterFx.set({
      state: state.read.color,
      sim: {
        res: simSize,
        aspect: simSize[0] / simSize[1],
        n: drops.length,
        init: needInit ? 1 : 0,
        gain: inputs.controls.ripples ?? 1,
        _p0: 0,
        _p1: 0,
        drops: dropArr,
      },
    })
    needInit = false
    frame.pass(state.write, waterFx)
    state.swap()

    // The pond.
    const spine: V4[] = []
    const fishA: V4[] = []
    const fishB: V4[] = []
    const order = [...fish].sort((a, b) => b.depth - a.depth)
    for (let i = 0; i < MAXF; i++) {
      const f = order[i]
      const pts = f ? drawnSpine(f) : null
      for (let k = 0; k < SEGS; k += 2) {
        spine.push(pts ? [pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]] : [0, 0, 0, 0])
      }
      fishA.push(f ? [f.len, f.len * 0.125, f.seed, f.depth] : [0, 0, 0, 0])
      fishB.push(f ? [f.variety, f.fin, f.speed, Math.max(0, 1 - (t - f.gulp) / 0.6)] : [0, 0, 0, 0])
    }
    const itemA: V4[] = []
    const itemB: V4[] = []
    for (let i = 0; i < MAXITEMS; i++) {
      const it = items[i]
      itemA.push(it ? [it.p[0], it.p[1], it.rot, it.size] : [0, 0, 0, 0])
      itemB.push(it ? [it.kind, it.seed, 0, it ? 1 : 0] : [0, 0, 0, 0])
    }
    const foodArr: V4[] = []
    for (let i = 0; i < MAXFOOD; i++) {
      const fd = food[i]
      foodArr.push(fd && fd.born <= t ? [fd.p[0], fd.p[1], Math.min(1, (t - fd.born) / 0.3), 1] : [0, 0, 0, 0])
    }
    pondFx.set({
      water: state.read.color,
      view: {
        res: tgt.size,
        aspect,
        time: t,
        nFish: Math.min(order.length, MAXF),
        nItems: items.length,
        light: inputs.controls.light ?? 1,
        _p0: 0,
        spine,
        fishA,
        fishB,
        itemA,
        itemB,
        food: foodArr,
      },
    })
    frame.pass(tgt, pondFx)
  }

  return {
    render,
    resize(width, height) {
      const next = simDims(width, height)
      if (next[0] === simSize[0] && next[1] === simSize[1]) return
      simSize = next
      state.read.resize(simSize)
      state.write.resize(simSize)
      needInit = true
    },
    dispose() {
      release(state.read, state.write)
    },
  }
}
