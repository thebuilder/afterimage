import { init, type Gpu } from "vgpu"

export type GpuStatus =
  | { readonly state: "idle" }
  | { readonly state: "ready"; readonly gpu: Gpu; readonly adapter: string }
  | { readonly state: "unsupported"; readonly reason: string }
  | { readonly state: "lost"; readonly reason: string }

let pending: Promise<GpuStatus> | null = null
let current: GpuStatus = { state: "idle" }

const lostListeners = new Set<(status: GpuStatus) => void>()

/**
 * Subscribe to the device going away.
 *
 * A driver reset or a laptop switching GPUs kills the device under every canvas
 * at once. Without this the page keeps its last frame on screen and keeps
 * claiming it is live, so the only honest thing left to do is say so.
 */
export function onGpuLost(cb: (status: GpuStatus) => void): () => void {
  lostListeners.add(cb)
  // A device that died before this listener existed still concerns it.
  if (current.state === "lost") cb(current)
  return () => {
    lostListeners.delete(cb)
  }
}

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

      // vgpu's error channel is otherwise unread: an uncaptured validation or
      // out-of-memory error would vanish instead of reaching the console.
      gpu.onError((err) => console.error("vgpu:", err))

      gpu.gpu.lost.then((lost) => {
        current = { state: "lost", reason: lost?.message || "GPU device lost" }
        // Drop the memoized promise so a later acquire is not handed a corpse.
        pending = null
        for (const cb of lostListeners) cb(current)
      })

      current = { state: "ready", gpu, adapter }
      return current
    } catch (err) {
      current = {
        state: "unsupported",
        reason: err instanceof Error ? err.message : String(err),
      }
      return current
    }
  })()
  return pending
}
