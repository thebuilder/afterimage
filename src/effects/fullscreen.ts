import { effect, sampler, target as makeTarget } from "vgpu"
import type { Frame, Target } from "vgpu"
import { release } from "./release.ts"
import type { Control, EffectInstance, EffectSetup, FrameInputs, Wgsl } from "./types"

/**
 * The whole of the scaled path's second pass: sample the offscreen render at
 * whatever size it was drawn and stretch it over the surface. Linear filtering
 * does the interpolation, so this is one texture read per output pixel.
 */
const BLIT = `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return textureSampleLevel(src, samp, uv, 0.0);
}
`

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
 *
 * `quality` below 1 renders into a smaller offscreen target and stretches it
 * over the surface. A gallery tile is displayed at thumbnail size, so paying for
 * every one of its pixels buys nothing an upscale does not.
 *
 * `renderScale` is the same lever held by the effect rather than the caller: an
 * effect that costs far more per pixel than the rest can ask to be drawn small
 * everywhere, the hero included.
 */
export function fullscreen(source: Wgsl, controls: readonly Control[] = [], renderScale = 1) {
  const defaults: Record<string, number> = {}
  for (const c of controls) defaults[c.key] = c.value

  return ({ gpu, target, quality }: EffectSetup): EffectInstance => {
    const q = Math.min(1, quality * renderScale)
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

    // Only the values that actually change every frame are written here;
    // `res` belongs to the resize path, where it changes once per resize.
    const writeFrame = (inputs: FrameInputs) => {
      const next: Record<string, unknown> = {
        mouse: inputs.mouse,
        time: inputs.time,
      }
      for (const c of controls) next[c.key] = inputs.controls[c.key] ?? c.value
      fx.set({ params: next })
    }

    // Branch once, at create time. The hero and the headless harness both run at
    // quality 1 and take the direct path: no offscreen target, no second pass,
    // no per-frame conditional to decide that. An effect with a `renderScale`
    // below 1 takes the scaled path everywhere instead.
    if (q >= 0.999) {
      return {
        render(frame: Frame, tgt: Target, inputs: FrameInputs) {
          writeFrame(inputs)
          frame.pass(tgt, fx)
        },
        resize(width, height) {
          fx.set({ params: { res: [width, height] } })
        },
      }
    }

    const dims = (w: number, h: number): [number, number] => [
      Math.max(2, Math.round(w * q)),
      Math.max(2, Math.round(h * q)),
    ]
    const [w0, h0] = dims(target.size[0], target.size[1])

    const offscreen = makeTarget(gpu, { size: [w0, h0] })
    const linear = sampler(gpu, { minFilter: "linear", magFilter: "linear" })
    const blit = effect(gpu, BLIT, { set: { samp: linear } })

    // The shader's idea of the frame is the offscreen one: `res` drives aspect
    // correction and pixel-space maths, and the surface size would skew both.
    fx.set({ params: { res: [w0, h0] } })

    let lastDims: readonly [number, number] = [w0, h0]

    return {
      render(frame: Frame, tgt: Target, inputs: FrameInputs) {
        writeFrame(inputs)
        frame.pass(offscreen, fx)
        // Re-bound every frame: a resize replaces the underlying texture.
        blit.set({ src: offscreen.color })
        frame.pass(tgt, blit)
      },
      resize(width, height) {
        const [w, h] = dims(width, height)
        // Rounding means many surface sizes land on the same scaled size, and
        // reallocating the target for those costs a texture and buys nothing.
        if (w === lastDims[0] && h === lastDims[1]) return
        lastDims = [w, h]
        offscreen.resize([w, h])
        fx.set({ params: { res: [w, h] } })
      },
      dispose() {
        release(offscreen)
      },
    }
  }
}
