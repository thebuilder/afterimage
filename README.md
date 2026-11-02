# Afterimage

Live visual experiments in WGSL, one at a time, running on
[vgpu](https://vgpu.sh).

The site is a vertical feed of full-screen effects with scroll snapping, newest
at the top. A new one lands most days: the first seventeen were the original
collection, everything from No. 18 on is a daily drop with a publish date. Scroll,
swipe or press ↓ for older ones; the tick rail on the right and the Archive (with search)
jump straight to any of them.

Only the screen in view and its two neighbours hold a canvas. Everything further
away is a flat gradient in the effect's accent colour, so the feed can grow to a
year of daily effects without a year of GPU surfaces. The interface stays at the
edges: a wordmark, Archive and About at the top, and a small pill at the bottom
right with Tune (the controls, collapsed by default), How it works, pause and
hide.

The page is deliberately quiet about how any of it works. A visitor gets the
image, its name, one sentence and three controls. Frame graphs, WGSL terminology
and implementation notes sit one disclosure down, and the architecture lives here
in the README rather than standing between a visitor and the moving picture.

One `Gpu` runs the whole page, and `src/lib/stage.ts` drives every `Surface` on
it from one `requestAnimationFrame` loop. The page only shows one canvas now, but
the stage still supports several (the headless scripts and any future preview
use it), so they share pipelines, bind groups, samplers and shader modules
instead of allocating a fresh set per canvas. Giving each canvas its own
`frameLoop` looks tidier and is wrong: every loop advances vgpu's frame clock, so
time would run as many times too fast as there are canvases.

```bash
npm install
npm run dev          # http://localhost:5177
```

Needs a WebGPU device: Chrome/Edge 113+, or Safari 26. Node 22.18 or newer,
because the headless scripts import `.ts` files directly. The dev port is 5177
with `strictPort`, so a busy port fails loudly instead of moving; `shots.sh` and
`.claude/launch.json` both assume it.

## The effects

| # | Effect | What it exercises | Controls |
|---|--------|-------------------|----------|
| 01 | **Flux Field** | compute shader, storage ping-pong, instanced draw from a storage buffer, HDR feedback | exposure, flow, trail |
| 02 | **Event Horizon** | 180-step geodesic integration per pixel, relativistic beaming | disk, orbit, tilt |
| 03 | **Deep Water** | heightfield solved by Newton iteration against the ray, procedural sky | swell, chop, sun |
| 04 | **Membrane** | 12 Gray-Scott passes per frame on an `rgba16float` ping-pong pair | feed, kill, relief |
| 05 | **Ink** | semi-Lagrangian advection, vorticity confinement, pointer forces | vorticity, dissipation, dye |
| 06 | **Lattice** | scene geometry, real vertex stage, offscreen depth target | displace, facets, spin |
| 07 | **Murmuration** | O(n²) flocking in compute, instanced oriented darts | cohesion, separation, speed |
| 08 | **Liquid Chrome** | sphere-traced SDF, smooth minimum, procedural studio HDRI | melt, spin, exposure |
| 09 | **Prism** | Voronoi cells, per-shard refraction, chromatic split | shards, refraction, dispersion |
| 10 | **Aurora Veil** | layered fbm drapes, domain shear, parallax | brightness, drift, fringe |
| 11 | **Wormhole** | perspective by inverse radius, cylindrical panel mapping | speed, twist, flare |
| 12 | **Iridescent Silk** | double domain warp, analytic normals, thin-film interference | fold scale, film, sheen |
| 13 | **Tesla Arc** | polar filaments, separated steering and jag noise scales | energy, chaos, fire rate |
| 14 | **Mandala** | kaleidoscopic fold, radial twist, zero-crossing filigree | segments, twist, zoom |
| 15 | **Truchet** | Truchet tiling, arc-length parametrisation, travelling pulses | tile scale, flow, charge |
| 16 | **Hex Reactor** | dual-lattice hex tiling, screen-space derivative rims | charge, cell density, sweep |
| 17 | **Datastream** | procedural 5×7 dot-matrix font from hash bits, CRT mask | density, fall speed, phosphor |

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
follows whatever is on screen. `/ink/how-it-works` opens that effect's
explanation directly, so an explanation is as linkable as an effect.

`/` is the top of the feed, the newest effect, and `/how-it-works` is its
explanation. The newest effect also answers at its own `/<id>`, and that is the
link to share, because `/` moves on tomorrow. Opening `/<id>` lands on that
screen of the feed without animating there.

The address bar follows the scroll with `replaceState`, never `pushState`:
scrolling through twenty screens should not take twenty presses of Back. The
screen counted as on view is the one an `IntersectionObserver` sees at 60% or
more, and the URL and title are written from it.

The index entries and the wordmark are anchors carrying a real `href`, so
right-click, cmd-click and "copy link address" all behave; the click handler only
takes over the plain left click.

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
  main.tsx          mounts App, imports index.css
  App.tsx           the whole page: the feed, the chrome over it, and the sheets
  index.css         Tailwind, our tokens and the few utilities the page uses
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
    utils.ts        `cn`, a falsy-dropping class joiner
  components/
    shader-view.tsx the canvas element every Surface attaches to
scripts/
  lib/              shared by the headless scripts: registry parsing, frame statistics
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

These five are the gate, and the first four need nothing but Node:

```bash
npm run typecheck           # tsc -b --noEmit
npm run lint                # oxlint
npm run build               # tsc -b && vite build
npm run check:registry      # registry invariants: "17 effects checked, 0 problems"
npm run check:wgsl          # every .wgsl file: "27 shaders checked, 0 failing"
```

`check:wgsl` prints a line per shader only for the ones that fail, and the
summary either way. To see a shader's reflection, run `vgpu check` on it
directly. It is fifth rather than first because `vgpu check` validates through
Dawn where it can find an adapter, which is why CI runs it as a separate,
informational job.

The rest need an adapter outright, so they run on my machine:

```bash
npm run doctor              # confirm this machine can acquire an adapter and render
npm run render              # render all 12 single-pass shaders to out/*.png via Dawn
npm run render -- aurora --t=3,14 --w=960 --h=540
npm run render -- ocean --set=swell=2.0   # override one control, repeatable
npm run render:multipass    # step flux, ink, boids, lattice and reaction 120 frames each
npm run og                  # render the newest effect into the Open Graph card
```

`--set` takes `--set=name=value`, one flag per control, and the name is a
`Params` member. Anything the harness does not recognise and you do not set
gets 1.

Both render scripts exit non-zero on failure: a shader that throws, an
asynchronous validation error off `gpu.onError`, or a frame that trips the
assertions in `scripts/lib/stats.mjs`, which is where a black frame and a
blown-out one both get caught. `ASSERT-FAIL` on stderr is the line to look for.

`npm run shots` captures the hero for every effect from a running dev server. It
picks effects by URL (`/<id>`), so it reaches every effect and stays correct when the
registry is reordered. It needs the `agent-browser` CLI on `PATH` and a dev
server on port 5177, and it says which one is missing rather than producing
blank PNGs. Pass ids to capture a subset:

```bash
npm run dev                 # in another shell, port 5177
npm run shots               # all of them
npm run shots ocean ink     # just these
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

Every single-pass shader declares a `Params` block that opens with the same
three members and then names its own controls, one `f32` each. That prefix is
what lets one adapter cover all of them, and the tail is what makes the knobs
per-effect. `src/shaders/ocean.wgsl` is the shape:

```wgsl
struct Params {
  res: vec2f,
  mouse: vec2f,
  time: f32,
  swell: f32,
  wind: f32,
  sun: f32,
}
@group(0) @binding(0) var<uniform> params: Params;
```

`res`, `mouse` and `time` are required; `npm run check:registry` fails the build
if one is missing, if a control key names no member, or if a member a control
names is not an `f32`.

`src/shaders/common.wgsl` holds helpers and nothing else. An imported WGSL
module may not declare `@group` or `@binding`, and vgpu's resolver rejects one
that does.

## Open Graph card

The social card is always the newest effect. `npm run og` renders it headless
through Dawn at exactly 1200x630 and at its declared control defaults, lays the
wordmark, number, name and tagline over it, and screenshots that to
`public/og.jpg` with Playwright. It also writes `public/og.json`, recording which
effect the card shows:

```bash
npm run og            # the newest registry entry
npm run og -- ink     # any other effect, for a one-off
```

Playwright is not a dependency; the script uses it when it can resolve it and
otherwise leaves `out/og-card.html` to screenshot by hand. On a machine without a
GPU, `npx vgpu install-software-renderer` once lets Dawn render on the CPU.

`check:registry` fails when `public/og.json` does not name the newest effect, so
a daily drop cannot ship with yesterday's card. At build time the `og` plugin in
`vite.config.ts` reads the same file into the `og:` and `twitter:` tags, and
versions the image URL with the effect id so link previews fetch the new card
instead of a cached one.

The absolute URL in the tags is filled in at build time by the `site-url` plugin
in `vite.config.ts`, from `VERCEL_PROJECT_PRODUCTION_URL` on Vercel or `SITE_URL`
anywhere else. With neither it collapses to a relative path.

## Housekeeping

`.github/workflows/ci.yml` runs on every push to `main` and every pull request.
The `verify` job is the gate: `typecheck`, `check:registry`, `lint`, `build`. A
second job runs `check:wgsl`, but it is `continue-on-error` until it has been
seen green on a GPU-less Linux runner, because `vgpu check` may not find a Dawn
adapter there. It is proven on macOS and Metal, which is where I run it.

[fallow](https://www.npmjs.com/package/fallow) runs over this repo, and a
PreToolUse hook in `.claude/settings.json` gates `git commit` and `git push` on
`fallow audit`.

`@vgpu/wgsl-std` is in `ignoreDependencies` because it is imported only from
`.wgsl` files, which fallow does not parse.
