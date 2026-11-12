import { effect, pingPong, sampler } from "vgpu"
import type { Frame, Target } from "vgpu"
import { release } from "../release.ts"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

export interface LidoSources {
  readonly sim: Wgsl
  readonly present: Wgsl
}

/** Ripples are smooth, so the water only needs a coarse grid. */
const MAX_EDGE = 640
/** Seconds between drops while nobody is touching the water. */
const DROP_EVERY = 2.6

/**
 * Where the pool wall runs: water where dot(s, n) > c, with s in height
 * units (x scaled by aspect, y up). Wide screens get a deck down the left,
 * where the title sits; narrow ones a deck along the bottom. w is the lane's
 * centre measured along the wall.
 */
export function wallFor(aspect: number): [number, number, number, number] {
  if (aspect >= 1) return [1, 0, 0.36 * aspect, 0.56]
  return [0, 1, 0.3, -0.5 * aspect]
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

export function createLido(setup: EffectSetup, src: LidoSources): EffectInstance {
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
  // Two steps a frame so ripples travel at a lively pace. Each step is its own
  // instance: one effect set twice in a frame keeps only the last values.
  const steps = [effect(gpu, src.sim, { set: { samp: linear } }), effect(gpu, src.sim, { set: { samp: linear } })]
  const present = effect(gpu, src.present, { set: { samp: linear } })

  let prev: [number, number] | null = null
  let lastGesture = 0
  let idle = 0
  let nextDrop = 0.6
  let dropCount = 0
  let lastDims: readonly [number, number] = [w0, h0]

  function render(frame: Frame, tgt: Target, inputs: FrameInputs) {
    const aspect = tgt.size[0] / Math.max(tgt.size[1], 1)
    const wall = wallFor(aspect)
    const live = inputs.pointer > 0.05
    const hand: [number, number] = [inputs.mouse[0], inputs.mouse[1]]

    // The fingertip only drags a wake when it moves, harder the faster it goes,
    // and never joins two separate touches with one long stroke.
    const gesture = inputs.gesture ?? 0
    const jump = !prev || Math.hypot((hand[0] - prev[0]) * aspect, hand[1] - prev[1]) > 0.2 || gesture !== lastGesture
    const from: [number, number] = jump || !prev ? hand : prev
    const moved = Math.hypot((hand[0] - from[0]) * aspect, hand[1] - from[1])
    const touch = live ? Math.min(1.6, 0.08 + moved * 90) : 0
    prev = hand
    lastGesture = gesture

    // Nobody here: now and then a drop falls somewhere on the water.
    idle = live ? 0 : idle + inputs.dt
    let drop: [number, number, number, number] = [0, 0, 0.01, 0]
    if (!live && idle > nextDrop) {
      dropCount++
      nextDrop = idle + DROP_EVERY * (0.6 + 0.8 * hash(dropCount * 3.1))
      // Pick a spot on the water, a little away from the wall.
      const a = hash(dropCount * 1.7)
      const b = hash(dropCount * 5.3)
      const x = aspect >= 1 ? 0.48 + 0.46 * a : 0.1 + 0.8 * a
      const y = aspect >= 1 ? 0.12 + 0.76 * b : 0.08 + 0.5 * b
      drop = [x, y, 0.008 + 0.006 * hash(dropCount * 9.7), 1]
    }

    const sim = {
      texel: state.read.texelSize,
      hand,
      prev: from,
      drop,
      wall,
      aspect,
      touch: touch * (inputs.controls.wake ?? 1),
      damp: 0.9965,
      _p0: 0,
    }
    for (let i = 0; i < steps.length; i++) {
      // The fingertip and the drop only land once, on the first step.
      const first = i === 0
      steps[i].set({
        state: state.read.color,
        sim: { ...sim, touch: first ? sim.touch : 0, drop: first ? drop : [0, 0, 0.01, 0] },
      })
      frame.pass(state.write, steps[i])
      state.swap()
    }

    present.set({
      state: state.read.color,
      view: {
        texel: state.read.texelSize,
        res: tgt.size,
        wall,
        time: inputs.time,
        aspect,
        sun: inputs.controls.sun ?? 1,
        depth: inputs.controls.depth ?? 1,
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
