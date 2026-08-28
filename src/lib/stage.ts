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
  frames: number
  fpsWindow: number
  fps: number
  detachPointer: () => void
}

const entries = new Set<Entry>()
let raf = 0
let last = 0

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
  const dtRaw = last === 0 ? 1 / 60 : (now - last) / 1000
  last = now
  // A backgrounded tab returns a delta of seconds. Clamping keeps a simulation
  // from integrating one enormous step and blowing up.
  const dt = Math.min(dtRaw, 1 / 20)

  for (const e of entries) {
    if (!e.active) continue
    const minStep = e.opts.fps > 0 ? 1 / e.opts.fps - 0.002 : 0
    if (now - e.lastDraw < minStep * 1000) continue
    e.lastDraw = now

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
    last = 0
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
    active: true,
    controls: Object.fromEntries(effect.controls.map((c) => [c.key, c.value])),
    time: Math.random() * 40, // stagger, so a grid of cards is not in lockstep
    pointer: 0,
    mouse: [0.5, 0.45],
    lastDraw: 0,
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

  surf.onResize(({ width, height }) => {
    entry.instance.resize?.(width, height)
  })

  entries.add(entry)
  ensureLoop()

  live = () => {
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
