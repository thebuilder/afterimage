// Builds the Open Graph card from the newest effect, or the one named.
//
//   npm run og            # the newest registry entry
//   npm run og -- ink     # a specific effect
//
// The art is the real shader rendered headless through Dawn at 1200x630, at the
// effect's declared control defaults. The type is laid over it in a small HTML
// page, and that page is screenshotted to `public/og.jpg` with Playwright when
// it is installed. Without Playwright the HTML is written to `out/og-card.html`
// for a manual 1200x630 screenshot; save it as `public/og.jpg` and update
// `public/og.json` by hand.
//
// `public/og.json` records which effect the card shows. `check:registry` fails
// when that is not the newest effect, so a new daily drop cannot ship with
// yesterday's card.
import { mkdirSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { PNG } from "pngjs"
import { resolveShader } from "@vgpu/wgsl/runtime"
import { reflectSource } from "@vgpu/wgsl/reflect-source"
import { effect as fullscreen, frame, init, target } from "vgpu/node"
import { multipassSpecs } from "./lib/multipass.mjs"
import { parseEffects, root, wgslImports } from "./lib/registry.mjs"
import { frameViolations, luminance } from "./lib/stats.mjs"

const W = 1200
const H = 630
/** Simulations need time to grow; a single-pass shader is drawn at this time. */
const FRAMES = 300
const SINGLE_PASS_TIME = 4.2

const effects = parseEffects()
const wanted = process.argv.slice(2).find((a) => !a.startsWith("--"))
const fx = wanted ? effects.find((e) => e.id === wanted) : effects.at(-1)
if (!fx) {
  console.error(`og: no effect "${wanted}"`)
  process.exit(1)
}
const number = String(effects.indexOf(fx) + 1).padStart(2, "0")
const defaults = Object.fromEntries(fx.controls.map((c) => [c.key, c.value]))

mkdirSync(path.join(root, "out"), { recursive: true })

// ── Art ─────────────────────────────────────────────────────────────────
const gpu = await init()
let gpuErrors = 0
gpu.onError((err) => {
  gpuErrors++
  console.error(`gpu-error: ${err?.code ?? ""} ${err?.message ?? err}`)
})
const tgt = target(gpu, { size: [W, H] })
const mouse = [0.62, 0.48]

if (fx.wgslIdent) {
  const shader = wgslImports().get(fx.wgslIdent)
  const { wgsl } = await resolveShader({ entry: path.join(root, shader) })
  const members =
    reflectSource(wgsl).bindings.find((b) => b.name === "params")?.struct?.members ?? []
  const params = { res: [W, H], mouse, time: SINGLE_PASS_TIME }
  for (const m of members) if (!(m.name in params)) params[m.name] = defaults[m.name] ?? 1
  fullscreen(gpu, wgsl, { set: { params } }).draw(tgt)
} else {
  const spec = multipassSpecs(gpu, tgt, { fluxCount: 220_000 })[fx.id]
  if (!spec) {
    console.error(`og: ${fx.id} is multi-pass but has no entry in scripts/lib/multipass.mjs`)
    process.exit(1)
  }
  const inst = await spec()
  let t = 0
  for (let i = 0; i < FRAMES; i++) {
    const dt = 1 / 60
    t += dt
    frame(gpu, (f) => inst.render(f, tgt, { time: t, dt, mouse, pointer: 0, controls: defaults }))
  }
}

const pixels = await tgt.read()
await gpu.settled()
gpu.dispose()
const { mean, max } = luminance(pixels)
console.log(`og art ${fx.id}: mean=${mean.toFixed(1)} max=${max}`)
const violations = frameViolations(fx.id, pixels, W, H)
for (const v of violations) console.error(`ASSERT-FAIL ${v}`)
if (gpuErrors > 0 || violations.length > 0) process.exit(1)

const png = new PNG({ width: W, height: H })
png.data.set(pixels)
const art = PNG.sync.write(png)
writeFileSync(path.join(root, "out", "og-art.png"), art)

// ── Card ────────────────────────────────────────────────────────────────
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const date = fx.published
  ? new Date(`${fx.published}T00:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    })
  : ""

const html = `<!doctype html>
<meta charset="utf-8" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500&display=swap" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: ${W}px; height: ${H}px; overflow: hidden; background: #050505; color: #f3f1ec;
    font-family: "Inter Tight", "Inter", "Helvetica Neue", Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  .card { position: relative; width: ${W}px; height: ${H}px; padding: 44px 52px; display: flex; flex-direction: column; justify-content: space-between; }
  .art { position: absolute; inset: 0; width: 100%; height: 100%; z-index: -2; }
  .scrim { position: absolute; inset: 0; z-index: -1;
    background: linear-gradient(to top, rgb(0 0 0 / .78), rgb(0 0 0 / .3) 40%, transparent 65%),
                linear-gradient(to bottom, rgb(0 0 0 / .5), transparent 25%); }
  .top { display: flex; align-items: center; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 14px; font-weight: 500; font-size: 26px; letter-spacing: -0.01em; }
  .mark { position: relative; width: 24px; height: 24px; }
  .mark i { position: absolute; width: 17px; height: 17px; }
  .mark .ghost { right: 0; bottom: 0; background: rgb(243 241 236 / .3); }
  .mark .lit { top: 0; left: 0; background: #f3f1ec; }
  .meta { font: 500 17px/1 ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: .08em; text-transform: uppercase; color: rgb(243 241 236 / .7); }
  .meta b { font-weight: 500; color: ${fx.accent || "#f3f1ec"}; }
  h1 { margin-top: 18px; font-weight: 500; font-size: ${fx.name.length > 14 ? 104 : 128}px; line-height: .88; letter-spacing: -0.045em; max-width: 15ch; }
  p { margin-top: 22px; max-width: 44ch; font-size: 26px; line-height: 1.35; color: rgb(243 241 236 / .72); }
</style>
<div class="card">
  <img class="art" src="data:image/png;base64,${art.toString("base64")}" alt="" />
  <div class="scrim"></div>
  <div class="top">
    <span class="brand"><span class="mark"><i class="ghost"></i><i class="lit"></i></span>Afterimage</span>
    <span class="meta">Live in your browser</span>
  </div>
  <div>
    <div class="meta"><b>No. ${number}</b>${date ? ` &nbsp;·&nbsp; ${esc(date)}` : ""} &nbsp;·&nbsp; ${esc(fx.category)}</div>
    <h1>${esc(fx.name)}</h1>
    <p>${esc(fx.tagline)}</p>
  </div>
</div>
`
const cardPath = path.join(root, "out", "og-card.html")
writeFileSync(cardPath, html)

let chromium = null
try {
  // Resolved from the project, or from a global install; it is not a dependency.
  ;({ chromium } = createRequire(path.join(root, "package.json"))("playwright"))
} catch {
  try {
    ;({ chromium } = await import("playwright"))
  } catch {
    chromium = null
  }
}

if (!chromium) {
  console.log(`card: file://${cardPath}`)
  console.log("Playwright not found: screenshot that file at 1200x630 and save it as public/og.jpg.")
} else {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: W, height: H } })
  await page.setContent(html, { waitUntil: "networkidle" })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: path.join(root, "public", "og.jpg"), type: "jpeg", quality: 88 })
  await browser.close()
  // Only recorded once the card itself is written, so og.json never claims a
  // card that is not there.
  writeFileSync(
    path.join(root, "public", "og.json"),
    `${JSON.stringify({ id: fx.id, number, name: fx.name, tagline: fx.tagline }, null, 2)}\n`
  )
  console.log(`wrote public/og.jpg (${fx.name})`)
}
