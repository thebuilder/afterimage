import { draw, effect, geometry, sampler, target as makeTarget } from "vgpu"
import type { Frame, Target } from "vgpu"
import { icosphere, orbit, perspectiveCamera } from "vgpu/scene"
import { release } from "../release.ts"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

export interface LatticeSources {
  readonly mesh: Wgsl
  readonly present: Wgsl
}

export function createLattice(setup: EffectSetup, src: LatticeSources): EffectInstance {
  const { gpu, target, quality } = setup

  const dims = (w: number, h: number): [number, number] => [
    Math.max(2, Math.round(w * quality)),
    Math.max(2, Math.round(h * quality)),
  ]
  const [w0, h0] = dims(target.size[0], target.size[1])

  // A Surface has no depth attachment, so anything that needs a depth test has
  // to render offscreen and get composited across.
  const scene = makeTarget(gpu, {
    size: [w0, h0],
    format: "rgba16float",
    depth: true,
  })
  const linear = sampler(gpu, { minFilter: "linear", magFilter: "linear" })

  const mesh = draw(gpu, {
    shader: src.mesh,
    geometry: geometry(gpu, icosphere({ radius: 1, subdivisions: 5 })),
    // The displaced sphere stays closed, so half the fragments are back faces.
    cull: "back",
  })
  const present = effect(gpu, src.present, { set: { samp: linear } })

  let lastDims: readonly [number, number] = [w0, h0]

  const camera = perspectiveCamera({
    fov: 42,
    aspect: w0 / Math.max(h0, 1),
    position: [0, 0.6, 4.2],
    target: [0, 0, 0],
  })

  function render(frame: Frame, tgt: Target, inputs: FrameInputs) {
    const spin = inputs.controls.spin ?? 1
    const mx = (inputs.mouse[0] - 0.5) * 1.6
    const my = (inputs.mouse[1] - 0.5) * 1.2

    // The camera is a scene node: `position` is a live Float32Array, so it is
    // moved through set() and re-aimed with lookAt() rather than reassigned.
    camera.set({ position: [Math.sin(mx) * 4.2, 0.6 + my * 2.0, Math.cos(mx) * 4.2] })
    camera.lookAt([0, 0, 0])

    mesh.set({
      camera: { viewProjection: camera.viewProjection },
      // radius 0, because orbit() defaults to a real orbit and would carry the
      // sphere off to one side of the frame. Here it is only wanted for spin.
      model: { model: orbit(inputs.time * 0.18 * spin, { radius: 0 }) },
      shape: {
        time: inputs.time,
        morph: inputs.controls.morph ?? 0.35,
        facets: inputs.controls.facets ?? 7,
        glow: inputs.controls.glow ?? 1,
      },
    })

    // clearDepth defaults to 1 and the draw defaults to less-equal, so the
    // standard depth setup needs nothing said here.
    frame.pass(scene, mesh)

    present.set({
      src: scene.color,
      present: { texel: scene.texelSize, glow: inputs.controls.glow ?? 1, time: inputs.time },
    })
    frame.pass(tgt, present)
  }

  return {
    render,
    resize(width, height) {
      const [w, h] = dims(width, height)
      // Rounding means many surface resizes land on identical buffer dimensions.
      // The camera aspect derives from the same w/h, so nothing changes either.
      if (w === lastDims[0] && h === lastDims[1]) return
      lastDims = [w, h]
      scene.resize([w, h])
      camera.set({ aspect: w / Math.max(h, 1) })
    },
    dispose() {
      release(scene)
    },
  }
}
