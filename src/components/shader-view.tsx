"use client"

import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import type { HeroEffect } from "@/effects/types"
import { mountStage, releaseCanvas, type StageHandle } from "@/lib/stage"

export interface ShaderViewProps extends React.ComponentProps<"div"> {
  effect: HeroEffect
  /** Internal render scale. Cards run below 1 so a gridful of them stays interactive. */
  quality?: number
  maxDpr?: number
  /** Frame cap. 0 means uncapped. */
  fps?: number
  controls?: Readonly<Record<string, number>>
  /** Master switch from the page (a paused hero, a card with previews off). */
  enabled?: boolean
  onFps?: (fps: number) => void
}

/**
 * A canvas bound to one effect.
 *
 * Rendering is gated on intersection: a card scrolled out of view stops
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
  className,
  ...props
}: ShaderViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const handleRef = useRef<StageHandle | null>(null)
  // `null` means "not yet observed". An observed `false` is a different value, so
  // the observer's first callback always changes state and the gate effect runs.
  const [visible, setVisible] = useState<boolean | null>(null)
  const [failed, setFailed] = useState(false)
  // The desired state, readable by the async mount once the device resolves.
  const latest = useRef({ effect, controls, active: false })

  // Mount once. Swapping effects later goes through setEffect so the surface,
  // and every pipeline the gpu has already compiled, survive the change.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let disposed = false
    mountStage(canvas, effect, { quality, maxDpr, fps })
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
    latest.current.active = (visible ?? false) && enabled
    handleRef.current?.setActive(latest.current.active)
  }, [visible, enabled])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: "160px",
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!onFps) return
    const id = window.setInterval(() => {
      const handle = handleRef.current
      if (handle) onFps(handle.fps)
    }, 500)
    return () => window.clearInterval(id)
  }, [onFps])

  return (
    <div className={cn("relative isolate overflow-hidden bg-void", className)} {...props}>
      <canvas
        aria-label={`${effect.name} shader`}
        className="block size-full"
        ref={canvasRef}
        role="img"
      />
      {failed ? (
        <div className="absolute inset-0 grid place-items-center bg-void/90 p-4 text-center font-mono text-[0.625rem] text-signal uppercase tracking-[0.14em]">
          WebGPU unavailable
        </div>
      ) : null}
    </div>
  )
}
