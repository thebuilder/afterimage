import { effect } from "vgpu"
import type { Frame, Target } from "vgpu"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

export interface VinylSources {
  readonly deck: Wgsl
}

/**
 * One pass. The record's spin lives here: the motor pulls it toward the set
 * speed, clockwise, and a hand pressed on the record takes it over, turning
 * it exactly as far as the hand goes around the spindle, so it can be held,
 * dragged back and thrown. Let go and the motor brings it back up to speed.
 * The lamp follows the pointer, or wanders slowly around the deck when no
 * one is there. The tonearm's geometry is solved here from the needle's
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

export function createVinyl(setup: EffectSetup, src: VinylSources): EffectInstance {
  const { gpu } = setup
  const fx = effect(gpu, src.deck)

  let angle = 0
  let omega = 0
  let held = false
  let wasPressed = false
  let handAngle = 0
  let lamp: V2 | null = null
  let started = false

  function render(frame: Frame, tgt: Target, inputs: FrameInputs) {
    const t = inputs.time
    const dt = Math.min(Math.max(inputs.dt, 1 / 240), 1 / 20)
    const aspect = tgt.size[0] / Math.max(tgt.size[1], 1)
    const { C, R, P } = layout(aspect)
    const rpm = inputs.controls.rpm ?? 33.3
    const motor = (-rpm * 2 * Math.PI) / 60
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

    // A hand on the record: it turns as far as the hand goes around the spindle.
    if (pressed && !wasPressed && onRecord) held = true
    if (!pressed) held = false
    wasPressed = pressed
    if (held) {
      let d = a - handAngle
      while (d > Math.PI) d -= 2 * Math.PI
      while (d < -Math.PI) d += 2 * Math.PI
      // Very near the spindle the angle jumps about; hold still there.
      if (Math.hypot(hx, hy) < R * 0.12) d = 0
      angle += d
      omega += (d / dt - omega) * (1 - Math.exp(-dt * 20))
    } else {
      // The motor's pull: firm, so it is back up to speed in about half a second.
      omega += (motor - omega) * (1 - Math.exp(-dt * 4.5))
      angle += omega * dt
    }
    handAngle = a
    if (angle > 1e4 || angle < -1e4) angle %= 2 * Math.PI

    // The lamp follows the hand, or wanders slowly around the deck.
    const ph = t * 0.21 + 2.0
    const idle: V2 = [C[0] + Math.cos(ph) * R * 1.0, C[1] + Math.sin(ph) * R * 0.75]
    const want = live ? hand : idle
    if (!lamp) lamp = idle
    const k = 1 - Math.exp(-dt * (live ? 7 : 1.5))
    lamp = [lamp[0] + (want[0] - lamp[0]) * k, lamp[1] + (want[1] - lamp[1]) * k]

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
        lampOn: rpm > 0.5 ? 1 : 0,
        _p0: 0,
        _p1: 0,
        lamp: [lamp[0], lamp[1], R * 2.4, inputs.controls.lamp ?? 1],
        rec: [C[0], C[1], R, rn],
        arm: [P[0], P[1], J[0], J[1]],
        head: [N[0], N[1], hd[0], hd[1]],
      },
    })
    frame.pass(tgt, fx)
  }

  return { render }
}
