import { frame, surface, type Gpu, type Surface } from "vgpu"
import type { EffectInstance, FrameInputs, HeroEffect } from "@/effects/types"
import { acquireGpu } from "./gpu"

export interface StageOptions {
  /** Internal render scale relative to the CSS box. 1 = native, 0.6 = cheaper. */
  readonly quality?: number
  /** Device pixel ratio ceiling. */
  readonly maxDpr?: number
  /** Frames per second cap. Omit for uncapped. */
  readonly fps?: number
}

export interface StageHandle {
  setEffect(effect: HeroEffect): void
  setControls(values: Readonly<Record<string, number>>): void
  setActive(active: boolean): void
  /** Frames per second, averaged over the last second. */
  readonly fps: number
  dispose(): void
}

interface Entry {
  gpu: Gpu
  canvas: HTMLCanvasElement
  surface: Surface
  effect: HeroEffect
  instance: EffectInstance
  opts: Required<StageOptions>
  active: boolean
  controls: Record<string, number>
  time: number
  pointer: number
  mouse: [number, number]
  lastDraw: number
  hasDrawn: boolean
  frames: number
  fpsWindow: number
  fps: number
  detachPointer: () => void
}

const entries = new Set<Entry>()
let raf = 0

/**
 * One requestAnimationFrame for the whole page.
 *
 * Every canvas could own a `frameLoop`, but then every preview adds another rAF
 * callback fighting over the same device, and each one advances vgpu's frame
 * clock, so time runs as many times too fast as there are canvases. Driving them
 * from here with an explicit `time` per entry keeps each effect on its own clock.
 */
function tick(now: number) {
  raf = requestAnimationFrame(tick)

  for (const e of entries) {
    if (!e.active) continue
    const minStepMs = e.opts.fps > 0 ? 1000 / e.opts.fps : 0
    if (now - e.lastDraw < minStepMs) continue

    // Each entry advances by its own elapsed time, so a capped tile plays at
    // the same speed as the hero instead of at cap/refresh speed. The clamp
    // keeps a backgrounded tab from integrating one enormous step.
    const dt = e.hasDrawn ? Math.min((now - e.lastDraw) / 1000, 1 / 20) : 1 / 60
    e.hasDrawn = true
    // Advance by the step, not to `now`: snapping to `now` quantizes a 24fps
    // cap up to whole rAF ticks (~20fps). If we fell behind more than one
    // step, drop the backlog rather than spiraling to catch up.
    e.lastDraw = minStepMs > 0 ? e.lastDraw + minStepMs : now
    if (now - e.lastDraw > minStepMs) e.lastDraw = now

    e.time += dt
    e.pointer = Math.max(0, e.pointer - dt * 1.6)

    const inputs: FrameInputs = {
      time: e.time,
      dt,
      mouse: e.mouse,
      pointer: e.pointer,
      controls: e.controls,
    }
    try {
      frame(e.gpu, (f) => e.instance.render(f, e.surface, inputs))
    } catch (err) {
      const v = err as { code?: string; message?: string; where?: string }
      console.error(`vgpu-fail ${e.effect.id} code=${v?.code} where=${v?.where} msg=${v?.message}`)
      e.active = false
      continue
    }

    e.frames++
    e.fpsWindow += dt
    if (e.fpsWindow >= 0.5) {
      e.fps = e.frames / e.fpsWindow
      e.frames = 0
      e.fpsWindow = 0
    }
  }
}

function ensureLoop() {
  if (!raf) {
    raf = requestAnimationFrame(tick)
  }
}

function maybeStopLoop() {
  if (entries.size === 0 && raf) {
    cancelAnimationFrame(raf)
    raf = 0
  }
}

/**
 * One teardown per canvas, registered synchronously.
 *
 * A canvas can hold exactly one live `Surface`. A second `surface(gpu, canvas)`
 * throws, because reconfiguring the context out from under the first one
 * silently invalidates its textures. React StrictMode mounts every effect twice,
 * so the second mount has to cancel the first one *while it is still awaiting
 * the device*, which a returned handle cannot do.
 */
const teardowns = new Map<HTMLCanvasElement, () => void>()

/** Tears down whatever is attached to this canvas, mounted or still mounting. */
export function releaseCanvas(canvas: HTMLCanvasElement) {
  teardowns.get(canvas)?.()
}

export async function mountStage(
  canvas: HTMLCanvasElement,
  effect: HeroEffect,
  options: StageOptions = {}
): Promise<StageHandle | null> {
  releaseCanvas(canvas)

  let cancelled = false
  let live: (() => void) | null = null
  const teardown = () => {
    cancelled = true
    live?.()
    live = null
    if (teardowns.get(canvas) === teardown) teardowns.delete(canvas)
  }
  teardowns.set(canvas, teardown)

  const status = await acquireGpu()
  if (cancelled || status.state !== "ready") return null
  const gpu = status.gpu

  const opts: Required<StageOptions> = {
    quality: options.quality ?? 1,
    maxDpr: options.maxDpr ?? 2,
    fps: options.fps ?? 0,
  }

  // `dpr: [1, max]` lets the surface track the device pixel ratio but stops it
  // from allocating a 3x buffer on a phone.
  const surf = surface(gpu, canvas, { dpr: [1, opts.maxDpr] })

  const entry: Entry = {
    gpu,
    canvas,
    surface: surf,
    effect,
    instance: effect.create({ gpu, target: surf, quality: opts.quality }),
    opts,
    active: false,
    controls: Object.fromEntries(effect.controls.map((c) => [c.key, c.value])),
    time: Math.random() * 40, // stagger, so a grid of cards is not in lockstep
    pointer: 0,
    mouse: [0.5, 0.45],
    // Stagger the first draw across the cap window so 20 tiles capped at the
    // same fps do not all land on the same rAF tick and arrive as a burst.
    lastDraw: performance.now() - Math.random() * (opts.fps > 0 ? 1000 / opts.fps : 0),
    hasDrawn: false,
    frames: 0,
    fpsWindow: 0,
    fps: 0,
    detachPointer: () => {},
  }

  const onPointer = (ev: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return
    entry.mouse = [(ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height]
    entry.pointer = 1
  }
  canvas.addEventListener("pointermove", onPointer, { passive: true })
  entry.detachPointer = () => canvas.removeEventListener("pointermove", onPointer)

  // Coalesce the resize storm a window drag produces: a simulation treats a
  // resize as "start over", so forwarding every event reseeds the sim once per
  // frame for the whole drag. The canvas shows a stretched frame for 150ms,
  // which is the standard tradeoff.
  let resizeTimer = 0
  surf.onResize(({ width, height }) => {
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => entry.instance.resize?.(width, height), 150)
  })

  entries.add(entry)
  ensureLoop()

  live = () => {
    window.clearTimeout(resizeTimer)
    entry.detachPointer()
    entry.instance.dispose?.()
    entries.delete(entry)
    surf.dispose()
    maybeStopLoop()
  }

  return {
    setEffect(next) {
      if (next.id === entry.effect.id) return
      entry.instance.dispose?.()
      entry.effect = next
      entry.instance = next.create({ gpu, target: surf, quality: opts.quality })
      entry.instance.resize?.(surf.size[0], surf.size[1])
      entry.controls = Object.fromEntries(next.controls.map((c) => [c.key, c.value]))
      entry.time = 0
      entry.active = true
    },
    setControls(values) {
      entry.controls = { ...entry.controls, ...values }
    },
    setActive(active) {
      entry.active = active
    },
    get fps() {
      return entry.fps
    },
    dispose() {
      teardown()
    },
  }
}
