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

`src/index.css` belongs to the Afterglow registry and is rewritten wholesale on
`shadcn add`. Anything of ours in there is one update away from disappearing.
Project tokens go in `src/theme.css`, which `index.css` imports. The rule is
written at the top of `src/theme.css` too.

Same for `src/components/ui/*.tsx`: vendored, replaced by the registry. Project
components live one level up in `src/components/`.

## WGSL

- Always `npm run check:wgsl`. Never `vgpu check src/**/*.wgsl`: `vgpu check`
  takes one entry file, silently ignores the rest of the glob, validates the
  first shader and exits 0. `scripts/check-wgsl.sh` loops over all 30.
- An imported WGSL module may not declare `@group` or `@binding`. vgpu's
  resolver rejects one that does. `src/shaders/common.wgsl` is helpers only.
- Single-pass shaders declare `struct Params` opening with `res: vec2f`,
  `mouse: vec2f`, `time: f32`, then one `f32` per control key.

## Adding an effect

1. One entry in `src/effects/index.ts`: unique kebab-case id, a `category`, 1 to
   3 controls, and a `technical.source` path that exists on disk. `App.tsx`
   publishes `source` as a live GitHub link, so a wrong path ships a public 404.
2. For a single-pass effect, one `f32` in that shader's `Params` per control
   key. A control key with no matching member is a dead knob: the adapter falls
   back to the declared default and the slider does nothing.
3. `npm run check:registry` enforces all of the above.

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

- `.fallowrc.json` lists the vendored components under `entry`, not under
  ignores. That is deliberate. Ignoring a file drops it out of the module graph
  and takes its imports with it, which turned five real dependencies into
  phantom unused ones. Leave it as entry points.
- `@vgpu/wgsl-std` sits in `ignoreDependencies` because it is imported only from
  `.wgsl` files, which fallow does not parse.

## Vendored components

`command.tsx`, `input-otp.tsx`, `toast.tsx` and `resizable.tsx` were removed
along with `cmdk`, `input-otp`, `sonner` and `react-resizable-panels`. If a
`shadcn add` from the Afterglow registry reinstates any of those files, re-add
its dependency in the same change. `tsconfig` includes all of `src`, so the file
without its package breaks `typecheck`.

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
