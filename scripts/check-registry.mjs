#!/usr/bin/env node
// Checks the invariants `src/effects/index.ts` holds by convention and nothing
// enforced. Each one has teeth: a bad `source` ships a public 404 on the site,
// and a control key that no `Params` member matches becomes a knob that
// silently does nothing, because the fullscreen adapter falls back to the
// declared default.
//
// Usage: node scripts/check-registry.mjs [path/to/index.ts]
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { parseEffects, paramsMembers, root, wgslImports } from "./lib/registry.mjs"

const MIN_ENTRIES = 15
const REQUIRED_PARAMS = ["res", "mouse", "time"]

const arg = process.argv[2]
const sourcePath = arg ? path.resolve(arg) : undefined
const label = arg ?? "src/effects/index.ts"

const effects = parseEffects(sourcePath)
const imports = wgslImports(sourcePath)
const problems = []

// 1. A parser that quietly stops matching would otherwise report a clean run.
if (effects.length < MIN_ENTRIES) {
  problems.push(
    `${label}: only ${effects.length} entries parsed, expected at least ${MIN_ENTRIES} — the registry shape probably drifted from the parser`
  )
}

// 2. Ids are the URL scheme and the keyboard shortcuts, so they must be unique.
const seen = new Set()
for (const e of effects) {
  if (seen.has(e.id)) problems.push(`${e.id} (line ${e.line}): duplicate id`)
  seen.add(e.id)
  if (!/^[a-z0-9-]+$/.test(e.id)) problems.push(`${e.id} (line ${e.line}): id is not kebab-case`)
}

for (const e of effects) {
  const at = `${e.id} (line ${e.line})`

  // 3. Shape of the entry and of every control.
  if (!e.category) problems.push(`${at}: empty or missing category`)
  if (e.controls.length < 1 || e.controls.length > 3) {
    problems.push(`${at}: ${e.controls.length} controls, expected 1-3`)
  }
  for (const c of e.controls) {
    if (!(c.min < c.max)) problems.push(`${at}: control "${c.key}" has min ${c.min} >= max ${c.max}`)
    if (!(c.step > 0)) problems.push(`${at}: control "${c.key}" has step ${c.step}, expected > 0`)
    if (c.value < c.min || c.value > c.max) {
      problems.push(`${at}: control "${c.key}" default ${c.value} outside [${c.min}, ${c.max}]`)
    }
  }

  // 4. `technical.source` is published as a live GitHub link.
  if (!e.source) {
    problems.push(`${at}: missing technical.source`)
  } else if (!existsSync(path.join(root, e.source))) {
    problems.push(`${at}: technical.source "${e.source}" does not exist on disk`)
  }

  // 5. Single-pass control keys have to name a Params member, or the knob is dead.
  if (!e.wgslIdent) continue
  const shader = imports.get(e.wgslIdent)
  if (!shader) {
    problems.push(`${at}: wgsl ident "${e.wgslIdent}" has no matching import`)
    continue
  }
  const shaderPath = path.join(root, shader)
  if (!existsSync(shaderPath)) {
    problems.push(`${at}: shader "${shader}" does not exist on disk`)
    continue
  }
  const members = paramsMembers(readFileSync(shaderPath, "utf8"))
  if (!members) {
    problems.push(`${at}: ${shader} declares no "struct Params" block`)
    continue
  }
  for (const name of REQUIRED_PARAMS) {
    if (!members.has(name)) problems.push(`${at}: ${shader} Params is missing "${name}"`)
  }
  for (const c of e.controls) {
    const type = members.get(c.key)
    if (!type) {
      problems.push(`${at}: control "${c.key}" has no matching member in ${shader} Params`)
    } else if (type !== "f32") {
      problems.push(`${at}: control "${c.key}" is ${type} in ${shader} Params, expected f32`)
    }
  }
}

if (problems.length > 0) {
  for (const p of problems) console.error(p)
  console.error(`${effects.length} effects checked, ${problems.length} problems`)
  process.exit(1)
}
console.log(`${effects.length} effects checked, 0 problems`)
