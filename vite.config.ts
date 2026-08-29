import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { wgslVitePlugin } from "@vgpu/wgsl/loader-vite"

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

const siteUrlPlugin = {
  name: "afterimage:site-url",
  transformIndexHtml: (html: string) => html.replaceAll("__SITE_URL__", siteUrl()),
}

export default defineConfig({
  // Shader comments are ~17% of the shipped bundle, so minify the WGSL.
  plugins: [siteUrlPlugin, wgslVitePlugin({ minify: true }), react(), tailwindcss()],
  // One port everywhere: launch.json, shots.sh and the README all assume it.
  server: { port: 5177, strictPort: true },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
})
