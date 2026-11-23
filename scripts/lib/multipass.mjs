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
    chladni: async () => {
      const { createChladni } = await import(path.join(root, "src/effects/chladni/pipeline.ts"))
      return createChladni({ gpu, target: tgt, quality: 1 }, {
        step: await load("src/effects/chladni/step.wgsl"),
        present: await load("src/effects/chladni/present.wgsl"),
      })
    },
    thermo: async () => {
      const { createThermo } = await import(path.join(root, "src/effects/thermo/pipeline.ts"))
      return createThermo({ gpu, target: tgt, quality: 1 }, {
        step: await load("src/effects/thermo/step.wgsl"),
        present: await load("src/effects/thermo/present.wgsl"),
      })
    },
    harmonograph: async () => {
      const { createHarmonograph } = await import(path.join(root, "src/effects/harmonograph/pipeline.ts"))
      return createHarmonograph({ gpu, target: tgt, quality: 1 }, {
        draw: await load("src/effects/harmonograph/draw.wgsl"),
        present: await load("src/effects/harmonograph/present.wgsl"),
      })
    },
    ferro: async () => {
      const { createFerro } = await import(path.join(root, "src/effects/ferro/pipeline.ts"))
      return createFerro({ gpu, target: tgt, quality: 1 }, await load("src/effects/ferro/ferro.wgsl"))
    },
    focus: async () => {
      const { createFocus } = await import(path.join(root, "src/effects/focus/pipeline.ts"))
      return createFocus({ gpu, target: tgt, quality: 1 }, await load("src/effects/focus/lens.wgsl"))
    },
    ebru: async () => {
      const { createEbru } = await import(path.join(root, "src/effects/ebru/pipeline.ts"))
      return createEbru({ gpu, target: tgt, quality: 1 }, { marble: await load("src/effects/ebru/marble.wgsl"), present: await load("src/effects/ebru/present.wgsl") })
    },
    lanterns: async () => {
      const { createLanterns } = await import(path.join(root, "src/effects/lanterns/pipeline.ts"))
      return createLanterns({ gpu, target: tgt, quality: 1 }, await load("src/effects/lanterns/lanterns.wgsl"))
    },
    enso: async () => {
      const { createEnso } = await import(path.join(root, "src/effects/enso/pipeline.ts"))
      return createEnso({ gpu, target: tgt, quality: 1 }, { ink: await load("src/effects/enso/ink.wgsl"), present: await load("src/effects/enso/present.wgsl") })
    },
    calibre: async () => {
      const { createCalibre } = await import(path.join(root, "src/effects/calibre/pipeline.ts"))
      return createCalibre({ gpu, target: tgt, quality: 1 }, await load("src/effects/calibre/calibre.wgsl"))
    },
    folio: async () => {
      const { createFolio } = await import(path.join(root, "src/effects/folio/pipeline.ts"))
      return createFolio({ gpu, target: tgt, quality: 1 }, await load("src/effects/folio/folio.wgsl"))
    },
    kintsugi: async () => {
      const { createKintsugi } = await import(path.join(root, "src/effects/kintsugi/pipeline.ts"))
      return createKintsugi({ gpu, target: tgt, quality: 1 }, {
        flow: await load("src/effects/kintsugi/flow.wgsl"),
        present: await load("src/effects/kintsugi/present.wgsl"),
      })
    },
    noctiluca: async () => {
      const { createNoctiluca } = await import(path.join(root, "src/effects/noctiluca/pipeline.ts"))
      return createNoctiluca({ gpu, target: tgt, quality: 1 }, {
        sim: await load("src/effects/noctiluca/sim.wgsl"),
        present: await load("src/effects/noctiluca/present.wgsl"),
      })
    },
    meadow: async () => {
      const { createMeadow } = await import(path.join(root, "src/effects/meadow/pipeline.ts"))
      return createMeadow({ gpu, target: tgt, quality: 1 }, {
        spring: await load("src/effects/meadow/spring.wgsl"),
        present: await load("src/effects/meadow/present.wgsl"),
      })
    },
    vigil: async () => {
      const { createVigil } = await import(path.join(root, "src/effects/vigil/pipeline.ts"))
      return createVigil({ gpu, target: tgt, quality: 1 }, await load("src/effects/vigil/vigil.wgsl"))
    },
    survey: async () => {
      const { createSurvey } = await import(path.join(root, "src/effects/survey/pipeline.ts"))
      return createSurvey({ gpu, target: tgt, quality: 1 }, {
        sculpt: await load("src/effects/survey/sculpt.wgsl"),
        present: await load("src/effects/survey/present.wgsl"),
      })
    },
    lido: async () => {
      const { createLido } = await import(path.join(root, "src/effects/lido/pipeline.ts"))
      return createLido({ gpu, target: tgt, quality: 1 }, {
        sim: await load("src/effects/lido/sim.wgsl"),
        present: await load("src/effects/lido/present.wgsl"),
      })
    },
    moire: async () => {
      const { createMoire } = await import(path.join(root, "src/effects/moire/pipeline.ts"))
      return createMoire({ gpu, target: tgt, quality: 1 }, await load("src/effects/moire/moire.wgsl"))
    },
    raking: async () => {
      const { createRaking } = await import(path.join(root, "src/effects/raking/pipeline.ts"))
      return createRaking({ gpu, target: tgt, quality: 1 }, await load("src/effects/raking/garden.wgsl"))
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
