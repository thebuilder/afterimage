import { effect } from "vgpu"
import type { Frame, Target } from "vgpu"
import type { EffectInstance, EffectSetup, Wgsl, FrameInputs } from "../types"

/**
 * One pass. The two sheets are placed here: the lower one sits right of
 * centre, and the upper one rides a light spring toward a point just off the
 * lower one's centre. The pointer sets that point, scaled down hard, because
 * a shift of a single ring width already moves every fringe across the disc.
 * Left alone, the upper sheet drifts on a slow loop.
 */
type V2 = [number, number]

/** How far the upper sheet may slide off centre, in screen units. */
const MAX_SHIFT = 0.11
/** Pointer travel to sheet travel. */
const GAIN = 0.16

export function layout(aspect: number): { base: V2; radius: number } {
  const halfW = 0.5 * aspect
  const radius = Math.min(0.36, halfW * 0.86)
  // Wide screens push the sheets right, clear of the headline; narrow ones centre them low.
  const x = Math.max(0, Math.min(0.2 * aspect, halfW - radius - 0.06))
  const y = aspect < 0.9 ? -0.12 : 0
  return { base: [x, y], radius }
}

export function createMoire(setup: EffectSetup, wgsl: Wgsl): EffectInstance {
  const { gpu, target } = setup
  const fx = effect(gpu, wgsl, {
    set: { params: { res: target.size, base: [0.3, 0], top: [0.3, 0], radius: 0.36, time: 0, pitch: 0.0085, scale: 1 } },
  })

  let top: V2 | null = null
  let vel: V2 = [0, 0]
  let hold = 0

  return {
    render(frame: Frame, tgt: Target, inputs: FrameInputs) {
      const t = inputs.time
      const dt = Math.min(inputs.dt, 1 / 20)
      const aspect = tgt.size[0] / Math.max(tgt.size[1], 1)
      const { base, radius } = layout(aspect)

      // Idle: a slow, uneven loop, so the fringes keep turning over on their own.
      const idle: V2 = [0.032 * Math.cos(t * 0.23) + 0.01 * Math.sin(t * 0.61), 0.024 * Math.sin(t * 0.31)]
      const hand: V2 = [(inputs.mouse[0] - 0.5) * aspect, 0.5 - inputs.mouse[1]]
      let shift: V2 = [(hand[0] - base[0]) * GAIN, (hand[1] - base[1]) * GAIN]
      const len = Math.hypot(shift[0], shift[1])
      if (len > MAX_SHIFT) shift = [(shift[0] * MAX_SHIFT) / len, (shift[1] * MAX_SHIFT) / len]

      hold = Math.max(inputs.pointer > 0.02 ? 1 : 0, hold - dt * 0.35)
      const w = hold * hold * (3 - 2 * hold)
      const want: V2 = [base[0] + idle[0] + (shift[0] - idle[0]) * w, base[1] + idle[1] + (shift[1] - idle[1]) * w]

      // A stiff, slightly underdamped spring: the sheet keeps up with the hand
      // but settles with a small sway, like acetate sliding on glass.
      top ??= want
      const stiff = 90
      const damp = 2 * Math.sqrt(stiff) * 0.7
      vel = [vel[0] + ((want[0] - top[0]) * stiff - vel[0] * damp) * dt, vel[1] + ((want[1] - top[1]) * stiff - vel[1] * damp) * dt]
      top = [top[0] + vel[0] * dt, top[1] + vel[1] * dt]

      fx.set({
        params: {
          base,
          top,
          radius,
          time: t,
          pitch: 0.0085 / (inputs.controls.pitch ?? 1),
          scale: inputs.controls.scale ?? 1.02,
        },
      })
      frame.pass(tgt, fx)
    },
    resize(width, height) {
      fx.set({ params: { res: [width, height] } })
    },
  }
}
