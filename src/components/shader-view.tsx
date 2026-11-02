"use client"

import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import type { HeroEffect } from "@/effects/types"
import { mountStage, releaseCanvas, type StageHandle } from "@/lib/stage"

export interface ShaderViewProps extends React.ComponentProps<"div"> {
  effect: HeroEffect
  /** Internal render scale relative to the CSS box. */
  quality?: number
  maxDpr?: number
  /** Frame cap. 0 means uncapped. */
  fps?: number
  controls?: Readonly<Record<string, number>>
  /** Master switch from the page: paused, or not the effect on screen. */
  enabled?: boolean
  onFps?: (fps: number) => void
  /**
   * Render briefly on mount even while off screen, then stop. Compiles the
   * pipelines and leaves a real frame on the canvas, so a screen that is about
   * to scroll into view arrives with a picture instead of black.
   */
  prime?: boolean
  /** How far outside the viewport counts as visible. */
  rootMargin?: string
}

/** How long a primed view renders off screen. Long enough to compile and settle. */
const PRIME_MS = 700

/**
 * A canvas bound to one effect.
 *
 * Rendering is gated on intersection: a screen scrolled out of view stops
 * encoding entirely rather than drawing into a canvas nobody is looking at.
 */
export function ShaderView({
  effect,
  quality = 1,
  maxDpr = 2,
  fps = 0,
  controls,
  enabled = true,
  onFps,
  prime = false,
  rootMargin = "160px",
  className,
  ...props
}: ShaderViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const handleRef = useRef<StageHandle | null>(null)
  // `null` means "not yet observed". An observed `false` is a different value, so
  // the observer's first callback always changes state and the gate effect runs.
  const [visible, setVisible] = useState<boolean | null>(null)
  const [failed, setFailed] = useState(false)
  // True from mount until the primed frames have been drawn.
  const [priming, setPriming] = useState(prime)
  // The desired state, readable by the async mount once the device resolves.
  const latest = useRef({ effect, controls, active: false })

  // Mount once. Swapping effects later goes through setEffect so the surface,
  // and every pipeline the gpu has already compiled, survive the change.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let disposed = false
    mountStage(canvas, effect, { quality, maxDpr, fps, onFail: () => setFailed(true) })
      .then((handle) => {
        if (!handle) {
          // A null handle also means "this mount was superseded", which is the
          // normal StrictMode path. Only report a failure when nothing replaced us.
          if (!disposed) setFailed(true)
          return
        }
        if (disposed) {
          handle.dispose()
          return
        }
        handleRef.current = handle
        // Everything set while the device was still being acquired landed on a
        // null handle and was dropped. Replay the latest desired state now.
        handle.setEffect(latest.current.effect)
        if (latest.current.controls) handle.setControls(latest.current.controls)
        handle.setActive(latest.current.active)
        // The clock for priming starts once the device is ours, not at mount,
        // so a slow adapter cannot use the whole window up before a frame.
        window.setTimeout(() => {
          if (!disposed) setPriming(false)
        }, PRIME_MS)
      })
      .catch((err) => {
        console.error(`[shader-view:${effect.id}]`, err)
        setFailed(true)
      })
    return () => {
      disposed = true
      releaseCanvas(canvas)
      handleRef.current = null
    }
  }, [])

  useEffect(() => {
    latest.current.effect = effect
    handleRef.current?.setEffect(effect)
  }, [effect])

  useEffect(() => {
    latest.current.controls = controls
    if (controls) handleRef.current?.setControls(controls)
  }, [controls])

  useEffect(() => {
    latest.current.active = priming || ((visible ?? false) && enabled)
    handleRef.current?.setActive(latest.current.active)
  }, [visible, enabled, priming])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin,
    })
    io.observe(el)
    return () => io.disconnect()
  }, [rootMargin])

  useEffect(() => {
    if (!onFps) return
    const id = window.setInterval(() => {
      const handle = handleRef.current
      if (handle) onFps(handle.fps)
    }, 500)
    return () => window.clearInterval(id)
  }, [onFps])

  return (
    <div className={cn("relative isolate overflow-hidden bg-bg", className)} {...props}>
      <canvas
        aria-label={`${effect.name} shader`}
        className="block size-full"
        ref={canvasRef}
        role="img"
      />
      {failed ? (
        <div className="meta absolute inset-0 grid place-items-center bg-bg/90 p-4 text-center text-alert">
          WebGPU unavailable
        </div>
      ) : null}
    </div>
  )
}
