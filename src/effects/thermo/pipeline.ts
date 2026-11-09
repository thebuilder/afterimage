import { effect, pingPong, sampler } from "vgpu"
import type { Frame, Target } from "vgpu"
import { release } from "../release.ts"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

export interface ThermoSources {
  readonly step: Wgsl
  readonly present: Wgsl
}

/** Heat is soft and spreads, so the sheet only needs a coarse memory of it. */
const MAX_EDGE = 640

/**
 * When nobody touches the sheet, an unseen hand presses a palm flat on it now
 * and then, right of centre and clear of the title, and lifts it to leave a
 * print that cools through every colour the film has.
 */
const PRESSES: readonly (readonly [number, number, number, number])[] = [
  [0.7, 0.55, -0.15, 1],
  [0.56, 0.42, -0.3, -1],
  [0.8, 0.5, -0.4, 1],
  [0.62, 0.6, 0.15, -1],
]
const EVERY = 7.5

function palm(t: number, aspect: number): { at: [number, number, number, number]; mirror: number } {
  const i = Math.floor(t / EVERY)
  const k = t - i * EVERY
  const [x, y, a, mirror] = PRESSES[i % PRESSES.length]
  // On a narrow screen the hand sits in the middle, a little high.
  const wide = Math.min(1, Math.max(0, (aspect - 0.9) / 0.4))
  const at = [0.5 + (x - 0.5) * wide, y - 0.08 * (1 - wide)]
  const firm = k < 0.3 ? k / 0.3 : k < 1.5 ? 1 : k < 1.8 ? (1.8 - k) / 0.3 : 0
  return { at: [at[0], at[1], a, firm], mirror }
}

export function createThermo(setup: EffectSetup, src: ThermoSources): EffectInstance {
  const { gpu, target, quality } = setup

  const dims = (w: number, h: number): [number, number] => {
    const scale = Math.min(quality, MAX_EDGE / Math.max(w, h, 1))
    return [Math.max(8, Math.round(w * scale)), Math.max(8, Math.round(h * scale))]
  }

  const [w0, h0] = dims(target.size[0], target.size[1])
  // Cooling is a tiny change per frame, below what 8 bits can hold.
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
  let idle = 0
  let lastTouch = 0
  let lastGesture = 0
  let brokenAt: [number, number] | null = null
  let lastDims: readonly [number, number] = [w0, h0]

  function render(frame: Frame, tgt: Target, inputs: FrameInputs) {
    const aspect = tgt.size[0] / Math.max(tgt.size[1], 1)
    const live = inputs.pointer > 0.05
    const hand: [number, number] = [inputs.mouse[0], inputs.mouse[1]]
    const touch = live ? Math.min(1, inputs.pointer * 1.5) : 0
    // The unseen hand only presses while nobody else is touching the sheet.
    idle = live ? 0 : idle + inputs.dt
    const press = palm(idle, aspect)
    // A stroke only joins frames from one touch. The pointer arrives by
    // jumping: the first move after idle, after the unseen finger, or on
    // coming back in from outside lands far from the last known position, and
    // joining the two would lay a long line of heat at once.
    const jump = prev ? Math.hypot((hand[0] - prev[0]) * aspect, hand[1] - prev[1]) > 0.25 : true
    const gesture = inputs.gesture ?? 0
    if (gesture !== lastGesture) brokenAt = hand
    const moved = brokenAt !== null && (hand[0] !== brokenAt[0] || hand[1] !== brokenAt[1])
    const fresh = lastTouch < 0.02 || (live && brokenAt !== null)
    if (moved) brokenAt = null
    const from = prev && !fresh && !jump ? prev : hand
    prev = hand
    lastTouch = touch
    lastGesture = gesture

    step.set({
      state: state.read.color,
      sim: {
        texel: state.read.texelSize,
        hand,
        prev: from,
        dt: Math.min(inputs.dt, 1 / 30),
        time: inputs.time,
        warmth: inputs.controls.warmth ?? 1,
        cool: inputs.controls.cool ?? 1,
        touch,
        aspect,
        palm: press.at,
        mirror: press.mirror,
        _p0: 0,
        _p1: 0,
        _p2: 0,
      },
    })
    frame.pass(state.write, step)
    state.swap()

    present.set({
      state: state.read.color,
      view: { texel: state.read.texelSize, res: tgt.size, time: inputs.time, aspect, _p0: 0, _p1: 0 },
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
