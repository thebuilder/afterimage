import { effect } from "vgpu"
import type { Frame, Target } from "vgpu"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

export interface MobileSources {
  readonly scene: Wgsl
}

/**
 * One pass. The mobile lives here: a chain of six wire arms, each hung by a
 * wire from the end of the one above and free to turn about it. Every arm
 * carries a painted plate at one end and the rest of the chain at the other,
 * and its pivot sits where the two balance, so the proportions come from the
 * plates' weights the way a sculptor finds them, by balancing.
 *
 * Each arm turns under the torque of the air on the plates it carries,
 * resisted by its own inertia, the faint twist of its wire and the drag of
 * the air. Moving the pointer stirs the air: a sweep pushes the plates near
 * it, and the push reaches up the chain, weaker at each arm. Press a plate
 * and drag sideways to turn it by hand. Left alone, slow room currents keep
 * everything turning.
 */
type V3 = [number, number, number]
type V4 = [number, number, number, number]

interface Plate {
  a: number
  b: number
  warp: number
  turn: number
  color: V3
  gloss: number
  facing: number // angle of the plate's plane to its arm
}

// Red, black, yellow, blue, white, red, black: enamel on sheet steel.
const PLATES: Plate[] = [
  { a: 0.21, b: 0.14, warp: 0.22, turn: 0.25, color: [0.55, 0.05, 0.03], gloss: 0.6, facing: 0.15 },
  { a: 0.16, b: 0.11, warp: -0.18, turn: -0.4, color: [0.025, 0.025, 0.028], gloss: 0.9, facing: 1.2 },
  { a: 0.13, b: 0.1, warp: 0.1, turn: 0.6, color: [0.78, 0.52, 0.05], gloss: 0.5, facing: -0.5 },
  { a: 0.115, b: 0.085, warp: -0.25, turn: 0.1, color: [0.05, 0.12, 0.42], gloss: 0.6, facing: 0.9 },
  { a: 0.1, b: 0.075, warp: 0.2, turn: -0.3, color: [0.82, 0.8, 0.76], gloss: 0.5, facing: -1.0 },
  { a: 0.08, b: 0.065, warp: -0.15, turn: 0.5, color: [0.55, 0.05, 0.03], gloss: 0.6, facing: 0.4 },
  { a: 0.07, b: 0.055, warp: 0.2, turn: -0.2, color: [0.025, 0.025, 0.028], gloss: 0.9, facing: -0.7 },
]
const BARS = [0.98, 0.8, 0.66, 0.55, 0.45, 0.36]
const ARMS = BARS.length
const TOP_Y = 1.12

interface Arm {
  /** Lever to the plate end and to the far end. */
  la: number
  lb: number
  drop: number // to the next arm below the far end
  mass: number
  inertia: number
}

function build(): Arm[] {
  const mass = PLATES.map((p) => p.a * p.b * 3.2)
  const arms: Arm[] = []
  // From the bottom up: the last arm carries the last two plates.
  let below = mass[ARMS]
  let belowI = 0
  for (let k = ARMS - 1; k >= 0; k--) {
    const mA = mass[k]
    const mB = below
    const L = BARS[k]
    const la = (L * mB) / (mA + mB)
    const lb = L - la
    const drop = k === ARMS - 1 ? 0 : 2 * PLATES[k].b + 0.075
    arms[k] = { la, lb, drop, mass: mA + mB, inertia: mA * la * la + mB * lb * lb + belowI * 0.5 }
    below = mA + mB
    belowI = arms[k].inertia
  }
  return arms
}

interface Camera {
  eye: V3
  look: V3
  focal: number
  shift: [number, number]
}

function camera(aspect: number, lean: [number, number]): Camera {
  const s = (e0: number, e1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)
  }
  const look: V3 = [0, 0.3, 0]
  const eye: V3 = [lean[0] * 0.35, 0.42 + lean[1] * 0.15, 3.4]
  // Wide screens hang the piece right of centre, leaving the left wall for the
  // headline; tall ones pull back and keep it under the top.
  const focal = Math.min(1.75, Math.max(0.9, aspect * 1.55))
  return { eye, look, focal, shift: [-0.24 * s(1.0, 1.6, aspect), 0.04 * (1 - s(0.8, 1.2, aspect))] }
}

const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

function ray(cam: Camera, aspect: number, m: readonly [number, number]): V3 {
  const ww = norm([cam.look[0] - cam.eye[0], cam.look[1] - cam.eye[1], cam.look[2] - cam.eye[2]])
  const uu = norm(cross(ww, [0, 1, 0]))
  const vv = cross(uu, ww)
  const sx = (m[0] - 0.5) * aspect + cam.shift[0]
  const sy = 0.5 - m[1] + cam.shift[1]
  return norm([0, 1, 2].map((i) => sx * uu[i] + sy * vv[i] + cam.focal * ww[i]) as V3)
}

export function createMobile(setup: EffectSetup, src: MobileSources): EffectInstance {
  const { gpu } = setup
  const fx = effect(gpu, src.scene)
  const arms = build()

  // Each arm's heading, and how fast it turns. They start spread out and
  // already moving, so the piece is alive from the first frame.
  const phi = Float64Array.from({ length: ARMS }, (_, k) => [0.35, 2.2, -0.8, 1.6, -2.4, 0.9][k])
  const rest = Float64Array.from(phi)
  const om = Float64Array.from({ length: ARMS }, (_, k) => [0.12, -0.18, 0.22, -0.15, 0.25, -0.3][k])

  let lean: [number, number] = [0, 0]
  let last: [number, number] | null = null
  let grab = -1
  let wasPressed = false

  /** Lays the chain out from the arm headings. */
  function layout() {
    const pivots: V3[] = []
    const plates: { c: V3; facing: number }[] = []
    const wires: [V3, V3][] = []
    let p: V3 = [0.0, TOP_Y, 0]
    // The hanger from the ceiling.
    wires.push([[0, 3, 0], p])
    for (let k = 0; k < ARMS; k++) {
      const a = arms[k]
      const d: V3 = [Math.cos(phi[k]), 0, Math.sin(phi[k])]
      pivots.push(p)
      const A: V3 = [p[0] + d[0] * a.la, p[1], p[2] + d[2] * a.la]
      const B: V3 = [p[0] - d[0] * a.lb, p[1], p[2] - d[2] * a.lb]
      // The bar arches a little over its pivot, as bent wire does.
      const mid: V3 = [p[0], p[1] + 0.012, p[2]]
      wires.push([A, mid], [mid, B])
      const hang = (end: V3, i: number, facing: number) => {
        const pl = PLATES[i]
        const c: V3 = [end[0], end[1] - pl.b * 0.92 - 0.015, end[2]]
        plates[i] = { c, facing }
        wires.push([end, [c[0], c[1] + pl.b * 0.8, c[2]]])
      }
      hang(A, k, phi[k] + PLATES[k].facing)
      if (k === ARMS - 1) hang(B, k + 1, phi[k] + PLATES[k + 1].facing)
      else {
        const next: V3 = [B[0], B[1] - a.drop, B[2]]
        wires.push([B, next])
        p = next
      }
    }
    return { pivots, plates, wires }
  }

  function render(frame: Frame, tgt: Target, inputs: FrameInputs) {
    const t = inputs.time
    const dt = Math.min(Math.max(inputs.dt, 1 / 240), 1 / 20)
    const aspect = tgt.size[0] / Math.max(tgt.size[1], 1)
    const live = inputs.pointer > 0.05
    const pressed = inputs.pressed ?? false

    const want: [number, number] = live && grab < 0 ? [inputs.mouse[0] - 0.5, 0.5 - inputs.mouse[1]] : [0, 0]
    const kl = 1 - Math.exp(-dt * 1.5)
    lean = [lean[0] + (want[0] - lean[0]) * kl, lean[1] + (want[1] - lean[1]) * kl]
    const cam = camera(aspect, lean)
    const L = layout()

    // Where the pointer is in the air the piece hangs in.
    const rd = ray(cam, aspect, inputs.mouse)
    const s = -cam.eye[2] / rd[2]
    const hand: [number, number] = [cam.eye[0] + rd[0] * s, cam.eye[1] + rd[1] * s]
    const vel: [number, number] = last && live ? [(hand[0] - last[0]) / dt, (hand[1] - last[1]) / dt] : [0, 0]
    last = live ? hand : null

    if (pressed && !wasPressed) {
      // The plate under the press, judged on its centre and size.
      let best = Infinity
      grab = -1
      L.plates.forEach((pl, i) => {
        const d = Math.hypot(hand[0] - pl.c[0], hand[1] - pl.c[1])
        if (d < PLATES[i].a * 1.1 && d < best) {
          best = d
          grab = i
        }
      })
    }
    if (!pressed) grab = -1
    wasPressed = pressed

    const torque = new Float64Array(ARMS)
    // Slow room air: every arm feels its own gentle, wandering push.
    for (let k = 0; k < ARMS; k++) {
      torque[k] += arms[k].inertia * 0.05 * (Math.sin(t * (0.07 + k * 0.023) + k * 1.7) + 0.6 * Math.sin(t * (0.13 + k * 0.031) + k))
    }
    // The hand's air: a sweep pushes the plates near it, broadside ones most.
    const speed = Math.hypot(vel[0], vel[1])
    if (speed > 0.01) {
      L.plates.forEach((pl, i) => {
        const r = Math.hypot(hand[0] - pl.c[0], hand[1] - pl.c[1])
        const fall = Math.exp(-(r * r) / (2 * 0.22 * 0.22))
        if (fall < 0.01) return
        const pv = PLATES[i]
        const n: V3 = [-Math.sin(pl.facing), 0, Math.cos(pl.facing)]
        // The air moves with the hand and is pushed toward the wall.
        const F: V3 = [vel[0], 0, -0.35 * speed]
        const face = Math.abs(n[0] * F[0] + n[2] * F[2]) / (Math.hypot(F[0], F[2]) || 1)
        const k = 0.9 * pv.a * pv.b * fall * (0.25 + face)
        const arm = Math.min(i, ARMS - 1)
        for (let j = arm, w = 1; j >= 0; j--, w *= 0.35) {
          const pv2 = L.pivots[j]
          const rx = pl.c[0] - pv2[0]
          const rz = pl.c[2] - pv2[2]
          torque[j] += w * k * (rz * F[0] - rx * F[2])
        }
      })
    }
    // A hand on a plate turns its arm to bring the plate under the pointer.
    if (grab >= 0) {
      const k = Math.min(grab, ARMS - 1)
      const pv = L.pivots[k]
      const pl = L.plates[grab]
      const rz = pl.c[2] - pv[2]
      // d(plate x)/d(heading) is -rz; push the heading the way that closes the gap.
      const err = hand[0] - pl.c[0]
      torque[k] += arms[k].inertia * (-rz * err * 60 - om[k] * 4)
    }

    const air = inputs.controls.air ?? 0.5
    const drag = 0.05 + 0.5 * air
    const STEPS = 4
    const h = dt / STEPS
    for (let n = 0; n < STEPS; n++) {
      for (let k = 0; k < ARMS; k++) {
        const I = arms[k].inertia
        // The wire's twist is faint: it only brings the arm home over minutes.
        const twist = -0.004 * I * Math.sin(phi[k] - rest[k])
        om[k] += ((torque[k] + twist) / I - drag * om[k]) * h
        om[k] = Math.max(-4, Math.min(4, om[k]))
        phi[k] += om[k] * h
      }
    }

    const plate: V4[] = []
    const shape: V4[] = []
    const paint: V4[] = []
    L.plates.forEach((pl, i) => {
      const p = PLATES[i]
      plate.push([pl.c[0], pl.c[1], pl.c[2], pl.facing])
      shape.push([p.a, p.b, p.warp, p.turn])
      paint.push([p.color[0], p.color[1], p.color[2], p.gloss])
    })
    const wire: V4[] = []
    for (const [a, b] of L.wires) wire.push([a[0], a[1], a[2], 0], [b[0], b[1], b[2], 0])
    const wires = L.wires.length
    while (wire.length < 64) wire.push([0, 0, 0, 0])

    fx.set({
      view: {
        res: tgt.size,
        aspect,
        time: t,
        eye: [cam.eye[0], cam.eye[1], cam.eye[2], cam.focal],
        look: [cam.look[0], cam.look[1], cam.look[2], wires],
        shift: [cam.shift[0], cam.shift[1], inputs.controls.light ?? 1, 0],
        plate,
        shape,
        paint,
        wire,
      },
    })
    frame.pass(tgt, fx)
  }

  return { render }
}
