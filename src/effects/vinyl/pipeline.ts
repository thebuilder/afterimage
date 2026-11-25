import { effect } from "vgpu"
import type { Frame, Target } from "vgpu"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"
import { createDeckSound } from "./sound.ts"

export interface VinylSources {
  readonly deck: Wgsl
}

/**
 * One pass. The record's spin lives here: the motor pulls it toward the set
 * speed, clockwise, and a hand pressed on the record takes it over, turning
 * it exactly as far as the hand goes around the spindle, so it can be held,
 * dragged back and thrown. Let go and the motor brings it back up to speed.
 * The lamp stands still; the pointer moves the viewer's head over the deck,
 * which swings the light on the grooves, and the head sways a little when no
 * one is there. The deck's own hardware works: START stops and starts the
 * motor, 33 and 45 pick the speed, and the pitch fader trims it by up to 8%.
 * The tonearm's geometry is solved here from the needle's
 * radius, which sways a little with the record's eccentricity.
 */
type V2 = [number, number]

function layout(aspect: number): { C: V2; R: number; P: V2 } {
  if (aspect >= 1) {
    const R = 0.4
    const C: V2 = [aspect * 0.5 + 0.06, 0.5]
    return { C, R, P: [C[0] + R * 1.22, C[1] + R * 0.72] }
  }
  const R = aspect * 0.47
  const C: V2 = [aspect * 0.47, 0.56]
  return { C, R, P: [C[0] + R * 1.22, C[1] + R * 0.72] }
}

/** The keys and the fader, placed exactly where the shader draws them. */
function hardware(aspect: number, C: V2, R: number, P: V2) {
  const bc: V2 = aspect >= 1 ? [C[0] - R * 1.22, C[1] + R * 0.86] : [C[0] - R * 0.5, C[1] + R * 1.25]
  const keys = [0, 1, 2].map((b) => ({
    at: [bc[0] + b * R * 0.22 - (b === 0 ? R * 0.08 : 0), bc[1]] as V2,
    sz: (b === 0 ? [R * 0.11, R * 0.065] : [R * 0.07, R * 0.045]) as V2,
  }))
  const fc: V2 = [P[0] + R * 0.32, P[1] - R * 0.75]
  return { keys, fc }
}

export function createVinyl(setup: EffectSetup, src: VinylSources): EffectInstance {
  const { gpu } = setup
  const fx = effect(gpu, src.deck)

  let angle = 0
  let omega = 0
  let held = false
  let wasPressed = false
  let handAngle = 0
  let gaze: V2 | null = null // the viewer's head offset, in record radii
  let started = false
  let running = true
  let is45 = false
  let pitch = 0
  let onFader = false
  let pressedKey = -1
  const sound = createDeckSound()
  // Sound waits for a press on the deck or the sound toggle turned on.
  let armed = false
  let wasMuted: boolean | null = null

  function render(frame: Frame, tgt: Target, inputs: FrameInputs) {
    const t = inputs.time
    const dt = Math.min(Math.max(inputs.dt, 1 / 240), 1 / 20)
    const aspect = tgt.size[0] / Math.max(tgt.size[1], 1)
    const { C, R, P } = layout(aspect)
    const rpm = (is45 ? 45 : 100 / 3) * (1 + 0.08 * pitch)
    const motor = running ? (-rpm * 2 * Math.PI) / 60 : 0
    if (!started) {
      started = true
      omega = motor
    }

    const live = inputs.pointer > 0.05
    const pressed = inputs.pressed ?? false
    const hand: V2 = [inputs.mouse[0] * aspect, 1 - inputs.mouse[1]]
    const hx = hand[0] - C[0]
    const hy = hand[1] - C[1]
    const onRecord = Math.hypot(hx, hy) < R * 1.03
    const a = Math.atan2(hy, hx)
    const { keys, fc } = hardware(aspect, C, R, P)

    // A press lands on a key, the fader, or the record.
    if (pressed && !wasPressed) {
      armed = true
      sound.wake()
      pressedKey = keys.findIndex(
        (k) => Math.abs(hand[0] - k.at[0]) < k.sz[0] + R * 0.02 && Math.abs(hand[1] - k.at[1]) < k.sz[1] + R * 0.02
      )
      if (pressedKey === 0) running = !running
      if (pressedKey === 1) is45 = false
      if (pressedKey === 2) is45 = true
      if (pressedKey >= 0) sound.click()
      onFader = pressedKey < 0 && Math.abs(hand[0] - fc[0]) < R * 0.1 && Math.abs(hand[1] - fc[1]) < R * 0.42
      held = pressedKey < 0 && !onFader && onRecord
    }
    if (!pressed) {
      held = false
      onFader = false
      pressedKey = -1
    }
    wasPressed = pressed
    if (onFader) {
      const v = Math.min(1, Math.max(-1, (hand[1] - fc[1]) / (R * 0.32)))
      // It clicks into the centre detent.
      pitch = Math.abs(v) < 0.06 ? 0 : v
    }
    let drag = 0
    if (held) {
      let d = a - handAngle
      while (d > Math.PI) d -= 2 * Math.PI
      while (d < -Math.PI) d += 2 * Math.PI
      // Very near the spindle the angle jumps about; hold still there.
      if (Math.hypot(hx, hy) < R * 0.12) d = 0
      angle += d
      omega += (d / dt - omega) * (1 - Math.exp(-dt * 20))
      drag = 1
    } else {
      // The motor's pull: firm, so it is back up to speed in about half a
      // second; stopped, the brake brings it to rest in about a second.
      omega += (motor - omega) * (1 - Math.exp(-dt * (running ? 4.5 : 3)))
      angle += omega * dt
    }
    handAngle = a
    if (angle > 1e4 || angle < -1e4) angle %= 2 * Math.PI

    // The lamp stands still. Your hand moves your head over the deck, so the
    // light on the grooves swings the way it does when you lean in to look;
    // left alone, the head sways a little, as anyone's does.
    const idle: V2 = [Math.sin(t * 0.23) * 0.5 + Math.sin(t * 0.11 + 1) * 0.25, Math.sin(t * 0.17 + 2) * 0.35]
    let want = idle
    if (live) {
      const tx = (hand[0] - C[0]) / R
      const ty = (hand[1] - C[1]) / R
      const m = Math.hypot(tx, ty)
      const s = m > 1.4 ? 1.4 / m : 1
      want = [tx * s, ty * s]
    }
    if (!gaze) gaze = idle
    const k = 1 - Math.exp(-dt * (live ? 5 : 1.5))
    gaze = [gaze[0] + (want[0] - gaze[0]) * k, gaze[1] + (want[1] - gaze[1]) * k]

    // The tonearm: the needle sits on a circle around the pivot, where it
    // meets its groove; the groove sways with the record's eccentricity.
    const rn = R * (0.74 + 0.004 * Math.sin(angle))
    const dx = P[0] - C[0]
    const dy = P[1] - C[1]
    const d = Math.hypot(dx, dy)
    const Larm = R * 1.15
    const along = (d * d + rn * rn - Larm * Larm) / (2 * d)
    const h = Math.sqrt(Math.max(0, rn * rn - along * along))
    const ux = dx / d
    const uy = dy / d
    // Of the two crossings, the one in front of the pivot line.
    const n1: V2 = [C[0] + ux * along + uy * h, C[1] + uy * along - ux * h]
    const n2: V2 = [C[0] + ux * along - uy * h, C[1] + uy * along + ux * h]
    const N = n1[1] < n2[1] ? n1 : n2
    // The headshell turns in toward the spindle by its offset angle.
    const ax = N[0] - P[0]
    const ay = N[1] - P[1]
    const base = Math.atan2(ay, ax)
    const toC = Math.atan2(C[1] - N[1], C[0] - N[0])
    let turn = toC - base
    while (turn > Math.PI) turn -= 2 * Math.PI
    while (turn < -Math.PI) turn += 2 * Math.PI
    const offset = Math.sign(turn) * 0.4
    const hd: V2 = [Math.cos(base + offset), Math.sin(base + offset)]
    const J: V2 = [N[0] - hd[0] * R * 0.17, N[1] - hd[1] * R * 0.17]

    fx.set({
      view: {
        res: tgt.size,
        aspect,
        time: t,
        angle,
        running: running ? 1 : 0,
        is45: is45 ? 1 : 0,
        pitch,
        lamp: [C[0] - R * 0.95, C[1] + R * 1.05, R * 2.8, inputs.controls.lamp ?? 1],
        rec: [C[0], C[1], R, rn],
        arm: [P[0], P[1], J[0], J[1]],
        head: [N[0], N[1], hd[0], hd[1]],
        eye: [C[0] + gaze[0] * R * 1.3, C[1] + gaze[1] * R * 1.3, R * 5, 0],
      },
    })
    frame.pass(tgt, fx)

    const muted = (inputs.controls.muted ?? 0) > 0.5
    // Turning the toggle on is a press too, so it may start the sound.
    if (wasMuted === true && !muted) armed = true
    wasMuted = muted
    sound.update(armed && !muted ? (inputs.controls.volume ?? 0.6) : 0, omega / ((-100 / 3) * 2 * Math.PI / 60), drag)
  }

  return { render, dispose: () => sound.dispose() }
}
