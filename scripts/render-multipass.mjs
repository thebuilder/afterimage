// Headless driver for the multi-pass effects. Resolves each .wgsl entry, builds
// the same pipeline the app builds, and steps it for N frames.
import { writeFileSync, mkdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { PNG } from "pngjs"
import { frame, init, target } from "vgpu/node"
import { frameViolations, luminance } from "./lib/stats.mjs"
import { parseEffects } from "./lib/registry.mjs"
import { multipassSpecs } from "./lib/multipass.mjs"

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
const args = process.argv.slice(2)
const flags = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")))
const which = args.filter((a) => !a.startsWith("--"))
const W = Number(flags.w ?? 480)
const H = Number(flags.h ?? 270)
const FRAMES = Number(flags.frames ?? 120)

// Control defaults per effect, read straight out of the registry so the
// headless run and the page cannot disagree.
const CONTROLS = Object.fromEntries(
  parseEffects().map((e) => [e.id, Object.fromEntries(e.controls.map((c) => [c.key, c.value]))])
)

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

const specs = multipassSpecs(gpu, tgt)

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
