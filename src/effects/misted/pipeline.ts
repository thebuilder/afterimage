import { effect, pingPong, sampler } from "vgpu"
import type { Frame, Target } from "vgpu"
import { release } from "../release.ts"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

export interface MistedSources {
  readonly step: Wgsl
  readonly present: Wgsl
}

/** The glass only needs to remember a soft mask, so its long edge is capped. */
const MAX_EDGE = 720

/**
 * Before anyone touches it, an unseen hand wipes one stroke across the glass,
 * so the first seconds already show what is behind the fog.
 */
const AUTO_START = 0.5
const AUTO_LENGTH = 1.7

function autoWipe(t: number): [number, number] | null {
  const k = (t - AUTO_START) / AUTO_LENGTH
  if (k < 0 || k > 1) return null
  const e = k * k * (3 - 2 * k)
  return [0.3 + 0.5 * e, 0.5 + 0.07 * Math.sin(e * Math.PI * 3)]
}

export function createMisted(setup: EffectSetup, src: MistedSources): EffectInstance {
  const { gpu, target, quality } = setup

  const dims = (w: number, h: number): [number, number] => {
    const scale = Math.min(quality, MAX_EDGE / Math.max(w, h, 1))
    return [Math.max(8, Math.round(w * scale)), Math.max(8, Math.round(h * scale))]
  }

  const [w0, h0] = dims(target.size[0], target.size[1])
  // A slow refog is a tiny change per frame, below what 8 bits can hold.
  const state = pingPong(gpu, w0, h0, { format: "rgba16float" })
  const linear = sampler(gpu, {
    minFilter: "linear",
    magFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  })

  const step = effect(gpu, src.step, { set: { samp: linear } })
  const present = effect(gpu, src.present, { set: { samp: linear } })

  let prev: [number, number] | null = null
  let wasAuto = false
  let lastPointer = 0
  let lastDims: readonly [number, number] = [w0, h0]

  function render(frame: Frame, tgt: Target, inputs: FrameInputs) {
    const aspect = tgt.size[0] / Math.max(tgt.size[1], 1)
    const auto = inputs.pointer > 0.05 ? null : autoWipe(inputs.time)
    const hand: [number, number] = auto ?? [inputs.mouse[0], inputs.mouse[1]]
    const wipe = auto ? 1 : Math.min(1, inputs.pointer * 1.5)
    // A stroke only joins frames that belong to one gesture. The pointer arrives
    // by jumping, not gliding: the first move after idle (or after the unseen
    // hand) lands far from the last known position, and joining the two would
    // wipe a long streak at once. So a fresh gesture, a switch of hands, or a
    // jump too long for one frame starts the stroke where the hand is.
    const fresh = !auto && lastPointer < 0.02
    const jump = prev ? Math.hypot((hand[0] - prev[0]) * aspect, hand[1] - prev[1]) > 0.25 : true
    const from = prev && !fresh && !jump && wasAuto === (auto !== null) ? prev : hand
    prev = hand
    wasAuto = auto !== null
    lastPointer = inputs.pointer

    step.set({
      state: state.read.color,
      sim: {
        texel: state.read.texelSize,
        mouse: hand,
        prev: from,
        dt: Math.min(inputs.dt, 1 / 30),
        time: inputs.time,
        brush: inputs.controls.brush ?? 1,
        refog: inputs.controls.refog ?? 1,
        drips: inputs.controls.drips ?? 1,
        wipe,
        aspect,
        _pad: 0,
      },
    })
    frame.pass(state.write, step)
    state.swap()

    present.set({
      state: state.read.color,
      view: {
        texel: state.read.texelSize,
        time: inputs.time,
        drips: inputs.controls.drips ?? 1,
        aspect,
        _pad: 0,
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
