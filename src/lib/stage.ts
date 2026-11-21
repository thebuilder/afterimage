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
  /**
   * Called once when this entry's render throws and the loop drops it. The
   * canvas is dead from here on, so the owner can say so instead of leaving a
   * frozen frame that still looks live.
   */
  readonly onFail?: () => void
}

/** Options with the numeric defaults filled in; `onFail` stays as given. */
type ResolvedOptions = Required<Omit<StageOptions, "onFail">> & Pick<StageOptions, "onFail">

export interface StageHandle {
  setEffect(effect: HeroEffect): void
  setControls(values: Readonly<Record<string, number>>): void
  setActive(active: boolean): void
  /** Frames per second, averaged over the last second. */
  readonly fps: number
  /** True once the effect has drawn a frame to its canvas. */
  readonly drawn: boolean
  dispose(): void
}

interface Entry {
  gpu: Gpu
  canvas: HTMLCanvasElement
  surface: Surface
  effect: HeroEffect
  instance: EffectInstance
  opts: ResolvedOptions
  active: boolean
  controls: Record<string, number>
  time: number
  pointer: number
  gesture: number
  pressed: boolean
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
    // A little slack, so a 60fps cap on a 60Hz display does not drop the
    // frames whose rAF lands a fraction of a millisecond early.
    if (minStepMs > 0 && now - e.lastDraw < minStepMs - 2) continue

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
      gesture: e.gesture,
      pressed: e.pressed,
      controls: e.controls,
    }
    try {
      frame(e.gpu, (f) => e.instance.render(f, e.surface, inputs))
    } catch (err) {
      const v = err as { code?: string; message?: string; where?: string }
      console.error(`vgpu-fail ${e.effect.id} code=${v?.code} where=${v?.where} msg=${v?.message}`)
      e.active = false
      e.opts.onFail?.()
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

  const opts: ResolvedOptions = {
    quality: options.quality ?? 1,
    maxDpr: options.maxDpr ?? 2,
    fps: options.fps ?? 0,
    onFail: options.onFail,
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
    gesture: 0,
    pressed: false,
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

  // Touch. For most effects vertical swipes stay the browser's, so the feed
  // scrolls, and horizontal or diagonal drags drive the effect. An effect that
  // is painted or grabbed (`touch: "drag"`) needs drags in every direction, so
  // its canvas keeps them all, and the first moments of a touch decide what it
  // was: a quick vertical flick moves the feed a screen, anything else presses.
  const applyTouchAction = () => {
    canvas.style.touchAction = entry.effect.touch === "drag" ? "none" : "pan-y"
  }
  applyTouchAction()

  /** A flick has to cover this many CSS pixels, mostly vertically... */
  const FLICK_PX = 28
  /** ...within this long. Later than that, or sideways, the touch presses. */
  const DECIDE_MS = 100
  let tapping = false
  let touch: { id: number; x0: number; y0: number; t0: number; mode: "pending" | "press" | "swipe"; timer: number } | null = null

  const updateFromEvent = (ev: PointerEvent) => {
    // A second finger on a drag effect would teleport the brush.
    if (touch && ev.pointerType === "touch" && ev.pointerId !== touch.id) return
    if (touch?.mode === "swipe") return
    const r = canvas.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return
    entry.mouse = [(ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height]
    entry.pointer = 1
  }
  const beginPress = () => {
    if (!touch || touch.mode !== "pending") return
    window.clearTimeout(touch.timer)
    touch.mode = "press"
    entry.pressed = true
  }
  const scroller = (): HTMLElement | null => {
    for (let p = canvas.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY
      if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p
    }
    return null
  }
  const swipe = (dy: number) => {
    if (!touch) return
    window.clearTimeout(touch.timer)
    touch.mode = "swipe"
    entry.gesture++
    const s = scroller()
    // Snap points do the rest: one screen up or down, the way a swipe would.
    s?.scrollBy({ top: (dy < 0 ? 1 : -1) * s.clientHeight, behavior: "smooth" })
  }
  const endTouch = (tap: boolean) => {
    if (!touch) return
    window.clearTimeout(touch.timer)
    const wasPending = touch.mode === "pending"
    touch = null
    if (tap && wasPending) {
      // A tap shorter than the decision window still touches the paper once.
      entry.pressed = true
      tapping = true
      window.setTimeout(() => {
        tapping = false
        if (!touch) entry.pressed = false
      }, 50)
    } else {
      entry.pressed = false
    }
  }

  const onPointerDown = (ev: PointerEvent) => {
    if (ev.pointerType === "touch" && entry.effect.touch === "drag") {
      if (touch) return
      canvas.setPointerCapture(ev.pointerId)
      entry.gesture++
      touch = { id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, t0: performance.now(), mode: "pending", timer: 0 }
      touch.timer = window.setTimeout(beginPress, DECIDE_MS)
      updateFromEvent(ev)
      return
    }
    // Capture keeps the stream when a drag leaves the canvas, and makes a bare
    // tap a poke instead of a no-op.
    canvas.setPointerCapture(ev.pointerId)
    entry.gesture++
    entry.pressed = true
    updateFromEvent(ev)
  }
  const onPointerMove = (ev: PointerEvent) => {
    if (touch && ev.pointerId === touch.id && touch.mode === "pending") {
      const dx = ev.clientX - touch.x0
      const dy = ev.clientY - touch.y0
      const vertical = Math.abs(dy) > 1.5 * Math.abs(dx)
      if (vertical && Math.abs(dy) > FLICK_PX) {
        if (performance.now() - touch.t0 < DECIDE_MS) swipe(dy)
        else beginPress()
      } else if (!vertical && Math.hypot(dx, dy) > 10) {
        beginPress()
      }
    }
    updateFromEvent(ev)
  }
  const onPointerUp = (ev: PointerEvent) => {
    if (touch && ev.pointerId === touch.id) endTouch(ev.type === "pointerup")
    else if (!touch) entry.pressed = false
    if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId)
  }
  canvas.addEventListener("pointerdown", onPointerDown, { passive: true })
  canvas.addEventListener("pointermove", onPointerMove, { passive: true })
  canvas.addEventListener("pointerup", onPointerUp, { passive: true })
  canvas.addEventListener("pointercancel", onPointerUp, { passive: true })
  // A capture lost any other way (the window losing focus mid-drag) is a release too.
  const onLostCapture = (ev: PointerEvent) => {
    if (touch) {
      if (ev.pointerId === touch.id) endTouch(false)
      return
    }
    if (!tapping) entry.pressed = false
  }
  canvas.addEventListener("lostpointercapture", onLostCapture, { passive: true })
  // Leaving ends the gesture, so coming back somewhere else starts a new one.
  const onPointerLeave = () => {
    entry.gesture++
  }
  canvas.addEventListener("pointerleave", onPointerLeave, { passive: true })
  entry.detachPointer = () => {
    if (touch) window.clearTimeout(touch.timer)
    canvas.removeEventListener("pointerleave", onPointerLeave)
    canvas.removeEventListener("pointerdown", onPointerDown)
    canvas.removeEventListener("pointermove", onPointerMove)
    canvas.removeEventListener("pointerup", onPointerUp)
    canvas.removeEventListener("pointercancel", onPointerUp)
    canvas.removeEventListener("lostpointercapture", onLostCapture)
  }

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
      applyTouchAction()
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
    get drawn() {
      return entry.hasDrawn
    },
    dispose() {
      teardown()
    },
  }
}
