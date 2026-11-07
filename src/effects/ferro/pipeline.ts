import { effect } from "vgpu"
import type { Frame, Target } from "vgpu"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

/**
 * One pass. The magnet and the pool it drags are steered here: the magnet
 * follows the pointer (or circles on its own when nobody is there), and the
 * pool's centre chases it on a damped spring, so a quick move pulls the fluid
 * out into a tail before it catches up.
 */
type V2 = [number, number]

export function createFerro(setup: EffectSetup, wgsl: Wgsl): EffectInstance {
  const { gpu, target } = setup
  const fx = effect(gpu, wgsl, {
    set: { params: { res: target.size, magnet: [0.2, 0.05], pool: [0.2, 0.05], time: 0 } },
  })

  let pool: V2 | null = null
  let vel: V2 = [0, 0]
  let magnet: V2 | null = null
  let hold = 0

  return {
    render(frame: Frame, tgt: Target, inputs: FrameInputs) {
      const t = inputs.time
      const dt = Math.min(inputs.dt, 1 / 20)
      const aspect = tgt.size[0] / Math.max(tgt.size[1], 1)
      const pull = inputs.controls.pull ?? 1

      // Left alone, the magnet wanders a slow loop right of centre, clear of the title.
      // Same zoom as the shader: narrow screens see more of the plinth.
      const zoom = Math.min(1, Math.max(0.55, aspect / 1.3))
      const halfW = (0.5 * aspect) / zoom
      const cx = Math.min(0.22, halfW * 0.24)
      const swing = Math.min(0.12, halfW * 0.2)
      const idle: V2 = [cx + swing * Math.cos(t * 0.31), 0.04 + 0.09 * Math.sin(t * 0.47)]
      // The pointer, mapped onto the plinth through the tilted camera.
      const hand: V2 = [((inputs.mouse[0] - 0.5) * aspect) / zoom, (0.5 - inputs.mouse[1]) / zoom / Math.sin(0.82) + 0.04]

      hold = Math.max(inputs.pointer > 0.02 ? 1 : 0, hold - dt * 0.4)
      const w = hold * hold * (3 - 2 * hold)
      const want: V2 = [idle[0] + (hand[0] - idle[0]) * w, idle[1] + (hand[1] - idle[1]) * w]
      // The magnet itself moves smoothly even when the pointer jumps.
      magnet ??= want
      const km = 1 - Math.exp(-dt * 14)
      magnet = [magnet[0] + (want[0] - magnet[0]) * km, magnet[1] + (want[1] - magnet[1]) * km]

      // The pool follows on a damped spring: Pull makes it slower and stretchier.
      pool ??= [magnet[0], magnet[1]]
      const stiff = 9 / pull
      const damp = 2 * Math.sqrt(stiff) * 0.85
      vel = [
        vel[0] + ((magnet[0] - pool[0]) * stiff - vel[0] * damp) * dt,
        vel[1] + ((magnet[1] - pool[1]) * stiff - vel[1] * damp) * dt,
      ]
      pool = [pool[0] + vel[0] * dt, pool[1] + vel[1] * dt]

      fx.set({
        params: {
          magnet,
          pool,
          time: t,
          field: inputs.controls.field ?? 1,
          spikes: inputs.controls.spikes ?? 1,
          pull,
        },
      })
      frame.pass(tgt, fx)
    },
    resize(width, height) {
      fx.set({ params: { res: [width, height] } })
    },
  }
}
