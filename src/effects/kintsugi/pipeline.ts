import { effect, pingPong, sampler } from "vgpu"
import type { Frame, Target } from "vgpu"
import { release } from "../release.ts"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

export interface KintsugiSources {
  readonly flow: Wgsl
  readonly present: Wgsl
}

/** Gold runs one texel per step along one-texel fractures; this keeps the grid cheap. */
const MAX_EDGE = 960
/** Steps a frame: how fast gold runs. Each is its own instance. */
const STEPS = 3

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

export function createKintsugi(setup: EffectSetup, src: KintsugiSources): EffectInstance {
  const { gpu, target, quality } = setup

  const dims = (w: number, h: number): [number, number] => {
    const scale = Math.min(quality, MAX_EDGE / Math.max(w, h, 1))
    return [Math.max(8, Math.round(w * scale)), Math.max(8, Math.round(h * scale))]
  }

  const [w0, h0] = dims(target.size[0], target.size[1])
  const state = pingPong(gpu, w0, h0, { format: "rgba16float" })
  const linear = sampler(gpu, {
    minFilter: "nearest",
    magFilter: "nearest",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  })
  const steps = Array.from({ length: STEPS }, () => effect(gpu, src.flow, { set: { samp: linear } }))
  const present = effect(gpu, src.present, { set: { samp: linear } })

  let lastDims: readonly [number, number] = [w0, h0]
  let needInit = true
  let lamp = 0
  let stepCount = 0
  // The bowl pours on its own when left alone: right away, then every few seconds.
  let nextDrip = 0.15
  let dripAt: [number, number] = [0, 0]
  let dripUntil = -1
  let drips = 0

  function render(frame: Frame, tgt: Target, inputs: FrameInputs) {
    const aspect = tgt.size[0] / Math.max(tgt.size[1], 1)
    const dt = Math.min(Math.max(inputs.dt, 1 / 240), 1 / 20)
    const t = inputs.time
    const live = inputs.pointer > 0.05
    const hand: [number, number] = [inputs.mouse[0] * aspect, 1 - inputs.mouse[1]]
    lamp += ((live ? 1 : 0) - lamp) * (1 - Math.exp(-dt * 6))

    if (t >= nextDrip) {
      drips++
      // Away from the lower left, where the title sits.
      dripAt = [(0.3 + 0.65 * hash(drips * 3.1)) * aspect, 0.25 + 0.65 * hash(drips * 7.7)]
      dripUntil = t + 0.35
      nextDrip = t + (drips < 3 ? 0.8 : live ? 9 : 4.5)
    }
    const dripping = t < dripUntil
    const reach = inputs.controls.reach ?? 1
    const pourR = 0.05 * (inputs.controls.pour ?? 1)

    const texel = 1 / state.read.size[1]
    for (const step of steps) {
      stepCount++
      step.set({
        state: state.read.color,
        flow: {
          pour: [hand[0], hand[1], live ? pourR : 0, live ? Math.min(1, inputs.pointer * 1.5) : 0],
          drip: [dripAt[0], dripAt[1], dripping ? 0.075 : 0, dripping ? 0.85 : 0],
          aspect,
          texel,
          time: t,
          dt: dt / STEPS,
          init: needInit ? 1 : 0,
          reach,
          seed: (stepCount * 17.31) % 997,
        },
      })
      needInit = false
      frame.pass(state.write, step)
      state.swap()
    }

    present.set({
      state: state.read.color,
      view: {
        res: tgt.size,
        lamp: [hand[0], hand[1], lamp],
        time: t,
        aspect,
        shine: inputs.controls.shine ?? 1,
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
      needInit = true
    },
    dispose() {
      release(state.read, state.write)
    },
  }
}
