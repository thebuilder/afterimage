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
`src/index.css`, plus a handful of `@utility` classes (`feed`, `scrim`, `meta`,
`range`, `sheet`). There is no component library: dialogs are native
`<dialog>`, sliders are native `<input type="range">`, icons are inline SVG.
Keep it that way unless there is a reason a native element cannot carry.

The interface is chrome over a picture. Anything added to the always-visible
layer costs screen the effect could have had, so new controls go behind Tune,
How it works, Index or About, not next to them.

## WGSL

- Always `npm run check:wgsl`. Never `vgpu check src/**/*.wgsl`: `vgpu check`
  takes one entry file, silently ignores the rest of the glob, validates the
  first shader and exits 0. `scripts/check-wgsl.sh` loops over all 30.
- An imported WGSL module may not declare `@group` or `@binding`. vgpu's
  resolver rejects one that does. `src/shaders/common.wgsl` is helpers only.
- Single-pass shaders declare `struct Params` opening with `res: vec2f`,
  `mouse: vec2f`, `time: f32`, then one `f32` per control key.

## Adding an effect

The registry is in publish order. An effect's number is its position, and `/`
shows the last entry, so a new effect is always appended at the end, never
inserted. Every entry from No. 21 on is a daily drop and carries
`published: "YYYY-MM-DD"` on its own line directly under `name`; the parser in
`scripts/lib/registry.mjs` matches that exact shape, and `check:registry` fails
a missing, malformed or out-of-order date.

1. One entry at the end of `src/effects/index.ts`: unique kebab-case id, a `category`, 1 to
   3 controls, and a `technical.source` path that exists on disk. `App.tsx`
   publishes `source` as a live GitHub link, so a wrong path ships a public 404.
2. For a single-pass effect, one `f32` in that shader's `Params` per control
   key. A control key with no matching member is a dead knob: the adapter falls
   back to the declared default and the slider does nothing.
3. `npm run check:registry` enforces all of the above.
4. Add a row to the effects table in the README.

### Today's effect, start to finish

```bash
git switch -c effect/<id>
# single pass: src/shaders/<id>.wgsl   multi-pass: src/effects/<id>/{*.wgsl,pipeline.ts}
# append the registry entry with published: "<today>"
npm run check:wgsl && npm run check:registry && npm run typecheck && npm run lint && npm run build
npm run render -- <id> --t=1,4,9   # single pass, GPU machine; read the luminance numbers
```

The effect is a hero, not a demo reel: it has to read at full screen with the
title and controls over its lower left, respond to the pointer, and settle into
something worth leaving on with the UI hidden. One to three controls.

## Verify in this order

```bash
npm run check:wgsl        # 30 shaders checked, 0 failing
npm run check:registry    # 20 effects checked, 0 problems
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

`npm run og` renders the art through Dawn at 1200x630 and writes
`out/og-card.html`. Screenshotting that file at a 1200x630 viewport and saving
it as `out/og-draft.png` is manual, no script produces it. The `sips` line in
the README then converts it to `public/og.jpg`.
