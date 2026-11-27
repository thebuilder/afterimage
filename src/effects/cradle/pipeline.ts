import { effect } from "vgpu"
import type { Frame, Target } from "vgpu"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"
import { createCradleSound } from "./sound.ts"

export interface CradleSources {
  readonly scene: Wgsl
}

/**
 * One pass, ray traced. The swing lives here: five pendulums, each a ball on
 * a line 0.72 long, integrated in small steps with real gravity on the angle
 * (not the small-angle shortcut), and where two balls meet, their speeds are
 * exchanged by sequential impulses, swept from the side the blow came from.
 * Equal steel balls swap speeds almost perfectly, so one ball in sends one
 * ball out, two send two, and the small loss at each knock slowly wakes up
 * the middle balls the way a real cradle does.
 *
 * A press on a ball takes hold of it: its angle follows the pointer's ray
 * where it crosses the plane the balls swing in, and it shoves whatever it
 * runs into. Let go and it swings. Left alone, an unseen hand lifts one end
 * and lets go, and does it again once the swing has nearly died.
 */
type V3 = [number, number, number]

const N = 5
const RB = 0.1
const LEN = 0.72
const TOP = 1.0
const G = 30 // g / L, so a swing takes about 1.15 s
const REST = Array.from({ length: N }, (_, i) => (i - 2) * 2 * RB)
const MAX_LIFT = 1.25

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

interface Camera {
  eye: V3
  look: V3
  focal: number
  shift: [number, number]
}

function camera(aspect: number, yaw: number, pitch: number): Camera {
  const look: V3 = [0, 0.43, 0]
  const dist = 3.25
  const eye: V3 = [
    look[0] + dist * Math.sin(yaw) * Math.cos(pitch),
    look[1] + dist * Math.sin(pitch),
    look[2] + dist * Math.cos(yaw) * Math.cos(pitch),
  ]
  const s = (e0: number, e1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)
  }
  // Wide screens put the cradle right of centre and leave the left for the
  // headline; tall ones pull back and set it low, under the headline.
  const focal = Math.min(2.0, Math.max(0.72, aspect * 1.6))
  return { eye, look, focal, shift: [-0.2 * s(1.0, 1.6, aspect) + 0.045 * (1 - s(0.6, 1.0, aspect)), 0.11 * (1 - s(0.8, 1.2, aspect))] }
}

function ray(cam: Camera, aspect: number, m: readonly [number, number]): V3 {
  const ww = norm(sub(cam.look, cam.eye))
  const uu = norm(cross(ww, [0, 1, 0]))
  const vv = cross(uu, ww)
  const sx = (m[0] - 0.5) * aspect + cam.shift[0]
  const sy = 0.5 - m[1] + cam.shift[1]
  return norm([
    sx * uu[0] + sy * vv[0] + cam.focal * ww[0],
    sx * uu[1] + sy * vv[1] + cam.focal * ww[1],
    sx * uu[2] + sy * vv[2] + cam.focal * ww[2],
  ])
}

export function createCradle(setup: EffectSetup, src: CradleSources): EffectInstance {
  const { gpu } = setup
  const fx = effect(gpu, src.scene)

  const th = new Float64Array(N)
  const om = new Float64Array(N)
  // The unseen hand. It starts holding the first ball up, so the cradle
  // swings at once; later it eases an end up from where it hangs and lets go.
  th[0] = -0.62
  let hand = { balls: [0], from: [-0.62], to: -0.62, start: -1, release: 0.45 }
  let handOn = true
  let nextLift = 0
  let lifts = 0

  let grab = -1
  let grabTheta = 0
  let wasPressed = false
  let lastTouch = -1e9
  let yaw = 0.44
  let pitch = 0.2
  const sound = createCradleSound()
  let armed = false
  let wasMuted: boolean | null = null

  const centre = (i: number): V3 => [REST[i] + LEN * Math.sin(th[i]), TOP - LEN * Math.cos(th[i]), 0]
  const energy = () => {
    let e = 0
    for (let i = 0; i < N; i++) e += 0.5 * om[i] * om[i] + G * (1 - Math.cos(th[i]))
    return e
  }

  /** Steps the pendulums by h, with held balls following their targets. */
  function step(h: number, frac: number, hold: (i: number) => number | null, damp: number, knocks: { v: number; x: number }) {
    for (let i = 0; i < N; i++) {
      const target = hold(i)
      if (target !== null) {
        // A held ball walks to where the hand is over the frame's substeps.
        const d = (target - th[i]) * frac
        om[i] = d / h
        th[i] += d
        continue
      }
      om[i] -= G * Math.sin(th[i]) * h
      om[i] *= Math.exp(-damp * h)
      th[i] += om[i] * h
      // The line never goes slack: past the stop, the ball just stops.
      if (Math.abs(th[i]) > MAX_LIFT + 0.1) {
        th[i] = Math.sign(th[i]) * (MAX_LIFT + 0.1)
        om[i] = 0
      }
    }
    const held = (i: number) => hold(i) !== null
    // Overlaps first: a held ball shoves, free ones part evenly.
    for (let it = 0; it < 4; it++) {
      for (let i = 0; i < N - 1; i++) {
        const o = th[i] - th[i + 1]
        if (o <= 0) continue
        if (held(i) && held(i + 1)) continue
        if (held(i)) th[i + 1] += o
        else if (held(i + 1)) th[i] -= o
        else {
          th[i] -= o / 2
          th[i + 1] += o / 2
        }
      }
    }
    // Knocks, swept from the side each blow comes from until none are left.
    const e = 0.994
    for (let sweep = 0; sweep < 12; sweep++) {
      let any = false
      const right = sweep % 2 === 0
      for (let k = 0; k < N - 1; k++) {
        const i = right ? k : N - 2 - k
        if (th[i + 1] - th[i] > 1e-4) continue
        const rel = om[i] - om[i + 1]
        if (rel <= 1e-5) continue
        any = true
        const hi = held(i)
        const hj = held(i + 1)
        if (hi && hj) continue
        // A hand does not bounce a ball off: it carries it along.
        if (hi) om[i + 1] = om[i]
        else if (hj) om[i] = om[i + 1]
        else {
          const mid = (om[i] + om[i + 1]) / 2
          om[i] = mid - (e * rel) / 2
          om[i + 1] = mid + (e * rel) / 2
        }
        const v = hi || hj ? 0 : rel * LEN
        if (v > knocks.v) {
          knocks.v = v
          knocks.x = REST[i] + RB + LEN * Math.sin(th[i])
        }
      }
      if (!any) break
    }
  }

  function render(frame: Frame, tgt: Target, inputs: FrameInputs) {
    const t = inputs.time
    const dt = Math.min(Math.max(inputs.dt, 1 / 240), 1 / 20)
    const aspect = tgt.size[0] / Math.max(tgt.size[1], 1)
    const pressed = inputs.pressed ?? false
    const live = inputs.pointer > 0.05

    // The pointer leans the camera a little round the cradle, so the
    // reflections slide over the balls; it holds still while a ball is held.
    if (grab < 0) {
      const wy = live ? 0.44 + (inputs.mouse[0] - 0.5) * 0.5 : 0.44 + Math.sin(t * 0.11) * 0.05
      const wp = live ? 0.2 + (inputs.mouse[1] - 0.5) * 0.18 : 0.2
      const k = 1 - Math.exp(-dt * (live ? 3 : 0.8))
      yaw += (wy - yaw) * k
      pitch += (wp - pitch) * k
    }
    const cam = camera(aspect, yaw, pitch)
    const rd = ray(cam, aspect, inputs.mouse)

    if (pressed && !wasPressed) {
      armed = true
      sound.wake()
      // Which ball is under the press: the nearest one the ray passes
      // through, a little generously.
      let best = Infinity
      for (let i = 0; i < N; i++) {
        const oc = sub(cam.eye, centre(i))
        const b = dot(oc, rd)
        const h = b * b - (dot(oc, oc) - (RB * 1.35) ** 2)
        if (h < 0) continue
        const tt = -b - Math.sqrt(h)
        if (tt > 0 && tt < best) {
          best = tt
          grab = i
        }
      }
      if (grab >= 0) {
        lastTouch = t
        grabTheta = th[grab]
      }
    }
    if (!pressed) grab = -1
    wasPressed = pressed

    if (grab >= 0) {
      lastTouch = t
      // Where the pointer's ray meets the plane the balls swing in.
      if (Math.abs(rd[2]) > 1e-4) {
        const s = -cam.eye[2] / rd[2]
        const px = cam.eye[0] + rd[0] * s - REST[grab]
        const py = TOP - (cam.eye[1] + rd[1] * s)
        let a = Math.atan2(px, Math.max(py, -0.3))
        a = Math.max(-MAX_LIFT, Math.min(MAX_LIFT, a))
        // A hand moves quickly but not instantly.
        const most = 7 * dt
        grabTheta += Math.max(-most, Math.min(most, a - grabTheta))
      }
    }

    // The unseen hand: once everything has nearly settled and no one has
    // touched it for a while, it lifts an end (sometimes two balls) and lets go.
    if (!handOn && t - lastTouch > 8 && t > nextLift && energy() < 0.6) {
      lifts++
      const left = lifts % 2 === 0
      const balls = (left ? [0, 1] : [4, 3]).slice(0, lifts % 3 === 2 ? 2 : 1)
      hand = { balls, from: balls.map((i) => th[i]), to: left ? -0.62 : 0.62, start: t, release: t + 1.3 }
      handOn = true
    }
    if (handOn && (t > hand.release || grab >= 0)) {
      handOn = false
      nextLift = t + 4
    }
    const handAt = (j: number) => {
      if (hand.start < 0) return hand.from[j]
      const k = Math.min(1, (t - hand.start) / 0.9)
      return hand.from[j] + (hand.to - hand.from[j]) * k * k * (3 - 2 * k)
    }
    const hold = (i: number): number | null => {
      if (i === grab) return grabTheta
      const j = handOn ? hand.balls.indexOf(i) : -1
      return j >= 0 ? handAt(j) : null
    }

    const air = inputs.controls.air ?? 0.2
    const damp = 0.012 + 0.3 * air * air + 0.02 * air
    const knocks = { v: 0, x: 0 }
    const STEPS = 16
    for (let s = 0; s < STEPS; s++) step(dt / STEPS, 1 / (STEPS - s), hold, damp, knocks)

    const ball: [number, number, number, number][] = []
    for (let i = 0; i < N; i++) {
      const c = centre(i)
      ball.push([c[0], c[1], c[2], th[i]])
    }
    fx.set({
      view: {
        res: tgt.size,
        aspect,
        time: t,
        eye: [cam.eye[0], cam.eye[1], cam.eye[2], cam.focal],
        look: [cam.look[0], cam.look[1], cam.look[2], 0],
        shift: [cam.shift[0], cam.shift[1], inputs.controls.light ?? 1, 0],
        ball,
      },
    })
    frame.pass(tgt, fx)

    const muted = (inputs.controls.muted ?? 0) > 0.5
    if (wasMuted === true && !muted) armed = true
    wasMuted = muted
    const volume = armed && !muted ? (inputs.controls.volume ?? 0.6) : 0
    sound.update(volume)
    if (volume > 0 && knocks.v > 0.03) sound.clack(knocks.v, knocks.x / 0.8)
  }

  return { render, dispose: () => sound.dispose() }
}
