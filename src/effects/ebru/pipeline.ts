import { effect, pingPong, sampler, target } from "vgpu"
import type { Frame, Target } from "vgpu"
import { release } from "../release.ts"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

export interface EbruSources {
  readonly marble: Wgsl
  readonly present: Wgsl
}

/**
 * Up to three passes. Each drop of paint and each pull of a stylus or comb is
 * kept as a move in a list, and the marbling pass replays the list backwards
 * per pixel, so the pattern stays exact and crisp however far it is combed.
 * Moves that have stopped changing are baked into a texture now and then so
 * the list stays short, and the marbled tray is only drawn again when a move
 * changes; the picture pass just shows it with its light. Pressing drops
 * paint (hold to let it spread), dragging pulls a stylus through it. Left
 * alone, an unseen hand drops paint, combs it back and forth, adds flowers,
 * then skims the tray clean with a strip of paper and starts again.
 */
type V2 = [number, number]
type V4 = [number, number, number, number]

const MAXOPS = 40
/** Bake once this many moves are kept, and this many at a time. */
const BAKE_AT = 28
const BAKE_N = 16
/** The tray textures' long edge. */
const MAX_EDGE = 2400

interface Op {
  a: V4
  b: V4
  c: V4
  done: boolean
  /** Drops grow toward this radius from this time. */
  grow?: { R: number; t0: number }
  /** Combs are pulled from one front to another over a time. */
  pull?: { from: number; to: number; t0: number; dur: number }
  /** Strokes drawn by the unseen hand go from a to here over a time. */
  draw?: { to: V2; t0: number; dur: number }
}

let seed = 20261122
function rnd(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}

function ease(k: number): number {
  const c = Math.min(1, Math.max(0, k))
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2
}

/** Where the unseen hand works: away from the lower left on wide screens. */
export function region(aspect: number): { x: V2; y: V2; scale: number } {
  if (aspect >= 1) return { x: [0.36 * aspect, 0.97 * aspect], y: [0.12, 0.92], scale: 1 }
  return { x: [0.06 * aspect, 0.94 * aspect], y: [0.36, 0.96], scale: Math.max(0.6, Math.min(1, aspect * 1.4)) }
}

export function createEbru(setup: EffectSetup, src: EbruSources): EffectInstance {
  const { gpu, target: screen, quality } = setup

  const dims = (w: number, h: number): [number, number] => {
    const scale = Math.min(quality, MAX_EDGE / Math.max(w, h, 1))
    return [Math.max(8, Math.round(w * scale)), Math.max(8, Math.round(h * scale))]
  }
  let [cw, ch] = dims(screen.size[0], screen.size[1])
  const cache = target(gpu, { size: [cw, ch], format: "rgba8unorm" })
  let [bw, bh] = [cw, ch]
  const base = pingPong(gpu, bw, bh, { format: "rgba8unorm" })
  const linear = sampler(gpu, { minFilter: "linear", magFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" })
  const bakeFx = effect(gpu, src.marble, { set: { samp: linear } })
  const trayFx = effect(gpu, src.marble, { set: { samp: linear } })
  const present = effect(gpu, src.present, { set: { samp: linear } })

  let ops: Op[] = []
  let fresh = true
  let dirty = true
  let colour = 0
  let started = false

  // The unseen hand's plan: things to do at given times.
  let plan: { at: number; run: (t: number) => void }[] = []
  let planEnd = -1
  let wipe = -1
  let lastActive = -100
  let userTouched = false

  // The hand.
  let wasPressed = false
  let pressAt: V2 = [0, 0]
  let pressT = 0
  let userDrop: Op | null = null
  let seg: Op | null = null
  let prev: V2 | null = null
  let hint = 0

  function addDrop(x: number, y: number, R: number, t: number, instant: boolean): Op {
    const op: Op = {
      a: [x, y, instant ? R : 0, colour++ % 6],
      b: [rnd() * 50, 0, 0, 0],
      c: [0, 0, 0, 0],
      done: instant,
      grow: instant ? undefined : { R, t0: t },
    }
    ops.push(op)
    dirty = true
    return op
  }

  /** A comb of tines across the whole tray, pulled along `dir`. */
  function addComb(aspect: number, dir: V2, shift: number, spacing: number, sharp: number, phase: number, t: number, dur: number, instant: boolean) {
    const W = Math.max(0.12, shift * 2)
    const corners: V2[] = [[0, 0], [aspect, 0], [0, 1], [aspect, 1]]
    const along = corners.map((p) => p[0] * dir[0] + p[1] * dir[1])
    const from = Math.min(...along) - 0.02
    const to = Math.max(...along) + W + 0.02
    ops.push({
      a: [0, 0, dir[0], dir[1]],
      b: [shift, spacing, sharp, 2],
      c: [instant ? to : from, W, phase, 0],
      done: instant,
      pull: instant ? undefined : { from, to, t0: t, dur },
    })
    dirty = true
  }

  function addStroke(a: V2, b: V2, width: number, t: number, dur: number, instant: boolean): Op {
    const op: Op = {
      a: [a[0], a[1], instant ? b[0] : a[0], instant ? b[1] : a[1]],
      b: [0.85, width, 0, 1],
      c: [0, 0, 0, 0],
      done: instant,
      draw: instant ? undefined : { to: b, t0: t, dur },
    }
    ops.push(op)
    dirty = true
    return op
  }

  /**
   * One pattern: bullseye clusters and scattered drops, combed right, combed
   * back between the first tines, pulled down in wide waves, then flowers.
   * `skip` lays the first steps down at once so the tray opens already marbled.
   */
  function planCycle(t0: number, aspect: number, skip: boolean) {
    plan = []
    const { x, y, scale } = region(aspect)
    const size = scale
    const at = (dt: number, run: (t: number) => void) => plan.push({ at: t0 + dt, run })
    const pick = (): V2 => [x[0] + (x[1] - x[0]) * rnd(), y[0] + (y[1] - y[0]) * rnd()]
    colour = Math.floor(rnd() * 6)

    // Bullseyes: a big drop, then smaller ones in the same place.
    const drops: [number, number, number][] = []
    for (let k = 0; k < 4; k++) {
      const c = pick()
      for (const R of [0.15, 0.12, 0.095, 0.07, 0.045]) drops.push([c[0] + (rnd() - 0.5) * 0.012, c[1] + (rnd() - 0.5) * 0.012, R * size * (0.85 + 0.3 * rnd())])
    }
    for (let k = 0; k < 9; k++) {
      const c = pick()
      drops.push([c[0], c[1], (0.035 + 0.04 * rnd()) * size])
    }
    const phase = rnd()
    let s = 0
    if (skip) {
      for (const d of drops) addDrop(d[0], d[1], d[2], t0, true)
      addComb(aspect, [1, 0], 0.045, 0.085, 2, phase, t0, 0, true)
      addComb(aspect, [-1, 0], 0.045, 0.085, 2, phase + 0.5, t0, 0, true)
      s = 0.25
    } else {
      drops.forEach((d, i) => at(0.3 + i * 0.15, (t) => addDrop(d[0], d[1], d[2], t, false)))
      s = 0.3 + drops.length * 0.15 + 0.7
      at(s, (t) => addComb(aspect, [1, 0], 0.045, 0.085, 2, phase, t, 2.6, false))
      s += 3.0
      at(s, (t) => addComb(aspect, [-1, 0], 0.045, 0.085, 2, phase + 0.5, t, 2.6, false))
      s += 3.0
    }
    // Wide waves pulled down through the stripes.
    at(s, (t) => addComb(aspect, [0, -1], 0.1 * size, 0.17 * size, 3, rnd(), t, 3.4, false))
    s += 3.8
    // Flowers: a drop, a smaller one inside it, and a stylus drawn up through both.
    for (let k = 0; k < 3; k++) {
      const c = pick()
      const R = 0.042 * size
      at(s, (t) => addDrop(c[0], c[1], R, t, false))
      at(s + 0.35, (t) => addDrop(c[0], c[1], R * 0.5, t, false))
      at(s + 0.8, (t) => addStroke([c[0], c[1] - R * 1.6], [c[0], c[1] + R * 1.9], 0.012 * size, t, 0.7, false))
      s += 1.6
    }
    planEnd = t0 + s + (skip ? 9 : 10)
  }

  function reset() {
    ops = []
    fresh = true
    dirty = true
    plan = []
    userDrop = null
    seg = null
  }

  /** Bake the oldest finished moves into the tray texture. */
  function bake(frame: Frame, force: boolean) {
    let k = 0
    while (k < ops.length && k < BAKE_N && ops[k].done) k++
    if (k === 0 && force) {
      ops[0].done = true
      k = 1
    }
    if (k === 0 || (!force && k < 8)) return
    const batch = ops.slice(0, k)
    bakeFx.set({ base: base.read.color, params: uniforms(batch, [bw, bh]) })
    frame.pass(base.write, bakeFx)
    base.swap()
    ops = ops.slice(k)
    fresh = false
    dirty = true
  }

  function uniforms(list: Op[], res: [number, number]) {
    const a: V4[] = []
    const b: V4[] = []
    const c: V4[] = []
    for (let i = 0; i < MAXOPS; i++) {
      const op = list[i]
      a.push(op ? op.a : [0, 0, 0, 0])
      b.push(op ? op.b : [0, 0, 0, 0])
      c.push(op ? op.c : [0, 0, 0, 0])
    }
    return {
      res,
      aspect: res[0] / res[1],
      n: Math.min(list.length, MAXOPS),
      baseAspect: bw / bh,
      fresh: fresh ? 1 : 0,
      baseTexel: 1 / bh,
      a,
      b,
      c,
    }
  }

  function animate(t: number) {
    for (const op of ops) {
      if (op.done) continue
      if (op.grow) {
        const k = t - op.grow.t0
        op.a[2] = op.grow.R * (1 - Math.exp(-k * 6))
        if (k > 1.3) {
          op.a[2] = op.grow.R
          op.done = true
        }
      } else if (op.pull) {
        const k = (t - op.pull.t0) / op.pull.dur
        op.c[0] = op.pull.from + (op.pull.to - op.pull.from) * ease(k)
        if (k >= 1) op.done = true
      } else if (op.draw) {
        const k = ease((t - op.draw.t0) / op.draw.dur)
        op.a[2] = op.a[0] + (op.draw.to[0] - op.a[0]) * k
        op.a[3] = op.a[1] + (op.draw.to[1] - op.a[1]) * k
        if (k >= 1) op.done = true
      }
      dirty = true
    }
  }

  /** The unseen hand stops where it is when a person takes over. */
  function freeze() {
    plan = []
    planEnd = -1
    for (const op of ops) {
      if (op !== userDrop && op !== seg) {
        op.done = true
        op.grow = undefined
        op.pull = undefined
        op.draw = undefined
      }
    }
  }

  function render(frame: Frame, tgt: Target, inputs: FrameInputs) {
    const t = inputs.time
    const dt = Math.min(Math.max(inputs.dt, 1 / 240), 1 / 20)
    const aspect = tgt.size[0] / Math.max(tgt.size[1], 1)
    const live = inputs.pointer > 0.05
    const pressed = inputs.pressed ?? false
    const hand: V2 = [inputs.mouse[0] * aspect, 1 - inputs.mouse[1]]
    const dropSize = inputs.controls.drop ?? 1
    const stylus = inputs.controls.stylus ?? 1
    if (live || pressed) lastActive = t

    if (!started) {
      started = true
      planCycle(t, aspect, true)
    }

    // A press during the skim finishes it at once.
    if (pressed && wipe >= 0) {
      wipe = -1
      reset()
    }

    // The hand: press drops paint, holding lets it spread, dragging pulls a stylus.
    if (pressed) {
      if (!wasPressed) {
        freeze()
        userTouched = true
        pressAt = hand
        pressT = t
        seg = null
        userDrop = addDrop(hand[0], hand[1], 0.001, t, false)
        userDrop.grow = undefined
        prev = hand
      }
      const jump = prev ? Math.hypot(hand[0] - prev[0], hand[1] - prev[1]) > 0.25 : false
      if (userDrop && Math.hypot(hand[0] - pressAt[0], hand[1] - pressAt[1]) > 0.012) {
        userDrop.done = true
        userDrop = null
        seg = jump ? null : addStroke(pressAt, pressAt, 0.016 * stylus, t, 0, false)
        if (seg) seg.draw = undefined
      }
      if (userDrop) {
        // Paint keeps flowing from the pipette while it is held still.
        const want = Math.min(0.13 * dropSize, (0.026 + (t - pressT) * 0.05) * dropSize)
        userDrop.a[2] += (want - userDrop.a[2]) * (1 - Math.exp(-dt * 10))
        dirty = true
      } else {
        if (jump && seg) {
          seg.done = true
          seg = null
        }
        if (!seg) {
          seg = addStroke(hand, hand, 0.016 * stylus, t, 0, false)
          seg.draw = undefined
        }
        seg.a[2] = hand[0]
        seg.a[3] = hand[1]
        dirty = true
        const dx = seg.a[2] - seg.a[0]
        const dy = seg.a[3] - seg.a[1]
        const len = Math.hypot(dx, dy)
        let turn = false
        if (prev && len > 0.025) {
          const mx = hand[0] - prev[0]
          const my = hand[1] - prev[1]
          const ml = Math.hypot(mx, my)
          if (ml > 1e-4) turn = (dx * mx + dy * my) / (len * ml) < Math.cos((25 * Math.PI) / 180)
        }
        if (len > 0.09 || turn) {
          seg.done = true
          seg = addStroke(hand, hand, 0.016 * stylus, t, 0, false)
          seg.draw = undefined
        }
      }
      prev = hand
    } else if (wasPressed) {
      if (userDrop) userDrop.done = true
      if (seg) seg.done = true
      userDrop = null
      seg = null
      prev = null
    }
    wasPressed = pressed

    // The unseen hand.
    while (plan.length && plan[0].at <= t) plan.shift()!.run(t)
    const idleLong = userTouched ? t - lastActive > 20 : planEnd >= 0 && t >= planEnd
    if (wipe < 0 && !pressed && !plan.length && idleLong && (planEnd < 0 || t >= planEnd)) {
      wipe = t
    }
    animate(t)

    // Skimming the tray between patterns.
    let front = -1
    if (wipe >= 0) {
      const k = (t - wipe) / 1.6
      front = -0.05 + (aspect + 0.13) * ease(k)
      if (k >= 1) {
        wipe = -1
        front = -1
        reset()
        userTouched = false
        planCycle(t, aspect, false)
      }
    }

    if (ops.length >= MAXOPS) bake(frame, true)
    else if (ops.length > BAKE_AT) bake(frame, false)

    if (dirty) {
      trayFx.set({ base: base.read.color, params: uniforms(ops, [cw, ch]) })
      frame.pass(cache, trayFx)
      dirty = false
    }

    hint += ((live ? (pressed ? 0.5 : 1) : 0) - hint) * (1 - Math.exp(-dt * 8))
    present.set({
      tray: cache.color,
      view: {
        res: tgt.size,
        aspect,
        time: t,
        hint: [hand[0], hand[1], 0.011, hint],
        wipe: [front, front > -1 ? 1 : 0, 0, 0],
      },
    })
    frame.pass(tgt, present)
  }

  return {
    render,
    resize(width, height) {
      const [w, h] = dims(width, height)
      if (w === cw && h === ch) return
      cw = w
      ch = h
      cache.resize([cw, ch])
      dirty = true
      // Small changes, like a phone's address bar, keep the tray; big ones start over.
      const rw = w / bw
      const rh = h / bh
      if (rw < 0.8 || rw > 1.25 || rh < 0.8 || rh > 1.25) {
        bw = w
        bh = h
        base.read.resize([bw, bh])
        base.write.resize([bw, bh])
        reset()
        wipe = -1
        userTouched = false
        started = false
      }
    },
    dispose() {
      release(cache, base.read, base.write)
    },
  }
}
