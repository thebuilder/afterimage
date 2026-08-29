// Headless driver for the multi-pass effects. Resolves each .wgsl entry, builds
// the same pipeline the app builds, and steps it for N frames.
import { writeFileSync, mkdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { PNG } from "pngjs"
import { resolveShader } from "@vgpu/wgsl/runtime"
import { frame, init, target } from "vgpu/node"
import { frameViolations, luminance } from "./lib/stats.mjs"

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
const args = process.argv.slice(2)
const flags = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")))
const which = args.filter((a) => !a.startsWith("--"))
const W = Number(flags.w ?? 480)
const H = Number(flags.h ?? 270)
const FRAMES = Number(flags.frames ?? 120)

// Control defaults per effect, mirroring what the registry declares.
const CONTROLS = {
  flux: { exposure: 1, flow: 1, persistence: 0.92 },
  reaction: { feed: 0.0367, kill: 0.0605, relief: 1 },
  ink: { swirl: 1, dissipation: 0.5, dye: 1, glow: 1 },
  boids: { cohesion: 1, separation: 1, speed: 1, glow: 1 },
  lattice: { morph: 0.35, spin: 1, facets: 7, glow: 1 },
}

const load = async (p) => (await resolveShader({ entry: path.join(root, p) })).wgsl

mkdirSync(path.join(root, "out"), { recursive: true })
const gpu = await init()
// Validation errors arrive asynchronously, so a pass can fail without the
// frame call throwing. Count them and fail the process at the end.
let gpuErrors = 0
gpu.onError((err) => {
  gpuErrors++
  console.error(`gpu-error: ${err?.code ?? ""} ${err?.message ?? err}`)
})
const tgt = target(gpu, { size: [W, H] })

const specs = {
  flux: async () => {
    const { createFlux } = await import(path.join(root, "src/effects/flux/pipeline.ts"))
    const src = {
      advect: await load("src/effects/flux/advect.wgsl"),
      splat: await load("src/effects/flux/splat.wgsl"),
      fade: await load("src/effects/flux/fade.wgsl"),
      present: await load("src/effects/flux/present.wgsl"),
    }
    return createFlux({ gpu, target: tgt, quality: 1 }, src, { count: 60_000 })
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

for (const name of which.length ? which : Object.keys(specs)) {
  try {
    const inst = await specs[name]()
    let t = 0
    for (let i = 0; i < FRAMES; i++) {
      const dt = 1 / 60
      t += dt
      frame(gpu, (f) => inst.render(f, tgt, { time: t, dt, mouse: [0.5, 0.45], pointer: 0, controls: CONTROLS[name] ?? {} }))
    }
    const pixels = await tgt.read()
    const png = new PNG({ width: W, height: H })
    png.data.set(pixels)
    writeFileSync(path.join(root, "out", `${name}.png`), PNG.sync.write(png))
    const { mean, max } = luminance(pixels)
    console.log(`${name}: frames=${FRAMES} mean=${mean.toFixed(1)} max=${max}`)
    for (const violation of frameViolations(name, pixels, W, H)) {
      console.error(`ASSERT-FAIL ${violation}`)
      process.exitCode = 1
    }
  } catch (err) {
    console.error(`${name}: FAILED: ${err?.stack ?? err}`)
    process.exitCode = 1
  }
}
await gpu.settled()
if (gpuErrors > 0) process.exitCode = 1
gpu.dispose()
