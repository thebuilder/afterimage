// The multi-pass effects, built the way the app builds them but from WGSL
// resolved under plain Node. Shared by the headless renderer and the OG card.
import path from "node:path"
import { resolveShader } from "@vgpu/wgsl/runtime"
import { root } from "./registry.mjs"

const load = async (p) => (await resolveShader({ entry: path.join(root, p) })).wgsl

/** `{ id: () => Promise<EffectInstance> }` for every multi-pass effect. */
export function multipassSpecs(gpu, tgt, { fluxCount = 60_000 } = {}) {
  return {
    flux: async () => {
      const { createFlux } = await import(path.join(root, "src/effects/flux/pipeline.ts"))
      const src = {
        advect: await load("src/effects/flux/advect.wgsl"),
        splat: await load("src/effects/flux/splat.wgsl"),
        fade: await load("src/effects/flux/fade.wgsl"),
        present: await load("src/effects/flux/present.wgsl"),
      }
      return createFlux({ gpu, target: tgt, quality: 1 }, src, { count: fluxCount })
    },
    ink: async () => {
      const { createInk } = await import(path.join(root, "src/effects/ink/pipeline.ts"))
      return createInk({ gpu, target: tgt, quality: 1 }, {
        step: await load("src/effects/ink/step.wgsl"),
        present: await load("src/effects/ink/present.wgsl"),
      })
    },
    boids: async () => {
      const { createBoids } = await import(path.join(root, "src/effects/boids/pipeline.ts"))
      return createBoids({ gpu, target: tgt, quality: 1 }, {
        flock: await load("src/effects/boids/flock.wgsl"),
        draw: await load("src/effects/boids/draw.wgsl"),
        present: await load("src/effects/boids/present.wgsl"),
      }, { count: 700 })
    },
    lattice: async () => {
      const { createLattice } = await import(path.join(root, "src/effects/lattice/pipeline.ts"))
      return createLattice({ gpu, target: tgt, quality: 1 }, {
        mesh: await load("src/effects/lattice/mesh.wgsl"),
        present: await load("src/effects/lattice/present.wgsl"),
      })
    },
    misted: async () => {
      const { createMisted } = await import(path.join(root, "src/effects/misted/pipeline.ts"))
      return createMisted({ gpu, target: tgt, quality: 1 }, {
        step: await load("src/effects/misted/step.wgsl"),
        present: await load("src/effects/misted/present.wgsl"),
      })
    },
    reaction: async () => {
      const { createReaction } = await import(path.join(root, "src/effects/reaction/pipeline.ts"))
      const src = {
        seed: await load("src/effects/reaction/seed.wgsl"),
        step: await load("src/effects/reaction/step.wgsl"),
        present: await load("src/effects/reaction/present.wgsl"),
      }
      return createReaction({ gpu, target: tgt, quality: 1 }, src)
    },
  }
}
