// Builds the Open Graph card.
//
// The art is rendered headless through Dawn at the exact card size, so it is the
// real shader rather than a resized screenshot, and the typography is laid over
// it in a standalone HTML file. Run this, then screenshot the printed file at
// 1200x630. See "Open Graph card" in the README.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { PNG } from "pngjs"
import { resolveShader } from "@vgpu/wgsl/runtime"
import { frame, init, target } from "vgpu/node"

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
const W = 1200
const H = 630
const FRAMES = 320 // Flux Field's trail buffer needs time to grow its filaments.

const load = async (p) => (await resolveShader({ entry: path.join(root, p) })).wgsl

mkdirSync(path.join(root, "out"), { recursive: true })
const artPath = path.join(root, "out", "og-art.png")

if (!existsSync(artPath) || process.argv.includes("--render")) {
  const gpu = await init()
  const tgt = target(gpu, { size: [W, H] })
  const { createFlux } = await import(path.join(root, "src/effects/flux/pipeline.ts"))
  const effect = createFlux(
    { gpu, target: tgt, quality: 1 },
    {
      advect: await load("src/effects/flux/advect.wgsl"),
      splat: await load("src/effects/flux/splat.wgsl"),
      fade: await load("src/effects/flux/fade.wgsl"),
      present: await load("src/effects/flux/present.wgsl"),
    },
    { count: 220_000 }
  )
  let t = 0
  for (let i = 0; i < FRAMES; i++) {
    const dt = 1 / 60
    t += dt
    frame(gpu, (f) =>
      effect.render(f, tgt, {
        time: t,
        dt,
        mouse: [0.5, 0.45],
        pointer: 0,
        controls: { exposure: 1.05, flow: 1, persistence: 0.94 },
      })
    )
  }
  const pixels = await tgt.read()
  const png = new PNG({ width: W, height: H })
  png.data.set(pixels)
  writeFileSync(artPath, PNG.sync.write(png))
  gpu.dispose()
  console.log("rendered art")
}

const art = readFileSync(artPath).toString("base64")

const html = `<!doctype html>
<meta charset="utf-8" />
<style>
  :root {
    --void: #05090a;
    --phosphor: #86fadd;
    --phosphor-bright: #d9ffef;
    --signal: #ff5b82;
    --ink: #e9f6f1;
    --mono: "SFMono-Regular", "IBM Plex Mono", Consolas, monospace;
    --sans: "Helvetica Neue", Inter, Arial, sans-serif;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: ${W}px; height: ${H}px; overflow: hidden; background: var(--void); }
  .card { position: relative; width: ${W}px; height: ${H}px; isolation: isolate;
    display: grid; place-items: center; text-align: center; }
  .art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  /* The wordmark sits in the middle, which is where the filaments are brightest,
     so the scrim is radial rather than a bottom-up gradient. */
  .scrim { position: absolute; inset: 0;
    background: radial-gradient(ellipse 62% 58% at 50% 50%, rgb(5 9 10 / .88) 0%, rgb(5 9 10 / .70) 45%, rgb(5 9 10 / .18) 78%, transparent 100%); }
  .scan { position: absolute; inset: 0; mix-blend-mode: multiply;
    background: repeating-linear-gradient(to bottom, transparent 0 2px, rgb(0 0 0 / .18) 2px 3px); }
  .frame { position: absolute; inset: 0; border: 1px solid rgb(132 255 224 / .22); }

  .stack { position: relative; display: grid; justify-items: center; gap: 30px; padding: 0 60px; }
  .lockup { display: flex; align-items: center; gap: 28px; }
  .mark { position: relative; width: 60px; height: 60px; flex: none; }
  .mark i { position: absolute; width: 42px; height: 42px; }
  .mark .a { right: 0; bottom: 0; background: var(--signal); }
  .mark .b { top: 0; left: 0; background: var(--phosphor); box-shadow: 0 0 40px rgb(134 250 221 / .5); }
  .name { font: 700 76px/1 var(--mono); letter-spacing: .2em; color: var(--phosphor-bright);
          text-transform: uppercase; text-shadow: 0 0 70px rgb(0 0 0 / .95); padding-left: .2em; }
  .rule { width: 132px; height: 1px; background: rgb(132 255 224 / .38); }
  .sub { font: 400 25px/1.45 var(--sans); color: var(--ink); white-space: nowrap;
         text-shadow: 0 1px 18px rgb(0 0 0 / .95); }
</style>
<div class="card">
  <img class="art" src="data:image/png;base64,${art}" alt="" />
  <div class="scrim"></div>
  <div class="stack">
    <div class="lockup">
      <span class="mark"><i class="a"></i><i class="b"></i></span>
      <span class="name">Afterimage</span>
    </div>
    <span class="rule"></span>
    <p class="sub">Full-viewport WebGPU hero effects, built with vgpu.</p>
  </div>
  <div class="scan"></div>
  <div class="frame"></div>
</div>
`
const out = path.join(root, "out", "og-card.html")
writeFileSync(out, html)
console.log(`card: file://${out}`)
