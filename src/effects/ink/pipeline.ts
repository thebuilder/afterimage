import { effect, pingPong, sampler } from "vgpu"
import type { Frame, Target } from "vgpu"
import { release } from "../release.ts"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

export interface InkSources {
  readonly step: Wgsl
  readonly present: Wgsl
}

/** Substeps per displayed frame. More steps means the fluid moves further per second. */
const SUBSTEPS = 3
/**
 * A fluid solve is quadratic in resolution and the eddies have a fixed size in
 * texels, so a fixed grid keeps both the cost and the look constant from a
 * gallery tile to a 4K hero.
 */
const MAX_EDGE = 560

export function createInk(setup: EffectSetup, src: InkSources): EffectInstance {
  const { gpu, target, quality } = setup

  const dims = (w: number, h: number): [number, number] => {
    const scale = Math.min(quality, MAX_EDGE / Math.max(w, h, 1))
    return [Math.max(8, Math.round(w * scale)), Math.max(8, Math.round(h * scale))]
  }

  const [w0, h0] = dims(target.size[0], target.size[1])
  // Velocity is signed and dye runs past 1, so an 8-bit target cannot hold this
  // state at all.
  const state = pingPong(gpu, w0, h0, { format: "rgba16float" })
  const linear = sampler(gpu, {
    minFilter: "linear",
    magFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  })

  const stepA = effect(gpu, src.step, { set: { samp: linear } })
  const stepB = effect(gpu, src.step, { set: { samp: linear } })
  const present = effect(gpu, src.present, { set: { samp: linear } })

  let prevMouse: [number, number] = [0.5, 0.5]
  let lastDims: readonly [number, number] = [w0, h0]

  function render(frame: Frame, tgt: Target, inputs: FrameInputs) {
    const aspect = tgt.size[0] / Math.max(tgt.size[1], 1)
    // Pointer velocity, not position: dragging pushes fluid, resting does not.
    const mv: [number, number] = [
      (inputs.mouse[0] - prevMouse[0]) * inputs.pointer,
      (inputs.mouse[1] - prevMouse[1]) * inputs.pointer,
    ]
    prevMouse = [inputs.mouse[0], inputs.mouse[1]]

    const uniform = {
      texel: state.read.texelSize,
      mouse: inputs.mouse,
      mouseVel: mv,
      dt: Math.min(inputs.dt, 1 / 30),
      time: inputs.time,
      swirl: inputs.controls.swirl ?? 1,
      dissipation: inputs.controls.dissipation ?? 0.5,
      dye: inputs.controls.dye ?? 1,
      pointer: inputs.pointer,
      aspect,
      _pad: 0,
    }
    stepA.set({ sim: uniform })
    stepB.set({ sim: uniform })

    for (let i = 0; i < SUBSTEPS; i++) {
      const fx = i % 2 === 0 ? stepA : stepB
      fx.set({ state: state.read.color })
      frame.pass(state.write, fx)
      state.swap()
    }

    present.set({
      state: state.read.color,
      present: {
        texel: state.read.texelSize,
        time: inputs.time,
        // No glow control is declared for this effect; the shader input is fixed.
        glow: 1,
      },
    })
    frame.pass(tgt, present)
  }

  return {
    render,
    resize(width, height) {
      const [w, h] = dims(width, height)
      // The grid long edge is capped, so many surface resizes land on identical
      // internal dimensions. Reallocating for those disturbs the solve for nothing.
      if (w === lastDims[0] && h === lastDims[1]) return
      lastDims = [w, h]
      state.read.resize([w, h])
      state.write.resize([w, h])
    },
    dispose() {
      release(state.read, state.write)
    },
  }
}
