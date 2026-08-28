import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { wgslVitePlugin } from "@vgpu/wgsl/loader-vite"

export default defineConfig({
  plugins: [wgslVitePlugin(), react(), tailwindcss()],
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
})
