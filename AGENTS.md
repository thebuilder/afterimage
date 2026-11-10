# Agent rules

Rules whose violation is silent: the build stays green, the page still renders,
and the thing you changed quietly stops working. Read this before editing.

The README explains the architecture. This file is only the traps.

## Environment

- Node 22.18 or newer. The headless scripts import `.ts` files directly.
- Dev server is port 5177, `strictPort`. `scripts/shots.sh` and
  `.claude/launch.json` both hard-code it.
- `npm ci`, not `npm install`, when you are only running the checks.

## Styling

Tailwind v4 with our own small set of tokens in the `@theme` block of
`src/index.css`, plus a handful of `@utility` classes (`feed`, `legible`, `meta`,
`range`, `sheet`). There is no component library: dialogs are native
`<dialog>`, sliders are native `<input type="range">`, icons are inline SVG.
Keep it that way unless there is a reason a native element cannot carry.

On a feed screen only the effect's name sits on the picture, with the
`legible` text shadow and no gradient. Number, date, category and tagline live
in the Archive and How it works; do not bring small type back over the frame,
it cannot be made readable on every effect without darkening the picture.

The interface is chrome over a picture. Anything added to the always-visible
layer costs screen the effect could have had, so new controls go behind Tune,
How it works, Archive or About, not next to them.

## WGSL

- Always `npm run check:wgsl`. Never `vgpu check src/**/*.wgsl`: `vgpu check`
  takes one entry file, silently ignores the rest of the glob, validates the
  first shader and exits 0. `scripts/check-wgsl.sh` loops over all 27.
- An imported WGSL module may not declare `@group` or `@binding`. vgpu's
  resolver rejects one that does. `src/shaders/common.wgsl` is helpers only.
- Single-pass shaders declare `struct Params` opening with `res: vec2f`,
  `mouse: vec2f`, `time: f32`, then one `f32` per control key.

## Adding an effect

The registry is in publish order. An effect's number is its position, and `/`
shows the last entry, so a new effect is always appended at the end, never
inserted. Every entry from No. 14 on is a daily drop and carries
`published: "YYYY-MM-DD"` on its own line directly under `name`; the parser in
`scripts/lib/registry.mjs` matches that exact shape, and `check:registry` fails
a missing, malformed or out-of-order date.

1. One entry at the end of `src/effects/index.ts`: unique kebab-case id, a `category`, 1 to
   3 controls, and a `technical.source` path that exists on disk. `App.tsx`
   publishes `source` as a live GitHub link, so a wrong path ships a public 404.
2. For a single-pass effect, one `f32` in that shader's `Params` per control
   key. A control key with no matching member is a dead knob: the adapter falls
   back to the declared default and the slider does nothing.
3. A `rationale` block directly above `technical`, one line per answer:
   `idea`, `firstSeconds`, `interaction`, `headline`, `nearest`, `risks` (see
   "Think first" below). The How it works sheet shows it under "Why this one".
4. `npm run check:registry` enforces all of the above.
5. Add a row to the effects table in the README.

### Think first

Before writing any shader, answer six questions, a sentence or two each. If an
answer comes out vague, the idea is not ready; if they come out generic, pick a
different idea. A clever technique nobody would put on their homepage is a
demo, not a hero.

1. **What's the one-sentence idea?** (`idea`) If it can't be said simply, it
   isn't clear yet.
2. **What does it feel like in the first 3 seconds, before any interaction?**
   (`firstSeconds`) Most visitors never move the mouse, so the idle state is
   the effect.
3. **Why does the interaction matter?** (`interaction`) The pointer should
   reveal or change something, not just follow the cursor.
4. **Where does the headline live?** (`headline`) Name the calm area that keeps
   text readable. The title and controls already sit in the lower left.
5. **What's it closest to in the archive, and how is it different?**
   (`nearest`) Read every category and tagline in the registry first.
6. **What could ruin it?** (`risks`) Too slow on a laptop, too busy, or a
   gimmick that wears off after one visit. Then design against it.

These answers ship as the entry's `rationale` and go in the report on the drop.
The effect also has to stay fast: Ridgeline, Cumulus and Fractal Monolith were
removed for being too heavy, so prefer one cheap pass over an expensive look.

### Today's effect, start to finish

Daily drops go straight to `main`, no pull request, once every check below
passes.

```bash
git switch -c effect/<id> origin/main
# write the rationale first (above)
# single pass: src/shaders/<id>.wgsl   multi-pass: src/effects/<id>/{*.wgsl,pipeline.ts}
# append the registry entry with published: "<today>"
npm run render -- <id> --t=1,4,9   # single pass; read the luminance numbers
npm run og                         # the newest effect's social card
npm run check:wgsl && npm run check:registry && npm run typecheck && npm run lint && npm run build
git push origin HEAD:main
```

The effect is a hero, not a demo reel: it has to read at full screen with the
title and controls over its lower left, respond to the pointer, and settle into
something worth leaving on with the UI hidden. One to three controls.

## Verify in this order

```bash
npm run check:wgsl        # 27 shaders checked, 0 failing
npm run check:registry    # 23 effects checked, 0 problems
npm run typecheck
npm run lint
npm run build
npm run render            # GPU. Exits non-zero on ASSERT-FAIL
npm run render:multipass  # GPU. Same
```

The render scripts assert against black and blown-out frames and set a non-zero
exit code, so check the exit code, not just the log. Overriding a control is
`--set=name=value`, not `--set name=value`.

The browser is last, and only for what the headless path cannot show. Numbers
first: `scripts/render.mjs` prints mean and max luminance per frame, and that is
what catches an exposure that is ten times over rather than merely hot.

## Do not tidy

- `@vgpu/wgsl-std` sits in `ignoreDependencies` because it is imported only from
  `.wgsl` files, which fallow does not parse.

## Committing

A PreToolUse hook in `.claude/settings.json` runs
`.claude/hooks/fallow-gate.sh`, which gates `git commit` and `git push` on
`fallow audit`. A `fail` verdict blocks the command. Runtime errors fail open
with a stderr notice, so read stderr when a commit goes through unexpectedly
quietly.

## Open Graph card

Every effect has its own card at `public/og/<id>.jpg`, and every effect URL
gets its own HTML at build time (title, description, canonical, og:url, card),
so a shared link previews that effect. `/` carries the newest card. After adding
an effect, run `npm run og` (renders the newest) and commit
`public/og/<id>.jpg`; `check:registry` fails until you do.
Without a GPU, run `npx vgpu install-software-renderer` once first.
