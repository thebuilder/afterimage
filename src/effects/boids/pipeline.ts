import { compute, draw, effect, pingPongStorage, sampler, target as makeTarget } from "vgpu"
import type { Frame, Target } from "vgpu"
import { release } from "../release.ts"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

export interface BoidsSources {
  readonly flock: Wgsl
  readonly draw: Wgsl
  readonly present: Wgsl
}

const BIRD_BYTES = 16 // pos vec2 + vel vec2
const WORKGROUP = 64

export interface BoidsOptions {
  readonly count?: number
}

export function createBoids(
  setup: EffectSetup,
  src: BoidsSources,
  opts: BoidsOptions = {}
): EffectInstance {
  const { gpu, target, quality } = setup
  // The flock update is O(n²). 1400 birds is 2M pair tests a frame, which a
  // modern GPU eats; ten times that would not fit in a frame budget this canvas
  // shares with every other preview on the page.
  const count = opts.count ?? 1400

  const birds = pingPongStorage(gpu, count * BIRD_BYTES)

  const dims = (w: number, h: number): [number, number] => [
    Math.max(2, Math.round(w * quality)),
    Math.max(2, Math.round(h * quality)),
  ]
  const [w0, h0] = dims(target.size[0], target.size[1])
  // HDR, so overlapping darts add past 1 and the bloom has something to find.
  const flockBuffer = makeTarget(gpu, { size: [w0, h0], format: "rgba16float" })
  const linear = sampler(gpu, { minFilter: "linear", magFilter: "linear" })

  const flock = compute(gpu, src.flock)
  const darts = draw(gpu, {
    shader: src.draw,
    instances: count,
    vertices: 3,
    blend: "alpha",
  })
  const present = effect(gpu, src.present, { set: { samp: linear } })

  let reset = 1
  let lastDims: readonly [number, number] = [w0, h0]

  function render(frame: Frame, tgt: Target, inputs: FrameInputs) {
    const aspect = tgt.size[0] / Math.max(tgt.size[1], 1)
    const mx = (inputs.mouse[0] - 0.5) * 2 * aspect
    const my = (0.5 - inputs.mouse[1]) * 2

    flock.set({
      src: birds.read,
      dst: birds.write,
      sim: {
        mouse: [mx, my],
        dt: Math.min(inputs.dt, 1 / 30),
        time: inputs.time,
        aspect,
        cohesion: inputs.controls.cohesion ?? 1,
        separation: inputs.controls.separation ?? 1,
        speed: inputs.controls.speed ?? 1,
        pointer: inputs.pointer,
        count,
        reset,
        _pad: 0,
      },
    })
    flock.dispatch(Math.ceil(count / WORKGROUP))
    birds.swap()
    reset = 0

    darts.set({
      birds: birds.read,
      view: {
        aspect,
        size: 0.030,
        glow: inputs.controls.glow ?? 1,
        time: inputs.time,
      },
    })
    frame.pass(flockBuffer, darts)

    present.set({
      src: flockBuffer.color,
      present: { texel: flockBuffer.texelSize, glow: inputs.controls.glow ?? 1, time: inputs.time },
    })
    frame.pass(tgt, present)
  }

  return {
    render,
    resize(width, height) {
      const [w, h] = dims(width, height)
      // Rounding means many surface resizes land on identical buffer dimensions.
      // Re-seeding the flock for those scatters a settled murmuration for nothing.
      if (w === lastDims[0] && h === lastDims[1]) return
      lastDims = [w, h]
      flockBuffer.resize([w, h])
      reset = 1
    },
    dispose() {
      release(flockBuffer, birds.read, birds.write)
    },
  }
}
