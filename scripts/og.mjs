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
    --panel: #0b1515;
    --line: rgb(132 255 224 / .22);
    --line-strong: rgb(132 255 224 / .55);
    --phosphor: #86fadd;
    --phosphor-bright: #d9ffef;
    --phosphor-dim: #4d8477;
    --signal: #ff5b82;
    --ink: #e9f6f1;
    --ink-muted: #87a39d;
    --mono: "SFMono-Regular", "IBM Plex Mono", Consolas, monospace;
    --sans: "Helvetica Neue", Inter, Arial, sans-serif;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: ${W}px; height: ${H}px; overflow: hidden; background: var(--void); }
  .card { position: relative; width: ${W}px; height: ${H}px; isolation: isolate;
    display: grid; grid-template-rows: auto 1fr; }
  .art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: -1; }

  /* The copy sits on a real surface rather than on a gradient: hairline border,
     a little of the void, and the art blurred behind it. That is the same panel
     the hero's controls live in, which is the point. */
  .bar { display: flex; align-items: center; justify-content: space-between;
    padding: 0 34px; height: 62px;
    background: rgb(9 18 18 / .82); backdrop-filter: blur(3px);
    border-bottom: 1px solid var(--line); }
  .barGroup { display: flex; align-items: center; gap: 13px; }
  .led { width: 8px; height: 8px; border-radius: 50%; background: var(--phosphor);
    box-shadow: 0 0 10px var(--phosphor); }
  .meta { font: 600 13px/1 var(--mono); letter-spacing: .18em; text-transform: uppercase; color: var(--ink-muted); }
  .meta em { font-style: normal; color: var(--phosphor); }

  .body { display: grid; place-items: center; padding: 0 56px; }
  .panel { position: relative; display: grid; justify-items: start; gap: 26px;
    padding: 46px 56px 48px;
    background: rgb(5 9 10 / .66); backdrop-filter: blur(9px);
    border: 1px solid var(--line-strong);
    box-shadow: 0 2rem 5rem rgb(0 0 0 / .7), 0 0 60px rgb(134 250 221 / .06); }
  /* Corner ticks, the way the system marks a live panel. */
  .panel::before, .panel::after { content: ""; position: absolute; width: 16px; height: 16px; }
  .panel::before { top: -2px; left: -2px; border-top: 3px solid var(--phosphor); border-left: 3px solid var(--phosphor); }
  .panel::after { right: -2px; bottom: -2px; border-right: 3px solid var(--phosphor); border-bottom: 3px solid var(--phosphor); }

  .lockup { display: flex; align-items: center; gap: 26px; }
  .mark { position: relative; width: 56px; height: 56px; flex: none; }
  .mark i { position: absolute; width: 39px; height: 39px; }
  .mark .a { right: 0; bottom: 0; background: var(--signal); }
  .mark .b { top: 0; left: 0; background: var(--phosphor); box-shadow: 0 0 34px rgb(134 250 221 / .45); }
  .name { font: 700 66px/1 var(--mono); letter-spacing: .2em; color: var(--phosphor-bright);
          text-transform: uppercase; padding-left: .2em; }
  .sub { font: 400 24px/1.4 var(--sans); color: var(--ink); }

  .scan { position: absolute; inset: 0; mix-blend-mode: multiply; z-index: 2;
    background: repeating-linear-gradient(to bottom, transparent 0 2px, rgb(0 0 0 / .17) 2px 3px); }
  .frame { position: absolute; inset: 0; z-index: 3; border: 1px solid var(--line); }
</style>
<div class="card">
  <img class="art" src="data:image/png;base64,${art}" alt="" />
  <div class="bar">
    <span class="barGroup"><i class="led"></i><span class="meta">webgpu hero lab</span></span>
    <span class="meta">built with <em>vgpu</em></span>
  </div>
  <div class="body">
    <div class="panel">
      <div class="lockup">
        <span class="mark"><i class="a"></i><i class="b"></i></span>
        <span class="name">Afterimage</span>
      </div>
      <p class="sub">Full-viewport WebGPU hero effects, written in WGSL.</p>
    </div>
  </div>
  <div class="scan"></div>
  <div class="frame"></div>
</div>
`
const out = path.join(root, "out", "og-card.html")
writeFileSync(out, html)
console.log(`card: file://${out}`)
