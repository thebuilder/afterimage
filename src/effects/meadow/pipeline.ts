import { effect, pingPong, sampler } from "vgpu"
import type { Frame, Target } from "vgpu"
import { release } from "../release.ts"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

export interface MeadowSources {
  readonly spring: Wgsl
  readonly present: Wgsl
}

/** Six rows of grass, each with a strip of springs across the field. */
const ROWS = 6
const COLUMNS = 384

/** The sun sits low on the horizon, right of centre, away from the headline. */
export function sunFor(aspect: number): [number, number] {
  return aspect >= 1 ? [0.7 * aspect, 0.37] : [0.62 * aspect, 0.4]
}

export function createMeadow(setup: EffectSetup, src: MeadowSources): EffectInstance {
  const { gpu } = setup
  const state = pingPong(gpu, COLUMNS, ROWS, { format: "rgba16float" })
  const linear = sampler(gpu, {
    minFilter: "linear",
    magFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  })
  // The springs are stiff, so they take two half steps a frame; one instance
  // each, because an effect set twice in a frame keeps only the last values.
  const steps = [effect(gpu, src.spring, { set: { samp: linear } }), effect(gpu, src.spring, { set: { samp: linear } })]
  const present = effect(gpu, src.present, { set: { samp: linear } })

  let prev: [number, number] | null = null
  let lastGesture = 0
  let vel: [number, number] = [0, 0]

  function render(frame: Frame, tgt: Target, inputs: FrameInputs) {
    const aspect = tgt.size[0] / Math.max(tgt.size[1], 1)
    const dt = Math.min(Math.max(inputs.dt, 1 / 240), 1 / 20)
    const live = inputs.pointer > 0.05
    const hand: [number, number] = [inputs.mouse[0] * aspect, 1 - inputs.mouse[1]]
    const gesture = inputs.gesture ?? 0
    const jump = !prev || gesture !== lastGesture || Math.hypot(hand[0] - prev[0], hand[1] - prev[1]) > 0.25
    const raw: [number, number] = live && !jump && prev ? [(hand[0] - prev[0]) / dt, (hand[1] - prev[1]) / dt] : [0, 0]
    // A little smoothing, so a jittery pointer still sweeps the grass evenly.
    const a = 1 - Math.exp(-dt * 25)
    vel = [vel[0] + (raw[0] - vel[0]) * a, vel[1] + (raw[1] - vel[1]) * a]
    prev = hand
    lastGesture = gesture

    for (const step of steps) {
      step.set({
        state: state.read.color,
        sim: {
          hand,
          vel,
          aspect,
          touch: live ? Math.min(1, inputs.pointer * 1.5) * (inputs.controls.brush ?? 1) : 0,
          dt: dt / 2,
          stiff: 1,
        },
      })
      frame.pass(state.write, step)
      state.swap()
    }

    present.set({
      state: state.read.color,
      view: {
        res: tgt.size,
        sun: sunFor(aspect),
        time: inputs.time,
        aspect,
        gust: inputs.controls.wind ?? 1,
        glow: inputs.controls.glow ?? 1,
      },
    })
    frame.pass(tgt, present)
  }

  return {
    render,
    dispose() {
      release(state.read, state.write)
    },
  }
}
