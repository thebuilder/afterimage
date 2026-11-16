import { effect, pingPong, sampler } from "vgpu"
import type { Frame, Target } from "vgpu"
import { release } from "../release.ts"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

export interface NoctilucaSources {
  readonly sim: Wgsl
  readonly present: Wgsl
}

/** The glow field is soft, so it lives at a fraction of the screen. */
const MAX_EDGE = 560

/**
 * Where the sea is. On wide screens the beach takes the left third, the sea
 * comes in from the right; on tall ones the sea is below and comes up.
 */
export function shoreFor(aspect: number): { sea: [number, number]; origin: [number, number]; moon: [number, number] } {
  if (aspect >= 1) {
    const l = Math.hypot(1, 0.32)
    return { sea: [1 / l, 0.32 / l], origin: [0.4 * aspect, 0.5], moon: [0.86 * aspect, 1.25] }
  }
  const l = Math.hypot(0.22, 1)
  return { sea: [0.22 / l, -1 / l], origin: [0.5 * aspect, 0.56], moon: [0.75 * aspect, 1.15] }
}

export function createNoctiluca(setup: EffectSetup, src: NoctilucaSources): EffectInstance {
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
  const step = effect(gpu, src.sim, { set: { samp: linear } })
  const present = effect(gpu, src.present, { set: { samp: linear } })

  let prev: [number, number] | null = null
  let lastGesture = 0
  let speed = 0
  let lastDims: readonly [number, number] = [w0, h0]

  function render(frame: Frame, tgt: Target, inputs: FrameInputs) {
    const aspect = tgt.size[0] / Math.max(tgt.size[1], 1)
    const dt = Math.min(Math.max(inputs.dt, 1 / 240), 1 / 20)
    const live = inputs.pointer > 0.05
    const hand: [number, number] = [inputs.mouse[0] * aspect, 1 - inputs.mouse[1]]
    const gesture = inputs.gesture ?? 0
    const jump = !prev || gesture !== lastGesture || Math.hypot(hand[0] - prev[0], hand[1] - prev[1]) > 0.3
    const a: [number, number] = jump || !prev ? hand : prev
    const raw = live ? Math.hypot(hand[0] - a[0], hand[1] - a[1]) / dt : 0
    speed += (raw - speed) * (1 - Math.exp(-dt * 12))
    prev = hand
    lastGesture = gesture

    const shore = shoreFor(aspect)
    const surf = inputs.controls.surf ?? 1
    const glow = inputs.controls.glow ?? 1
    step.set({
      state: state.read.color,
      sim: {
        a,
        b: hand,
        sea: shore.sea,
        origin: shore.origin,
        aspect,
        time: inputs.time,
        dt,
        touch: live ? Math.min(1, inputs.pointer * 1.5) : 0,
        speed,
        surf,
        linger: inputs.controls.linger ?? 1,
        glow,
      },
    })
    frame.pass(state.write, step)
    state.swap()

    present.set({
      state: state.read.color,
      view: {
        res: tgt.size,
        sea: shore.sea,
        origin: shore.origin,
        moon: shore.moon,
        time: inputs.time,
        aspect,
        surf,
        glow,
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
