// Line-based reader for the effect registry. `src/effects/index.ts` imports
// `.wgsl` files, so it only resolves under Vite and plain Node cannot import
// it. Parsing the text is the way in.
//
// The patterns below are anchored to the exact line shapes the registry uses
// today. That rigidity is deliberate: if the file is reformatted, the parser
// should fail loudly rather than quietly match less than it used to.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

export const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)))

const DEFAULT_SOURCE = path.join(root, "src/effects/index.ts")

const ID = /^ {4}id: "([a-z0-9-]+)",$/
const WGSL = /^ {4}wgsl: (\w+),$/
const CATEGORY = /^ {4}category: "(.+)",$/
const SOURCE = /^ {6}source: "(.+)",$/
const PUBLISHED = /^ {4}published: "(.*)",$/
const NAME = /^ {4}name: "(.+)",$/
const TAGLINE = /^ {4}tagline: "(.+)",$/
const RATIONALE = /^ {4}rationale: \{$/
const RATIONALE_KEY = /^ {6}(\w+):( "|$)/
const ACCENT = /^ {4}accent: "(.+)",$/
const CTL =
  /^ {6}ctl\("([^"]+)", "([^"]+)", (-?[\d.]+), (-?[\d.]+), ([\d.]+), (-?[\d.]+)\),$/
const IMPORT = /^import (\w+) from "@\/(.+\.wgsl)"$/

const lines = (sourcePath) =>
  readFileSync(sourcePath ?? DEFAULT_SOURCE, "utf8").split("\n")

/**
 * Map of `xWgsl` import identifier to its repo-relative shader path.
 * `@/` resolves to `src/`, matching the Vite alias.
 */
export function wgslImports(sourcePath) {
  const map = new Map()
  for (const line of lines(sourcePath)) {
    const m = IMPORT.exec(line)
    if (m) map.set(m[1], `src/${m[2]}`)
  }
  return map
}

/**
 * Every registry entry, in file order. An entry whose lines did not all match
 * still comes back, with the unmatched fields empty, so the caller can report
 * it as a problem instead of the parser dying on the first surprise.
 */
export function parseEffects(sourcePath) {
  const src = lines(sourcePath)
  const effects = []
  let current = null
  let inRationale = false

  const close = () => {
    if (current) effects.push(current)
    current = null
  }

  for (const [i, line] of src.entries()) {
    const id = ID.exec(line)
    if (id) {
      close()
      current = {
        id: id[1],
        line: i + 1,
        category: "",
        wgslIdent: null,
        source: "",
        published: null,
        rationale: null,
        name: "",
        tagline: "",
        accent: "",
        controls: [],
      }
      continue
    }
    if (!current) continue

    const wgsl = WGSL.exec(line)
    if (wgsl) {
      current.wgslIdent = wgsl[1]
      continue
    }
    const category = CATEGORY.exec(line)
    if (category) {
      current.category = category[1]
      continue
    }
    let text = false
    for (const [key, pattern] of [["name", NAME], ["tagline", TAGLINE], ["accent", ACCENT]]) {
      const m = pattern.exec(line)
      if (m) {
        current[key] = m[1]
        text = true
      }
    }
    if (text) continue
    if (RATIONALE.test(line)) {
      current.rationale = []
      inRationale = true
      continue
    }
    if (inRationale) {
      const key = RATIONALE_KEY.exec(line)
      if (key) {
        current.rationale.push(key[1])
        continue
      }
      if (/^ {8}/.test(line)) continue
      inRationale = false
    }
    const published = PUBLISHED.exec(line)
    if (published) {
      current.published = published[1]
      continue
    }
    const source = SOURCE.exec(line)
    if (source) {
      current.source = source[1]
      continue
    }
    const ctl = CTL.exec(line)
    if (ctl) {
      current.controls.push({
        key: ctl[1],
        label: ctl[2],
        min: Number(ctl[3]),
        max: Number(ctl[4]),
        step: Number(ctl[5]),
        value: Number(ctl[6]),
      })
    }
  }
  close()
  return effects
}

/** Members of a shader's `struct Params { ... }` block, as `name -> type`. */
export function paramsMembers(wgslText) {
  const block = /struct Params \{([^}]*)\}/.exec(wgslText)
  if (!block) return null
  const members = new Map()
  for (const raw of block[1].split(",")) {
    const m = /^\s*(\w+)\s*:\s*([\w<>]+)\s*$/.exec(raw)
    if (m) members.set(m[1], m[2])
  }
  return members
}
