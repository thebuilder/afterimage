import { effect, pingPong, sampler } from "vgpu"
import type { Frame, Target } from "vgpu"
import { release } from "../release.ts"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

export interface SurveySources {
  readonly sculpt: Wgsl
  readonly present: Wgsl
}

/** Raised land is broad and soft, so a coarse grid holds it. */
const MAX_EDGE = 512

/**
 * Which way the land rises across the screen, so the sea lies under the
 * headline: on wide screens the coast runs down the middle with the sea on
 * the left, on narrow ones the sea fills the bottom.
 */
export function slopeFor(aspect: number): [number, number] {
  return aspect >= 1 ? [0.5, 0.06] : [0.08, 0.6]
}

export function createSurvey(setup: EffectSetup, src: SurveySources): EffectInstance {
  const { gpu, target, quality } = setup

  const dims = (w: number, h: number): [number, number] => {
    const scale = Math.min(quality, MAX_EDGE / Math.max(w, h, 1))
    return [Math.max(8, Math.round(w * scale)), Math.max(8, Math.round(h * scale))]
  }

  const [w0, h0] = dims(target.size[0], target.size[1])
  const state = pingPong(gpu, w0, h0, { format: "rgba16float" })
  const linear = sampler(gpu, {
    minFilter: "linear",
    magFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  })
  const sculpt = effect(gpu, src.sculpt, { set: { samp: linear } })
  const present = effect(gpu, src.present, { set: { samp: linear } })

  let prev: [number, number] | null = null
  let lastGesture = 0
  let lastDims: readonly [number, number] = [w0, h0]

  function render(frame: Frame, tgt: Target, inputs: FrameInputs) {
    const aspect = tgt.size[0] / Math.max(tgt.size[1], 1)
    const live = inputs.pointer > 0.05
    const hand: [number, number] = [inputs.mouse[0], inputs.mouse[1]]

    // The hand lifts land wherever it is, harder as it sweeps, and never
    // joins two separate touches with one long ridge.
    const gesture = inputs.gesture ?? 0
    const jump = !prev || Math.hypot((hand[0] - prev[0]) * aspect, hand[1] - prev[1]) > 0.2 || gesture !== lastGesture
    const from: [number, number] = jump || !prev ? hand : prev
    const moved = Math.hypot((hand[0] - from[0]) * aspect, hand[1] - from[1])
    const touch = live ? Math.min(2.5, 0.6 + moved * 60) * (inputs.controls.lift ?? 1) : 0
    prev = hand
    lastGesture = gesture

    sculpt.set({
      state: state.read.color,
      sim: {
        texel: state.read.texelSize,
        hand,
        prev: from,
        aspect,
        touch,
        dt: Math.min(inputs.dt, 1 / 30),
        wear: inputs.controls.wear ?? 1,
        _p0: 0,
        _p1: 0,
      },
    })
    frame.pass(state.write, sculpt)
    state.swap()

    present.set({
      state: state.read.color,
      view: {
        texel: state.read.texelSize,
        res: tgt.size,
        slope: slopeFor(aspect),
        time: inputs.time,
        aspect,
        interval: 0.022 / (inputs.controls.detail ?? 1),
        sea: 0,
      },
    })
    frame.pass(tgt, present)
  }

  return {
    render,
    resize(width, height) {
      const [w, h] = dims(width, height)
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
