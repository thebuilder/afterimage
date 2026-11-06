import { effect } from "vgpu"
import type { Frame, Target } from "vgpu"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

/**
 * One pass, but the sun is steered here rather than in the shader. Left alone
 * it circles low over the garden; the pointer takes it over, and when the
 * pointer goes quiet the sun eases back into its orbit instead of snapping.
 */
type V3 = [number, number, number]

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}
const fromAngles = (azimuth: number, elevation: number): V3 =>
  norm([Math.cos(azimuth) * Math.cos(elevation), Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation)])

export function createRaking(setup: EffectSetup, wgsl: Wgsl): EffectInstance {
  const { gpu, target } = setup
  const fx = effect(gpu, wgsl, {
    set: { params: { res: target.size, light: [0.6, 0.4, 0.3, 1], sun: [1, 0.8, 0.6, 0.3], time: 0 } },
  })

  let sun: V3 = fromAngles(2.4, 0.3)
  let hold = 0

  return {
    render(frame: Frame, tgt: Target, inputs: FrameInputs) {
      const t = inputs.time
      const dt = Math.min(inputs.dt, 1 / 20)
      const aspect = tgt.size[0] / Math.max(tgt.size[1], 1)
      const drift = inputs.controls.drift ?? 1

      // The idle sun: low and slowly circling, dipping and rising a little.
      const orbit = fromAngles(2.4 + t * 0.07 * drift, 0.3 + 0.08 * Math.sin(t * 0.045))

      // The held sun: it shines from the pointer's side of the centre, and the
      // further out the pointer goes, the lower it sinks.
      const vx = (inputs.mouse[0] - 0.5) * aspect
      const vy = 0.5 - inputs.mouse[1]
      const reach = Math.min(1, Math.hypot(vx, vy) / 0.62)
      const held = fromAngles(Math.atan2(vy, vx), 1.25 - 1.03 * reach * reach * (3 - 2 * reach))

      // Hold on to the pointer for a while after it stops, then let go slowly.
      hold = Math.max(inputs.pointer > 0.02 ? 1 : 0, hold - dt * 0.35)
      const w = hold * hold * (3 - 2 * hold)
      const want = norm([
        orbit[0] + (held[0] - orbit[0]) * w,
        orbit[1] + (held[1] - orbit[1]) * w,
        orbit[2] + (held[2] - orbit[2]) * w,
      ])
      const k = 1 - Math.exp(-dt * 5)
      sun = norm([sun[0] + (want[0] - sun[0]) * k, sun[1] + (want[1] - sun[1]) * k, sun[2] + (want[2] - sun[2]) * k])

      // A low sun is warm and dim, a high one white.
      const e = Math.max(sun[2], 0)
      const g = Math.min(1, e / 0.7)
      const colour: V3 = [1.0, 0.72 + 0.24 * g, 0.48 + 0.44 * g]

      fx.set({
        params: {
          light: [sun[0], sun[1], sun[2], 1],
          sun: [colour[0], colour[1], colour[2], e],
          time: t,
          rake: inputs.controls.rake ?? 1,
          depth: inputs.controls.depth ?? 1,
          drift,
        },
      })
      frame.pass(tgt, fx)
    },
    resize(width, height) {
      fx.set({ params: { res: [width, height] } })
    },
  }
}
