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
 */
function siteUrl(): string {
  const explicit = process.env.SITE_URL
  if (explicit) return explicit.replace(/\/+$/, "")
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  return vercel ? `https://${vercel}` : ""
}

const siteUrlPlugin = {
  name: "afterimage:site-url",
  transformIndexHtml: (html: string) => html.replaceAll("__SITE_URL__", siteUrl()),
}

export default defineConfig({
  plugins: [siteUrlPlugin, wgslVitePlugin(), react(), tailwindcss()],
  // One port everywhere: launch.json, shots.sh and the README all assume it.
  server: { port: 5177, strictPort: true },
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
})
