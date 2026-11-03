import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { wgslVitePlugin } from "@vgpu/wgsl/loader-vite"
import { parseEffects } from "./scripts/lib/registry.mjs"

/**
 * Absolute origin for the Open Graph tags.
 *
 * Crawlers resolve a relative og:image inconsistently, so the tags carry a
 * placeholder that is filled in here. Vercel exposes the production domain at
 * build time; set SITE_URL to override it anywhere else. With neither, the
 * placeholder collapses to nothing and the tags stay relative, which is right
 * for a local build that no crawler will see.
 *
 * The value lands inside HTML attributes, so it is parsed and reduced to
 * `url.origin`: that normalizes trailing slashes and paths away, and a valid
 * origin cannot contain a quote or an angle bracket, so a malformed or hostile
 * SITE_URL falls back to relative tags instead of emitting broken markup.
 */
function siteUrl(): string {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  const candidate = process.env.SITE_URL || (vercel ? `https://${vercel}` : "")
  if (!candidate) return ""
  try {
    const url = new URL(candidate)
    if (url.protocol !== "http:" && url.protocol !== "https:") return ""
    return url.origin
  } catch {
    return ""
  }
}

/**
 * Social tags, one set per URL.
 *
 * The site is a single page app, but crawlers do not run it, so every effect
 * gets its own HTML file with its own title, description, canonical URL and
 * card: `/<id>` is `<id>.html` and `/<id>/how-it-works` is
 * `<id>/how-it-works.html`, which Vercel serves extensionless (`cleanUrls`).
 * `/` and `/how-it-works` describe the site and carry the newest card. Cards
 * live at `public/og/<id>.jpg` (`npm run og`), and their URL carries a content
 * hash so a re-rendered card is a new URL that link previews fetch afresh.
 */
const escapeAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const SITE_TITLE = "Afterimage | One live experiment at a time"
const SITE_DESCRIPTION =
  "Interactive visual experiments rendered live in your browser, one at a time, with a new one most days. Shape it with the controls, or hide the interface and let it fill the screen."

interface PageMeta {
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  path: string
  image: string
  imageAlt: string
}

function cardUrl(id: string): string {
  const file = new URL(`./public/og/${id}.jpg`, import.meta.url)
  const hash = existsSync(file)
    ? createHash("sha1").update(readFileSync(file)).digest("hex").slice(0, 10)
    : "missing"
  return `/og/${id}.jpg?v=${hash}`
}

function pages(): { file: string; meta: PageMeta }[] {
  const effects = parseEffects()
  const out: { file: string; meta: PageMeta }[] = []
  effects.forEach((e, i) => {
    const number = String(i + 1).padStart(2, "0")
    const title = `${e.name} | Afterimage`
    const description = `No. ${number}. ${e.tagline}`
    const meta = {
      title,
      description,
      ogTitle: title,
      ogDescription: description,
      path: `/${e.id}`,
      image: cardUrl(e.id),
      imageAlt: `${e.name}, a live experiment on Afterimage.`,
    }
    out.push({ file: `${e.id}.html`, meta })
    out.push({
      file: `${e.id}/how-it-works.html`,
      meta: { ...meta, title: `How ${e.name} works | Afterimage` },
    })
  })
  const newest = effects.at(-1)
  if (newest) {
    const card = out.find((p) => p.file === `${newest.id}.html`)!.meta
    const home = { ...card, title: SITE_TITLE, description: SITE_DESCRIPTION, path: "/" }
    out.push({ file: "index.html", meta: home })
    out.push({ file: "how-it-works.html", meta: home })
  }
  return out
}

function fill(html: string, m: PageMeta): string {
  const url = `${siteUrl()}${m.path}`
  return html
    .replaceAll("__TITLE__", escapeAttr(m.title))
    .replaceAll("__DESCRIPTION__", escapeAttr(m.description))
    .replaceAll("__OG_TITLE__", escapeAttr(m.ogTitle))
    .replaceAll("__OG_DESCRIPTION__", escapeAttr(m.ogDescription))
    .replaceAll("__OG_ALT__", escapeAttr(m.imageAlt))
    .replaceAll("__PAGE_URL__", escapeAttr(url))
    .replaceAll("__OG_IMAGE__", escapeAttr(`${siteUrl()}${m.image}`))
}

const ogPlugin: Plugin = {
  name: "afterimage:og",
  enforce: "post",
  // In dev every URL gets the home page's tags; nothing crawls a dev server.
  transformIndexHtml: {
    order: "post",
    handler(html, ctx) {
      if (ctx.bundle) return html
      const home = pages().find((p) => p.file === "index.html")
      return home ? fill(html, home.meta) : html
    },
  },
  generateBundle(_, bundle) {
    const index = bundle["index.html"]
    if (!index || index.type !== "asset") return
    const template = String(index.source)
    for (const { file, meta } of pages()) {
      if (file === "index.html") index.source = fill(template, meta)
      else this.emitFile({ type: "asset", fileName: file, source: fill(template, meta) })
    }
  },
}

export default defineConfig({
  // Shader comments are ~17% of the shipped bundle, so minify the WGSL.
  plugins: [ogPlugin, wgslVitePlugin({ minify: true }), react(), tailwindcss()],
  // One port everywhere: launch.json, shots.sh and the README all assume it.
  server: { port: 5177, strictPort: true },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
})
