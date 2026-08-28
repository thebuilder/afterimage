# Afterimage

A gallery of live visual experiments in WGSL, running on
[vgpu](https://vgpu.sh), styled with the
[Afterglow](https://afterglow.thebuilder.dk) shadcn registry.

The page is deliberately quiet about how any of it works. A visitor gets the
image, its name, one sentence and three controls. Frame graphs, WGSL terminology
and implementation notes sit one disclosure down, and the architecture lives here
in the README rather than standing between a visitor and the moving picture.

One `Gpu` runs the whole page. The hero and every gallery tile are separate
`Surface`s on that one device, driven from one `requestAnimationFrame` loop, so
they share pipelines, bind groups, samplers and shader modules instead of
allocating a fresh set per canvas. Giving each canvas its own `frameLoop` looks
tidier and is wrong: every loop advances vgpu's frame clock, so time would run as
many times too fast as there are canvases.

```bash
npm install
npm run dev
```

Needs a WebGPU device: Chrome/Edge 113+, or Safari 26.

## The effects

| # | Effect | What it exercises | Controls |
|---|--------|-------------------|----------|
| 01 | **Flux Field** | compute shader, storage ping-pong, instanced draw from a storage buffer, HDR feedback | exposure, flow, trail |
| 02 | **Event Horizon** | 180-step geodesic integration per pixel, relativistic beaming | disk, orbit, tilt |
| 03 | **Deep Water** | heightfield solved by Newton iteration against the ray, procedural sky | swell, chop, sun |
| 04 | **Ridgeline** | ridged multifractal, growing-step march plus bisection refine | altitude, erosion, haze |
| 05 | **Membrane** | 12 Gray-Scott passes per frame on an `rgba16float` ping-pong pair | feed, kill, relief |
| 06 | **Ink** | semi-Lagrangian advection, vorticity confinement, pointer forces | vorticity, dissipation, dye |
| 07 | **Lattice** | scene geometry, real vertex stage, offscreen depth target | displace, facets, spin |
| 08 | **Murmuration** | O(n²) flocking in compute, instanced oriented darts | cohesion, separation, speed |
| 09 | **Cumulus** | volumetric march with a per-sample light march, Beer-Lambert | coverage, density, sun |
| 10 | **Liquid Chrome** | sphere-traced SDF, smooth minimum, procedural studio HDRI | melt, spin, exposure |
| 11 | **Prism** | Voronoi cells, per-shard refraction, chromatic split | shards, refraction, dispersion |
| 12 | **Fractal Monolith** | Mandelbulb distance estimator, soft shadows, orbit-trap colour | power, spin, glow |
| 13 | **Aurora Veil** | layered fbm drapes, domain shear, parallax | brightness, drift, fringe |
| 14 | **Wormhole** | perspective by inverse radius, cylindrical panel mapping | speed, twist, flare |
| 15 | **Iridescent Silk** | double domain warp, analytic normals, thin-film interference | fold scale, film, sheen |
| 16 | **Tesla Arc** | polar filaments, separated steering and jag noise scales | energy, chaos, fire rate |
| 17 | **Mandala** | kaleidoscopic fold, radial twist, zero-crossing filigree | segments, twist, zoom |
| 18 | **Truchet** | Truchet tiling, arc-length parametrisation, travelling pulses | tile scale, flow, charge |
| 19 | **Hex Reactor** | dual-lattice hex tiling, screen-space derivative rims | charge, cell density, sweep |
| 20 | **Datastream** | procedural 5×7 dot-matrix font from hash bits, CRT mask | density, fall speed, phosphor |

## Copy

Each effect carries three layers, and the page reveals them in that order:

```ts
tagline      // one sentence about the image. Hero and card.
summary      // what makes it, and what the controls do. "How it works" panel.
explanation  // three named stages, in plain language.
technical    // insight, pipeline, techniques, notes, source. Collapsed.
```

`category` is a plain word (Particles, Water, Fractal) rather than a technique,
because `ray integration` printed above a picture of a black hole tells a visitor
nothing they came to find out. The technical `notes` are the original
implementation write-ups, moved down a level rather than cut.

## Links

The effect id is its URL slug, so `/ink` is a link to Ink and the address bar
follows whatever is in the hero. `/ink/how-it-works` opens that effect's
explanation directly, so an explanation is as linkable as an effect.

Catalogue tiles are anchors carrying a real `href`, so right-click, cmd-click and
"copy link address" all behave; the click handler only takes over the plain left
click.

The route is a single piece of state. Everything on the page derives from it and
the URL and title are written from it, so nothing reads `window.location` back
out to decide what to render. Two details that are easy to get wrong: writing the
URL has to be idempotent, because StrictMode invokes every effect twice and a
"first run" flag pushes on the second; and an unrecognised path is corrected with
`replaceState`, so Back does not walk into a URL the app rewrote.

`vercel.json` rewrites everything to `index.html`. Rewrites run after the
filesystem check, so real assets are still served as themselves.

## Controls

Each effect declares one to three knobs. For a single-pass effect the control
`key` is also the name of a `Params` member in its WGSL, so adding a knob is one
line in the registry and one `f32` in the shader:

```ts
ctl("swell", "Swell", 0.2, 2.2, 0.01, 1)   // registry
```
```wgsl
struct Params { res: vec2f, mouse: vec2f, time: f32, swell: f32, wind: f32, sun: f32 }
```

Multi-pass effects read theirs off `inputs.controls` and decide what to do with
them: Membrane feeds `feed` and `kill` straight into the reaction term, Flux
Field turns `trail` into the decay constant of its feedback buffer.

## Layout

```
src/
  shaders/          single-pass effects, one .wgsl each, plus common.wgsl helpers
  effects/
    types.ts        the EffectInstance / HeroEffect contract
    fullscreen.ts   adapter for the single-pass shaders
    index.ts        the registry the page renders from
    flux/           compute + instanced draw + trail feedback (4 shaders + pipeline.ts)
    reaction/       Gray-Scott ping-pong (3 shaders + pipeline.ts)
    ink/            semi-Lagrangian fluid (2 shaders + pipeline.ts)
    boids/          compute flocking + instanced draw (3 shaders + pipeline.ts)
    lattice/        scene geometry into a depth target (2 shaders + pipeline.ts)
  lib/
    gpu.ts          the one Gpu for the page
    stage.ts        surface lifecycle and the single rAF loop
  components/       Afterglow components plus ShaderView
```

Each multi-pass effect splits into a `pipeline.ts` that takes its WGSL as
arguments and an `index` entry that supplies them. That is what lets the same
pipeline run under Vite (through `@vgpu/wgsl/loader-vite`) and under plain Node
(through `resolveShader`), so the headless scripts test the code that ships.

## Verification

I tuned none of this by eye in a dev server. Every shader went through
`vgpu check`, then a headless Dawn render whose pixels I read back and looked
at as numbers. `scripts/render.mjs` reads each shader's `Params` struct through
`reflectSource`, so it fills whatever controls that shader happens to declare
rather than assuming a fixed uniform shape.

```bash
npm run doctor              # confirm this machine can acquire an adapter and render
npm run check:wgsl          # validate every .wgsl file and print its reflection
npm run render              # render each single-pass shader to out/*.png via Dawn
npm run render -- aurora --t=3,14 --w=960 --h=540
npm run render:multipass    # step flux and reaction for N frames, then read back
npm run shots               # capture each hero from the running dev server
```

`scripts/render.mjs` prints the mean and max luminance of every frame it writes.
That one number caught both things a thumbnail hides: a frame that is entirely
black, and one clipped to white. Flux Field came back at mean 234 of 255 on its
first run. The number is what told me the exposure was about ten times over
rather than merely hot, which turned the fix into arithmetic: the trail buffer
accumulates for `1 / (1 - decay)` frames, so per-particle energy has to scale
with `1 / count` or the same shader blows out the moment the population grows.

Two bugs came out of the same loop and would have been miserable to find by
eye. Particles spawned with `age = 0`, so the next dispatch reaped every one of
them before it drew. And the hex cell id, recovered as `p - local`, carried a
few ulps of per-pixel jitter, which put faint horizontal bands inside whichever
cells the scan sweep had lit. Building the id from the lattice index instead
makes it bit-identical across the cell.

One sharp edge worth knowing: `vgpu check` takes a single entry file and
silently ignores the rest, so the obvious `vgpu check src/**/*.wgsl` validates
exactly one shader and exits happy. `scripts/check-wgsl.sh` loops instead.

## Notes on the WGSL

Every single-pass shader declares the same uniform block, which is why one
adapter covers all of them:

```wgsl
struct Params { res: vec2f, mouse: vec2f, time: f32, intensity: f32 }
@group(0) @binding(0) var<uniform> params: Params;
```

`src/shaders/common.wgsl` holds helpers and nothing else. An imported WGSL
module may not declare `@group` or `@binding`, and vgpu's resolver rejects one
that does.

## Open Graph card

`public/og.jpg` is composed rather than screenshotted. `npm run og` renders Flux
Field headless through Dawn at exactly 1200x630, then lays the wordmark and
tagline over it in a standalone HTML file and prints the path:

```bash
npm run og            # reuses out/og-art.png if it is already there
npm run og -- --render  # force a fresh render of the art
```

Screenshot that file at a 1200x630 viewport and convert it:

```bash
sips -s format jpeg -s formatOptions 88 out/og-draft.png --out public/og.jpg
```

The absolute URL in the tags is filled in at build time by the `site-url` plugin
in `vite.config.ts`, from `VERCEL_PROJECT_PRODUCTION_URL` on Vercel or `SITE_URL`
anywhere else. With neither it collapses to a relative path.

## Housekeeping

[fallow](https://www.npmjs.com/package/fallow) runs over this repo, and a
PreToolUse hook in `.claude/settings.json` gates `git commit` and `git push` on
`fallow audit`.

`.fallowrc.json` lists the vendored Afterglow components as entry points rather
than ignoring them. Ignoring a file drops it out of the module graph, which took
its imports with it and turned five real dependencies into phantom unused ones.
Entry points keep the edges and stop the components themselves being reported.

`@vgpu/wgsl-std` is in `ignoreDependencies` because it is imported only from
`.wgsl` files, which fallow does not parse.
