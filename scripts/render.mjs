// Headless preview renderer: resolves a .wgsl entry, draws N frames, writes PNGs.
// Usage: node scripts/render.mjs aurora [more...] [--t=2.5] [--w=480] [--h=270]
import { readdirSync, writeFileSync, mkdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { PNG } from "pngjs"
import { resolveShader } from "@vgpu/wgsl/runtime"
import { reflectSource } from "@vgpu/wgsl/reflect-source"
import { effect, init, target } from "vgpu/node"
import { frameViolations, luminance } from "./lib/stats.mjs"

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
const args = process.argv.slice(2)
const flags = Object.fromEntries(
  args.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("="))
)
// --set name=value, repeatable, overrides one control default.
const SET = Object.fromEntries(
  args
    .filter((a) => a.startsWith("--set="))
    .map((a) => a.slice(6).split("="))
    .map(([k, v]) => [k, Number(v)])
)
let names = args.filter((a) => !a.startsWith("--"))
if (names.length === 0) {
  names = readdirSync(path.join(root, "src/shaders"))
    .filter((f) => f.endsWith(".wgsl") && f !== "common.wgsl")
    .map((f) => f.replace(/\.wgsl$/, ""))
}

const W = Number(flags.w ?? 480)
const H = Number(flags.h ?? 270)
const TIMES = (flags.t ?? "3.7").split(",").map(Number)

mkdirSync(path.join(root, "out"), { recursive: true })
const gpu = await init()
// Validation errors arrive asynchronously, so a shader can fail without the
// draw call throwing. Count them and fail the process at the end.
let gpuErrors = 0
gpu.onError((err) => {
  gpuErrors++
  console.error(`gpu-error: ${err?.code ?? ""} ${err?.message ?? err}`)
})
const tgt = target(gpu, { size: [W, H] })

for (const name of names) {
  const entry = path.join(root, "src/shaders", `${name}.wgsl`)
  try {
    const resolved = await resolveShader({ entry })

    // Every shader declares its own control members, so the harness reads the
    // Params struct instead of hard-coding a uniform shape. Anything it does not
    // recognise gets 1, or whatever --set names.
    const reflection = reflectSource(resolved.wgsl)
    const members =
      reflection.bindings.find((b) => b.name === "params")?.struct?.members ?? []
    const base = { res: [W, H], mouse: [0.5, 0.42], time: TIMES[0] }
    const params = { ...base }
    for (const mem of members) {
      if (mem.name in base) continue
      params[mem.name] = mem.name in SET ? SET[mem.name] : 1
    }

    const fx = effect(gpu, resolved.wgsl, { set: { params } })
    for (const t of TIMES) {
      fx.set({ params: { time: t } })
      fx.draw(tgt)
      const pixels = await tgt.read()
      const png = new PNG({ width: W, height: H })
      png.data.set(pixels)
      const suffix = TIMES.length > 1 ? `-t${t}` : ""
      writeFileSync(path.join(root, "out", `${name}${suffix}.png`), PNG.sync.write(png))
      // Cheap sanity numbers: a black frame and a blown-out frame both show up here.
      const { mean, max } = luminance(pixels)
      console.log(`${name}${suffix}: mean=${mean.toFixed(1)} max=${max}`)
      for (const violation of frameViolations(`${name}${suffix}`, pixels, W, H)) {
        console.error(`ASSERT-FAIL ${violation}`)
        process.exitCode = 1
      }
    }
  } catch (err) {
    console.error(`${name}: FAILED: ${err?.message ?? err}`)
    process.exitCode = 1
  }
}
await gpu.settled()
if (gpuErrors > 0) process.exitCode = 1
gpu.dispose()
