/**
 * Free per-instance GPU allocations.
 *
 * vgpu's public Target / StorageBuffer / PingPongTargets interfaces omit
 * destroy(), but the concrete objects behind them (OffscreenTarget,
 * RingStorageBuffer) implement it, and a runtime probe confirmed it. The
 * structural cast keeps that reality in one commented place instead of five.
 */
export function release(...resources: ReadonlyArray<unknown>) {
  for (const r of resources) {
    ;(r as { destroy?: () => void } | null | undefined)?.destroy?.()
  }
}
