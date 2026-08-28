import { init, type Gpu } from "vgpu"

export type GpuStatus =
  | { readonly state: "idle" }
  | { readonly state: "ready"; readonly gpu: Gpu; readonly adapter: string }
  | { readonly state: "unsupported"; readonly reason: string }

let pending: Promise<GpuStatus> | null = null

/**
 * One `Gpu` for the whole page. Every canvas gets its own `Surface` from it, so
 * pipelines, bind groups, samplers and shader modules are all shared. A whole
 * gallery of live previews costs one device.
 */
export function acquireGpu(): Promise<GpuStatus> {
  if (pending) return pending
  pending = (async (): Promise<GpuStatus> => {
    if (typeof navigator === "undefined" || !("gpu" in navigator)) {
      return {
        state: "unsupported",
        reason: "navigator.gpu is not available in this browser.",
      }
    }
    try {
      const gpu = await init()
      const info = await navigator.gpu.requestAdapter().then((a) => a?.info)
      const adapter = [info?.vendor, info?.architecture].filter(Boolean).join(" · ") || "webgpu adapter"
      return { state: "ready", gpu, adapter }
    } catch (err) {
      return {
        state: "unsupported",
        reason: err instanceof Error ? err.message : String(err),
      }
    }
  })()
  return pending
}
