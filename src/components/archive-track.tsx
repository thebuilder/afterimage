import type * as React from "react"
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react"

import type { HeroEffect } from "@/effects/types"
import { cn } from "@/lib/utils"

/**
 * The Archive as a ride: every effect is a card on one winding, climbing,
 * banking track, and scrolling carries you along it. The card at the front is
 * the one in focus; the next ones wait further down the line, and the ones you
 * passed fly by the camera and fade.
 *
 * It is all CSS 3D: plain elements with `translate3d` and rotations, which the
 * compositor moves without repainting. No canvas and no WebGL, so the Archive
 * never adds GPU load to the effect it was opened over. Frames are only drawn
 * while the ride is moving; when it settles, the loop stops.
 *
 * The scroll is real: a tall scroll container, so wheel, trackpad, touch, the
 * keyboard and the scrollbar all work as they do on any page, and the track
 * just reads `scrollTop`. When a scroll ends between two cards it settles on
 * one, leaning the way it was going: CSS mandatory snapping would pull a
 * single wheel notch straight back to the card it started from.
 */

export interface TrackItem {
  readonly effect: HeroEffect
  /** Position in the feed, which is what opening it navigates to. */
  readonly index: number
  readonly href: string
}

export interface TrackHandle {
  /** Glide to the card at this position in `items`. */
  go: (position: number) => void
  /** The card at the front right now. */
  focused: () => number
}

/** Card art is 1200x630, the share card's frame. */
const ASPECT = 630 / 1200
/** How far ahead the track is drawn, in cards. Further than this is fog. */
const AHEAD = 9
/** Passed cards fade out over this much of a step as they fly by. */
const BEHIND = 0.85
/** Ties under the track, per card. */
const TIES = 4

interface Geometry {
  /** Scroll distance per card. */
  scroll: number
  /** The stage, which is the scroller's visible box. */
  height: number
  card: number
  step: number
  ax: number
  ay: number
}

function geometryFor(width: number, height: number): Geometry {
  const narrow = width < 640
  const card = Math.min(width * (narrow ? 0.72 : 0.36), height * 0.6, 600)
  return {
    scroll: Math.max(140, Math.round(height * 0.3)),
    height,
    card,
    // The distance between cards along the track.
    step: card * 1.6,
    // How far the track swings sideways and climbs.
    ax: card * (narrow ? 0.75 : 1.25),
    ay: card * ASPECT * 1.1,
  }
}

/**
 * The track's centreline at `t` (in cards), its slope, and its sideways
 * curvature. Two incommensurate sines, so it never visibly repeats.
 */
function trackAt(t: number, g: Geometry) {
  const x = g.ax * (Math.sin(0.52 * t) + 0.32 * Math.sin(1.27 * t + 0.8))
  const dx = g.ax * (0.52 * Math.cos(0.52 * t) + 0.32 * 1.27 * Math.cos(1.27 * t + 0.8))
  const ddx = -g.ax * (0.52 * 0.52 * Math.sin(0.52 * t) + 0.32 * 1.27 * 1.27 * Math.sin(1.27 * t + 0.8))
  // Screen y points down, so a hill is negative.
  const y = -g.ay * Math.sin(0.41 * t + 1.1)
  const dy = -g.ay * 0.41 * Math.cos(0.41 * t + 1.1)
  const z = -t * g.step
  const yaw = Math.atan2(-dx, g.step)
  const pitch = Math.atan2(dy, Math.hypot(dx, g.step))
  // Lean into the turn, the way a coaster banks.
  const bank = Math.max(-0.5, Math.min(0.5, (ddx / g.ax) * 0.55))
  return { x, y, z, yaw, pitch, bank }
}

type Frame = ReturnType<typeof trackAt>

const place = (f: Frame) =>
  `translate3d(${f.x.toFixed(1)}px,${f.y.toFixed(1)}px,${f.z.toFixed(1)}px) rotateY(${f.yaw.toFixed(4)}rad) rotateX(${f.pitch.toFixed(4)}rad) rotateZ(${f.bank.toFixed(4)}rad)`

/** The inverse of `place`: the world as seen from a rider at `f`. */
const ride = (f: Frame) =>
  `rotateZ(${(-f.bank).toFixed(4)}rad) rotateX(${(-f.pitch).toFixed(4)}rad) rotateY(${(-f.yaw).toFixed(4)}rad) translate3d(${(-f.x).toFixed(1)}px,${(-f.y).toFixed(1)}px,${(-f.z).toFixed(1)}px)`

/** Opacity by distance from the front: fade in from the fog, fade out flying past. */
function fade(s: number) {
  if (s < -BEHIND || s > AHEAD) return 0
  if (s < 0) return 1 + s / BEHIND
  if (s > AHEAD - 3) return (AHEAD - s) / 3
  return 1
}

/** Where scrollend is missing, a short pause in scroll events stands in for it. */
const HAS_SCROLLEND = "onscrollend" in window

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

export function ArchiveTrack({
  items,
  initial = 0,
  onOpen,
  onFocusChange,
  ref,
}: {
  items: readonly TrackItem[]
  /** The card to start at, the first time the ride is laid out. */
  initial?: number
  onOpen: (index: number) => void
  onFocusChange: (position: number) => void
  ref: React.Ref<TrackHandle>
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const world = useRef<HTMLDivElement>(null)
  const cards = useRef<Array<HTMLLIElement | null>>([])
  const ties = useRef<Array<HTMLDivElement | null>>([])
  const [geo, setGeo] = useState<Geometry | null>(null)
  const [focus, setFocus] = useState(0)

  // Where the ride is (in cards), where the scroll says it should be, and the loop.
  const pos = useRef(0)
  const target = useRef(0)
  const raf = useRef(0)
  const focusRef = useRef(0)

  const count = items.length
  const tieCount = Math.max(0, (count - 1) * TIES + TIES * 2)

  useImperativeHandle(
    ref,
    () => ({
      go: (p: number) => {
        const el = scroller.current
        if (!el || !geo) return
        const clamped = Math.max(0, Math.min(count - 1, p))
        el.scrollTo({ top: clamped * geo.scroll, behavior: reducedMotion() ? "instant" : "smooth" })
      },
      focused: () => focusRef.current,
    }),
    [count, geo]
  )

  // Size the ride to the stage.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = () => setGeo(geometryFor(el.clientWidth, el.clientHeight))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // A new search starts the ride over at the front.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = 0
    pos.current = 0
    target.current = 0
  }, [items])

  // Draw one frame of the ride at `pos`.
  const draw = useRef<() => void>(() => {})
  const drawFrame = () => {
    if (!geo) return
    const p = pos.current
    const rider = trackAt(p, geo)
    if (world.current) world.current.style.transform = ride(rider)
    for (let i = 0; i < count; i++) {
      const el = cards.current[i]
      if (!el) continue
      const s = i - p
      const o = fade(s)
      if (o <= 0) {
        el.style.visibility = "hidden"
        continue
      }
      el.style.visibility = "visible"
      el.style.opacity = o.toFixed(3)
      el.style.transform = `${place(trackAt(i, geo))} translate(-50%, -50%)`
    }
    const tieY = (geo.card * ASPECT) / 2 + geo.card * 0.09
    for (let k = 0; k < tieCount; k++) {
      const el = ties.current[k]
      if (!el) continue
      const t = k / TIES - 1
      const s = t - p
      // Ties pass under the camera, so they go sooner than the cards do.
      const o = s < 0.35 ? 0 : fade(s) * 0.7
      if (o <= 0) {
        el.style.visibility = "hidden"
        continue
      }
      el.style.visibility = "visible"
      el.style.opacity = o.toFixed(3)
      el.style.transform = `${place(trackAt(t, geo))} translate3d(-50%, ${tieY.toFixed(1)}px, 0) rotateX(90deg)`
    }
    const f = Math.max(0, Math.min(count - 1, Math.round(p)))
    if (f !== focusRef.current) {
      focusRef.current = f
      setFocus(f)
      onFocusChange(f)
    }
  }

  // Ease toward the scroll position, then stop drawing until it moves again.
  const tick = useRef<() => void>(() => {})
  const tickFrame = () => {
    const d = target.current - pos.current
    if (Math.abs(d) < 0.0005 || reducedMotion()) {
      pos.current = target.current
      raf.current = 0
    } else {
      pos.current += d * 0.16
      raf.current = requestAnimationFrame(() => tick.current())
    }
    draw.current()
  }

  // The loop calls through refs, so it always runs the latest render's closures.
  useLayoutEffect(() => {
    draw.current = drawFrame
    tick.current = tickFrame
  })

  const kick = () => {
    if (!raf.current) raf.current = requestAnimationFrame(() => tick.current())
  }

  // The first layout starts the ride at `initial`, without riding there.
  const started = useRef(false)
  useLayoutEffect(() => {
    if (geo && !started.current) {
      started.current = true
      const p = Math.max(0, Math.min(count - 1, initial))
      if (scroller.current) scroller.current.scrollTop = p * geo.scroll
      pos.current = p
      target.current = p
    }
    draw.current()
  }, [geo, items, count, initial])

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const lastTop = useRef(0)
  const heading = useRef(0)
  const settleTimer = useRef(0)

  // Come to rest on a card: past an eighth of the way to the next one, go on.
  const settle = () => {
    const el = scroller.current
    if (!el || !geo) return
    const p = el.scrollTop / geo.scroll
    const base = Math.floor(p)
    const frac = p - base
    if (frac < 0.001 || frac > 0.999) return
    const next = heading.current >= 0 ? (frac > 0.12 ? base + 1 : base) : frac < 0.88 ? base : base + 1
    el.scrollTo({ top: Math.min(count - 1, next) * geo.scroll, behavior: reducedMotion() ? "instant" : "smooth" })
  }

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    // scrollend is the honest signal; the timer covers browsers without it.
    const onEnd = () => {
      window.clearTimeout(settleTimer.current)
      settle()
    }
    el.addEventListener("scrollend", onEnd)
    return () => {
      el.removeEventListener("scrollend", onEnd)
      window.clearTimeout(settleTimer.current)
    }
  })

  const onScroll = () => {
    const el = scroller.current
    if (!el || !geo) return
    const top = el.scrollTop
    if (top !== lastTop.current) heading.current = Math.sign(top - lastTop.current)
    lastTop.current = top
    target.current = top / geo.scroll
    kick()
    window.clearTimeout(settleTimer.current)
    if (!HAS_SCROLLEND) settleTimer.current = window.setTimeout(settle, 160)
  }

  if (count === 0) return null

  const cardW = geo?.card ?? 0

  return (
    <div
      className="absolute inset-0 overflow-y-auto overscroll-contain [scrollbar-width:none]"
      onScroll={onScroll}
      ref={scroller}
    >
      <div
        className="relative"
        style={{ height: `calc(100% + ${(count - 1) * (geo?.scroll ?? 0)}px)` }}
      >
        {/* The stage stays put while the scroll runs past it. */}
        <div
          className="sticky top-0 w-full overflow-hidden [perspective-origin:50%_8%] [perspective:1000px] sm:[perspective:1200px]"
          style={geo ? { height: geo.height } : { visibility: "hidden" }}
        >
          <div className="absolute top-[57%] left-1/2 [transform-style:preserve-3d]" ref={world}>
            {Array.from({ length: tieCount }, (_, k) => (
              <div
                aria-hidden
                className="absolute top-0 left-0 h-1.5 origin-top-left bg-fg/30"
                key={k}
                ref={(el) => {
                  ties.current[k] = el
                }}
                style={{ width: cardW * 0.5, visibility: "hidden" }}
              />
            ))}
            <ol className="contents">
              {items.map((item, i) => {
                const e = item.effect
                const front = i === focus
                return (
                  <li
                    className="absolute top-0 left-0 origin-top-left will-change-transform"
                    key={e.id}
                    ref={(el) => {
                      cards.current[i] = el
                    }}
                    style={{ width: cardW, visibility: "hidden" }}
                  >
                    <a
                      aria-label={e.name}
                      className={cn(
                        "group relative block overflow-hidden rounded-[3px] bg-bg outline-offset-4 transition-shadow duration-500",
                        front ? "shadow-[0_30px_80px_-20px_rgb(0_0_0/0.9)]" : "shadow-none"
                      )}
                      href={item.href}
                      onClick={(ev) => {
                        if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return
                        ev.preventDefault()
                        // The front card opens; any other one rides up to the front first.
                        if (front) onOpen(item.index)
                        else {
                          const el = scroller.current
                          el?.scrollTo({
                            top: i * (geo?.scroll ?? 0),
                            behavior: reducedMotion() ? "instant" : "smooth",
                          })
                        }
                      }}
                      // Until the picture arrives, a dark ground with only a hint of the
                      // effect's colour: a full accent fill flashes on first open.
                      style={{
                        // The front card and its screen morph into each other (see App).
                        viewTransitionName: front ? "archive-card" : undefined,
                        aspectRatio: "1200 / 630",
                        background: `color-mix(in srgb, ${e.accent} 10%, var(--color-bg))`,
                      }}
                      tabIndex={front ? 0 : -1}
                    >
                      <img
                        alt=""
                        className="size-full object-cover opacity-0 transition-[opacity,scale] duration-700 ease-out-quint group-hover:scale-[1.03] data-[loaded]:opacity-100"
                        decoding="async"
                        onLoad={(ev) => {
                          ev.currentTarget.dataset.loaded = ""
                        }}
                        ref={(img) => {
                          // A cached picture can finish before React attaches onLoad.
                          if (img?.complete && img.naturalWidth > 0) img.dataset.loaded = ""
                        }}
                        draggable={false}
                        height={315}
                        src={`/thumb/${e.id}.webp`}
                        width={600}
                      />
                      <span
                        aria-hidden
                        className="absolute inset-0 bg-bg transition-opacity duration-500"
                        style={{ opacity: front ? 0 : 0.35 }}
                      />
                    </a>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
