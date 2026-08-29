import { compute, draw, effect, pingPong, pingPongStorage, sampler } from "vgpu"
import type { Frame, Target } from "vgpu"
import { release } from "../release.ts"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

/** WGSL sources, passed in so the same pipeline runs under Vite and under Node. */
export interface FluxSources {
  readonly advect: Wgsl
  readonly splat: Wgsl
  readonly fade: Wgsl
  readonly present: Wgsl
}

const PARTICLE_BYTES = 24 // pos vec2 + vel vec2 + age f32 + seed f32
const WORKGROUP = 64

export interface FluxOptions {
  readonly count?: number
}

export function createFlux(
  setup: EffectSetup,
  src: FluxSources,
  opts: FluxOptions = {}
): EffectInstance {
  const { gpu, target, quality } = setup
  const count = opts.count ?? 140_000

  // Two halves so the advection never reads the buffer it is writing.
  const particles = pingPongStorage(gpu, count * PARTICLE_BYTES)

  const bufW = () => Math.max(2, Math.round(target.size[0] * quality))
  const bufH = () => Math.max(2, Math.round(target.size[1] * quality))

  // The trail buffer is HDR: additive sprites stack well past 1.0, and clipping
  // them in an 8-bit target is what turns a plume into a flat white blob.
  const trails = pingPong(gpu, bufW(), bufH(), { format: "rgba16float" })
  const linear = sampler(gpu, { minFilter: "linear", magFilter: "linear" })

  const advect = compute(gpu, src.advect)
  const splat = draw(gpu, {
    shader: src.splat,
    instances: count,
    vertices: 3,
    blend: "additive",
  })
  // Two fade effects, one per ping-pong direction: an effect's bindings are read
  // at encode time, so alternating them is cheaper and clearer than rebinding one.
  const fade = effect(gpu, src.fade, { set: { samp: linear, fade: { decay: 0.92, zoom: 0.9985 } } })
  const present = effect(gpu, src.present, { set: { samp: linear } })

  let reset = 1
  let aspect = target.size[0] / Math.max(target.size[1], 1)

  function render(frame: Frame, tgt: Target, inputs: FrameInputs) {
    aspect = tgt.size[0] / Math.max(tgt.size[1], 1)
    const exposure = inputs.controls.exposure ?? 1
    const flow = inputs.controls.flow ?? 1
    const persistence = inputs.controls.persistence ?? 0.92

    // Pointer arrives top-origin in 0..1; the sim works in centred, y-up space.
    const mx = (inputs.mouse[0] - 0.5) * 2 * aspect
    const my = (0.5 - inputs.mouse[1]) * 2

    advect.set({
      src: particles.read,
      dst: particles.write,
      sim: {
        mouse: [mx, my],
        dt: inputs.dt,
        time: inputs.time,
        aspect,
        intensity: flow,
        count,
        reset,
      },
    })
    advect.dispatch(Math.ceil(count / WORKGROUP))
    particles.swap()
    reset = 0

    splat.set({
      parts: particles.read,
      view: {
        aspect,
        pointSize: 0.0075 * (1.0 + 0.25 * exposure),
        // Sprite energy is divided by the population: the buffer accumulates for
        // ~1/(1-decay) frames, so a fixed per-particle value blows out the moment
        // the count goes up. This keeps exposure constant across counts.
        intensity: (2400 / count) * exposure,
        time: inputs.time,
      },
    })
    // Trail length is a knob, so the decay has to be written per frame rather
    // than fixed at construction.
    fade.set({ src: trails.read.color, fade: { decay: persistence, zoom: 0.9985 } })

    // One pass: last frame's trails are laid down dimmed, then this frame's
    // sprites are added on top. Two draws, no intermediate copy.
    frame.pass(trails.write, (pass) => {
      pass.draw(fade)
      pass.draw(splat)
    })

    present.set({
      src: trails.write.color,
      present: {
        texel: trails.write.texelSize,
        intensity: exposure,
        time: inputs.time,
      },
    })
    frame.pass(tgt, present)

    trails.swap()
  }

  return {
    render,
    resize(width, height) {
      const w = Math.max(2, Math.round(width * quality))
      const h = Math.max(2, Math.round(height * quality))
      trails.read.resize([w, h])
      trails.write.resize([w, h])
      reset = 1
    },
    dispose() {
      release(trails.read, trails.write, particles.read, particles.write)
    },
  }
}
