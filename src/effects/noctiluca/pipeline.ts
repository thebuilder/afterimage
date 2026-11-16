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

/** Where the horizon sits: a little higher on tall screens. */
export function horizonFor(aspect: number): number {
  return aspect >= 1 ? 0.62 : 0.66
}

/** The ground point under a screen point (screen heights, y up), or null in the sky. */
function groundAt(p: [number, number], horizon: number, aspect: number): [number, number] | null {
  const dy = horizon - p[1]
  if (dy < 0.004) return null
  const z = 1 / dy
  return [(p[0] - 0.5 * aspect) * z, z]
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
    const horizon = horizonFor(aspect)
    const screen: [number, number] = [inputs.mouse[0] * aspect, 1 - inputs.mouse[1]]
    const hand = groundAt(screen, horizon, aspect)
    const live = inputs.pointer > 0.05 && hand !== null
    const gesture = inputs.gesture ?? 0
    const jump = !prev || !hand || gesture !== lastGesture || Math.hypot(hand[0] - prev[0], hand[1] - prev[1]) > 0.6 * hand[1]
    const b: [number, number] = hand ?? [0, -100]
    const a: [number, number] = jump || !prev ? b : prev
    const raw = live ? Math.hypot(b[0] - a[0], b[1] - a[1]) / dt : 0
    speed += (raw - speed) * (1 - Math.exp(-dt * 12))
    prev = hand
    lastGesture = gesture

    const surf = inputs.controls.surf ?? 1
    const glow = inputs.controls.glow ?? 1
    step.set({
      state: state.read.color,
      sim: {
        a,
        b,
        aspect,
        horizon,
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
        time: inputs.time,
        aspect,
        horizon,
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
