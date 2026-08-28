import { effect, pingPong, sampler } from "vgpu"
import type { Frame, Target } from "vgpu"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

export interface ReactionSources {
  readonly seed: Wgsl
  readonly step: Wgsl
  readonly present: Wgsl
}

export interface ReactionOptions {
  /** Simulation steps per displayed frame. More steps means faster growth. */
  readonly substeps?: number
}

export function createReaction(
  setup: EffectSetup,
  src: ReactionSources,
  opts: ReactionOptions = {}
): EffectInstance {
  const { gpu, target, quality } = setup
  const substeps = opts.substeps ?? 12

  // Gray-Scott has no intrinsic scale: its features are a fixed number of
  // texels across, so running it at native resolution on a 4K hero produces
  // hair-fine filigree while the same code on a gallery tile produces fat
  // blobs. Capping the long edge fixes the pattern scale on screen, and makes
  // the twelve steps affordable at any canvas size.
  const MAX_EDGE = 900
  const dims = (w: number, h: number): [number, number] => {
    const scale = Math.min(quality, MAX_EDGE / Math.max(w, h, 1))
    return [Math.max(8, Math.round(w * scale)), Math.max(8, Math.round(h * scale))]
  }

  // The chemical field needs more than 8 bits: Gray-Scott increments are ~1e-3
  // per step, and in an 8-bit target every one of them quantises to zero.
  const [w0, h0] = dims(target.size[0], target.size[1])
  const state = pingPong(gpu, w0, h0, { format: "rgba16float" })

  // Nearest sampling: the Laplacian addresses exact texels, and linear filtering
  // would smear the stencil into a blur that damps the pattern out.
  const nearest = sampler(gpu, { minFilter: "nearest", magFilter: "nearest" })
  const linear = sampler(gpu, { minFilter: "linear", magFilter: "linear" })

  const seed = effect(gpu, src.seed)
  // A pair, because the two directions of the ping-pong bind different textures
  // and an effect's uniforms are shared by every pass it is drawn into.
  const stepA = effect(gpu, src.step, { set: { samp: nearest } })
  const stepB = effect(gpu, src.step, { set: { samp: nearest } })
  const present = effect(gpu, src.present, { set: { samp: linear } })

  let needsSeed = true

  function reseed(frame: Frame, time: number) {
    seed.set({ seed: { res: state.write.size, time, _pad: 0 } })
    frame.pass(state.write, seed)
    state.swap()
    seed.set({ seed: { res: state.write.size, time, _pad: 0 } })
    frame.pass(state.write, seed)
    state.swap()
    needsSeed = false
  }

  function render(frame: Frame, tgt: Target, inputs: FrameInputs) {
    if (needsSeed) reseed(frame, inputs.time)

    const aspect = tgt.size[0] / Math.max(tgt.size[1], 1)
    const uniform = {
      texel: state.read.texelSize,
      mouse: inputs.mouse,
      // Feed and kill are the two numbers that decide which Gray-Scott regime
      // the medium sits in, which makes them the only knobs worth exposing.
      feed: inputs.controls.feed ?? 0.0367,
      kill: inputs.controls.kill ?? 0.0605,
      time: inputs.time,
      // Only paint while the pointer is actually being moved: an always-on
      // injector burns a permanent blob into the middle of the frame.
      inject: 0.42 * inputs.pointer,
      aspect,
      _pad: 0,
    }
    stepA.set({ sim: uniform })
    stepB.set({ sim: uniform })

    // Alternating effects, so each pass carries its own source binding.
    for (let i = 0; i < substeps; i++) {
      const fx = i % 2 === 0 ? stepA : stepB
      fx.set({ state: state.read.color })
      frame.pass(state.write, fx)
      state.swap()
    }

    present.set({
      state: state.read.color,
      present: {
        texel: state.read.texelSize,
        intensity: inputs.controls.relief ?? 1,
        time: inputs.time,
      },
    })
    frame.pass(tgt, present)
  }

  return {
    render,
    resize(width, height) {
      const [w, h] = dims(width, height)
      state.read.resize([w, h])
      state.write.resize([w, h])
      needsSeed = true
    },
  }
}
