import { effect } from "vgpu"
import type { Frame, Target } from "vgpu"
import type { Control, EffectInstance, EffectSetup, FrameInputs, Wgsl } from "./types"

/**
 * The common case: one fragment shader over the whole target.
 *
 * Every single-pass shader in this set declares the same uniform block, so they
 * share one adapter instead of one wrapper each.
 *
 * ```wgsl
 * struct Params { res: vec2f, mouse: vec2f, time: f32, ...one f32 per control }
 * ```
 *
 * Every declared control becomes a `Params` member of the same name, so adding a
 * knob is one line in the registry and one `f32` in the shader.
 */
export function fullscreen(source: Wgsl, controls: readonly Control[] = []) {
  const defaults: Record<string, number> = {}
  for (const c of controls) defaults[c.key] = c.value

  return ({ gpu, target }: EffectSetup): EffectInstance => {
    const fx = effect(gpu, source, {
      set: {
        params: {
          res: target.size,
          mouse: [0.5, 0.45],
          time: 0,
          ...defaults,
        },
      },
    })
    return {
      render(frame: Frame, tgt: Target, inputs: FrameInputs) {
        // Only the values that actually change every frame are written here;
        // `res` belongs to the resize path, where it changes once per resize.
        const next: Record<string, unknown> = {
          mouse: inputs.mouse,
          time: inputs.time,
        }
        for (const c of controls) next[c.key] = inputs.controls[c.key] ?? c.value
        fx.set({ params: next })
        frame.pass(tgt, fx)
      },
      resize(width, height) {
        fx.set({ params: { res: [width, height] } })
      },
    }
  }
}
