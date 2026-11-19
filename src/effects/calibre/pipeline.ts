import { effect } from "vgpu"
import type { Frame, Target } from "vgpu"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

/**
 * One pass. The movement's motion is worked out here: the balance swings on a
 * sine, and every time it passes through the middle the escape wheel is let
 * go by half a tooth and the lever flicks across, so the train advances in
 * ticks. The pointer carries a lamp that eases after it; left alone the lamp
 * drifts slowly over the movement. Pressing and dragging winds the ratchet
 * wheel, which feeds power to the balance so it swings wider, and the power
 * runs down again over a minute or two.
 */
type V2 = [number, number]

/** The plate's centre in movement units, as in the shader. */
const PC: V2 = [0.02, 0.11]

/** Where the movement sits on screen, and how large. */
export function layout(aspect: number): { view: V2; scale: number } {
  if (aspect >= 1.2) return { view: [0.13 * aspect, -0.13], scale: Math.min(1, aspect / 1.7) }
  return { view: [-0.02, (0.12 * (1.2 - aspect)) / 0.74], scale: Math.min(1, Math.max(0.5, aspect * 1.1)) }
}

/** Beats per second are twice this. */
const FREQ = 1.2
/** One beat lets the escape wheel turn half a tooth of fifteen. */
const STEP = Math.PI / 15
const LEVER = 0.13

export function createCalibre(setup: EffectSetup, wgsl: Wgsl): EffectInstance {
  const { gpu, target } = setup
  const fx = effect(gpu, wgsl, {
    set: {
      params: {
        res: target.size,
        lamp: [0.2, 0.1],
        view: [0, 0],
        time: 0,
        aspect: 1,
        balance: 0,
        smear: 0,
        esc: 0,
        lever: 0,
        ratchet: 0,
        power: 1,
        scale: 1,
        _p0: 0,
      },
    },
  })

  let lamp: V2 | null = null
  let phase = 0
  let amp = 2.6
  let wound = 0.45
  let ratchet = 0
  let prevHand: V2 | null = null
  let lastActive = -10

  return {
    render(frame: Frame, tgt: Target, inputs: FrameInputs) {
      const t = inputs.time
      const dt = Math.min(Math.max(inputs.dt, 1 / 240), 1 / 20)
      const aspect = tgt.size[0] / Math.max(tgt.size[1], 1)
      const { view, scale } = layout(aspect)
      const rate = inputs.controls.rate ?? 1
      const live = inputs.pointer > 0.05
      const pressed = inputs.pressed ?? false
      const hand: V2 = [((inputs.mouse[0] - 0.5) * aspect - view[0]) / scale + PC[0], (0.5 - inputs.mouse[1] - view[1]) / scale + PC[1]]
      if (live || pressed) lastActive = t

      // The lamp: in the hand while the pointer moves, drifting when idle.
      const idle: V2 = [0.18 + 0.42 * Math.sin(t * 0.21), 0.06 + 0.24 * Math.sin(t * 0.29 + 1.1)]
      const away = Math.min(1, Math.max(0, (t - lastActive - 2) / 3))
      const want: V2 = live || away < 1 ? [hand[0] + (idle[0] - hand[0]) * away, hand[1] + (idle[1] - hand[1]) * away] : idle
      if (!lamp) lamp = t < 1 && !live ? idle : want
      const k = 1 - Math.exp(-dt * (live ? 14 : 3))
      lamp = [lamp[0] + (want[0] - lamp[0]) * k, lamp[1] + (want[1] - lamp[1]) * k]

      // Winding: a drag turns the ratchet wheel and feeds the balance.
      if (pressed && prevHand) {
        const moved = Math.hypot(hand[0] - prevHand[0], hand[1] - prevHand[1])
        if (moved < 0.3) {
          ratchet += moved * 2.2
          wound = Math.min(1, wound + moved * 0.25)
        }
      }
      prevHand = pressed ? hand : null
      wound = Math.max(0.2, wound - dt * 0.004)
      const ampWant = 1.7 + 2.6 * wound
      amp += (ampWant - amp) * (1 - Math.exp(-dt * 1.5))

      // The balance and the escapement.
      const f = FREQ * rate
      phase += f * dt
      const s = 2 * Math.PI * phase
      const balance = amp * Math.sin(s)
      const smear = amp * 2 * Math.PI * f * Math.cos(s) * dt
      const beats = Math.floor(2 * phase)
      const u = 2 * phase - beats
      const snap = u < 0.12 ? (u / 0.12) * (u / 0.12) * (3 - (2 * u) / 0.12) : 1
      const esc = -(beats + snap) * STEP
      const side = (b: number) => (b % 2 === 0 ? 1 : -1)
      const lever = LEVER * (side(beats - 1) + (side(beats) - side(beats - 1)) * snap)

      fx.set({
        params: {
          res: tgt.size,
          lamp,
          time: t,
          aspect,
          balance,
          smear,
          esc,
          lever,
          ratchet,
          power: inputs.controls.lamp ?? 1,
          view,
          scale,
        },
      })
      frame.pass(tgt, fx)
    },
    resize(width, height) {
      fx.set({ params: { res: [width, height] } })
    },
  }
}
