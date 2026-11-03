import type * as React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { ShaderView } from "@/components/shader-view"
import { EFFECTS } from "@/effects"
import type { HeroEffect } from "@/effects/types"
import { acquireGpu, onGpuLost, type GpuStatus } from "@/lib/gpu"
import { cn } from "@/lib/utils"

const REPO = "https://github.com/thebuilder/afterimage"
const BASE_TITLE = "Afterimage | One live experiment at a time"

/**
 * The registry is in publish order, so an effect's number is its position.
 * The feed runs the other way: newest at the top, older as you scroll down.
 */
const FEED: readonly HeroEffect[] = [...EFFECTS].reverse()

const numberOf = (e: HeroEffect) => String(EFFECTS.indexOf(e) + 1).padStart(2, "0")

/** `2026-11-03` → `3 Nov 2026`, parsed as UTC so no timezone moves the day. */
const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })

/**
 * The route: which screen of the feed, and whether its explanation is open.
 *
 * `/` is the top of the feed, the newest effect. `/ink` is Ink, and
 * `/ink/how-it-works` is Ink with its explanation open. The newest effect also
 * answers at its own `/<id>`, which is the link to share: `/` moves on
 * tomorrow, `/<id>` does not.
 */
interface Route {
  readonly index: number
  readonly how: boolean
}

function routeFromLocation(): Route {
  const [first, second] = window.location.pathname.split("/").filter(Boolean)
  if (first === undefined) return { index: 0, how: false }
  if (first === "how-it-works" && second === undefined) return { index: 0, how: true }
  const index = FEED.findIndex((e) => e.id === first)
  if (index < 0) return { index: 0, how: false }
  return { index, how: second === "how-it-works" }
}

const pathFor = (r: Route) => {
  const base = r.index === 0 ? "" : `/${FEED[r.index].id}`
  return r.how ? `${base}/how-it-works` : base || "/"
}

/** A click the browser should keep: new tab, new window, anything but a plain primary press. */
const isModifiedClick = (ev: React.MouseEvent) =>
  ev.button !== 0 || [ev.metaKey, ev.ctrlKey, ev.shiftKey, ev.altKey].some(Boolean)

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

export default function App() {
  const [status, setStatus] = useState<GpuStatus>({ state: "idle" })
  const [initial] = useState(routeFromLocation)
  const [active, setActive] = useState(initial.index)
  const [how, setHow] = useState(initial.how)
  // Control values are kept per effect, so scrolling away and back does not
  // reset the knobs, and every effect starts from its own declared defaults.
  const [tweaks, setTweaks] = useState<Record<string, Record<string, number>>>({})
  const [running, setRunning] = useState(true)
  const [chrome, setChrome] = useState(true)
  const [tuneOpen, setTuneOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [scrolled, setScrolled] = useState(initial.index !== 0)

  const feedRef = useRef<HTMLElement>(null)
  const sections = useRef<Array<HTMLElement | null>>([])

  const effect = FEED[active]

  useEffect(() => {
    acquireGpu().then(setStatus)
  }, [])

  // A driver reset or a GPU switch kills the canvas. Nothing here can repair
  // that, so the page stops claiming to be live and asks for a reload.
  useEffect(() => onGpuLost(setStatus), [])

  // Reduced motion: render for a couple of seconds so the screen is not black,
  // then freeze. A WebGPU canvas keeps its last presented frame.
  useEffect(() => {
    if (!prefersReducedMotion()) return
    const id = window.setTimeout(() => setRunning(false), 2600)
    return () => window.clearTimeout(id)
  }, [])

  // Land on the screen the URL names, without animating there.
  useEffect(() => {
    sections.current[initial.index]?.scrollIntoView({ behavior: "instant" })
  }, [initial.index])

  // Whichever screen is mostly in view is the active one.
  useEffect(() => {
    const root = feedRef.current
    if (!root) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const i = Number((entry.target as HTMLElement).dataset.index)
          setActive(i)
          if (i !== 0) setScrolled(true)
        }
      },
      { root, threshold: 0.6 }
    )
    for (const el of sections.current) if (el) io.observe(el)
    return () => io.disconnect()
  }, [])

  // The address bar follows the feed. Scrolling replaces rather than pushes:
  // twenty screens of scrolling should not be twenty presses of Back.
  useEffect(() => {
    const path = pathFor({ index: active, how })
    if (window.location.pathname !== path) window.history.replaceState(null, "", path)
    document.title = active === 0 && !how ? BASE_TITLE : `${effect.name} | Afterimage`
  }, [active, how, effect.name])

  const goTo = useCallback((index: number, smooth = true) => {
    const i = Math.max(0, Math.min(FEED.length - 1, index))
    sections.current[i]?.scrollIntoView({
      behavior: smooth && !prefersReducedMotion() ? "smooth" : "instant",
    })
  }, [])

  const controls = useMemo(() => {
    const base: Record<string, number> = {}
    for (const c of effect.controls) base[c.key] = c.value
    return { ...base, ...(tweaks[effect.id] ?? {}) }
  }, [effect, tweaks])

  const setControl = useCallback(
    (id: string, key: string, value: number) =>
      setTweaks((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [key]: value } })),
    []
  )

  const modalOpen = how || archiveOpen || aboutOpen

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return
      // A dialog owns the keyboard while it is open; Escape closes it natively.
      if (modalOpen) return
      const target = ev.target as HTMLElement | null
      // Sliders keep their own keys.
      if (target?.closest("input, textarea, select")) return
      const key = ev.key.toLowerCase()
      if (ev.key === "ArrowDown" || key === "j") {
        ev.preventDefault()
        goTo(active + 1)
      } else if (ev.key === "ArrowUp" || key === "k") {
        ev.preventDefault()
        goTo(active - 1)
      } else if (ev.key === " " && !target?.closest("button, a")) {
        ev.preventDefault()
        setRunning((r) => !r)
      } else if (key === "h") setChrome((v) => !v)
      else if (key === "t") setTuneOpen((v) => !v)
      else if (key === "a" || ev.key === "/") {
        ev.preventDefault()
        setArchiveOpen(true)
      }
      else if (ev.key === "?") setAboutOpen(true)
      else if (ev.key === "Escape") {
        setTuneOpen(false)
        setChrome(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [active, goTo, modalOpen])

  if (status.state === "unsupported") return <Unsupported reason={status.reason} />

  return (
    <>
      <main
        aria-label="Experiments, newest first"
        // A drag on the feed steers the effect; it should never select the title.
        className="feed select-none"
        ref={feedRef}
      >
        {FEED.map((e, i) => (
          <Screen
            active={i === active}
            controls={i === active ? controls : undefined}
            effect={e}
            index={i}
            key={e.id}
            // Only the screen in view and its neighbours hold a canvas, so a
            // year of daily effects never means a year of GPU surfaces.
            live={Math.abs(i - active) <= 1}
            ref={(el) => {
              sections.current[i] = el
            }}
            running={running}
            showCopy={chrome}
          />
        ))}
      </main>

      {/* ── Chrome: thin edges over the picture ─────────────────────────── */}
      <div
        className={cn(
          "pointer-events-none fixed inset-0 z-10 select-none transition-opacity duration-300",
          chrome ? "opacity-100" : "opacity-0"
        )}
        inert={!chrome}
      >
        <header className="flex items-start justify-between gap-4 p-4 sm:p-6">
          <a
            className="pointer-events-auto flex items-center gap-2.5 py-2"
            href="/"
            onClick={(ev) => {
              if (isModifiedClick(ev)) return
              ev.preventDefault()
              goTo(0)
            }}
          >
            <Mark />
            <span className="legible font-medium text-sm tracking-tight">Afterimage</span>
          </a>
          <nav className="pointer-events-auto flex items-center gap-1 rounded-full border border-line bg-glass p-1 backdrop-blur-md">
            <TextButton onClick={() => setArchiveOpen(true)}>
              Archive <span className="text-fg/45">{FEED.length}</span>
            </TextButton>
            <TextButton onClick={() => setAboutOpen(true)}>About</TextButton>
          </nav>
        </header>

        <Rail active={active} onGo={goTo} />

        <div className="absolute right-4 bottom-4 flex flex-col items-end gap-2 sm:right-6 sm:bottom-6">
          {tuneOpen ? (
            <TunePanel
              controls={controls}
              effect={effect}
              onChange={(key, value) => setControl(effect.id, key, value)}
              onReset={() => setTweaks((prev) => ({ ...prev, [effect.id]: {} }))}
            />
          ) : null}
          <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-line bg-glass p-1 backdrop-blur-md">
            <PillButton
              aria-expanded={tuneOpen}
              onClick={() => setTuneOpen((v) => !v)}
              pressed={tuneOpen}
            >
              Tune
            </PillButton>
            <PillButton onClick={() => setHow(true)}>How it works</PillButton>
            <PillButton
              aria-label={running ? "Pause" : "Play"}
              onClick={() => setRunning((r) => !r)}
            >
              {running ? <PauseIcon /> : <PlayIcon />}
            </PillButton>
            <PillButton aria-label="Hide interface" onClick={() => setChrome(false)}>
              <HideIcon />
            </PillButton>
          </div>
        </div>

        <ScrollHint onClick={() => goTo(1)} visible={!scrolled && FEED.length > 1} />
      </div>

      {!chrome ? (
        <button
          className="meta fixed right-4 bottom-4 z-20 rounded-full border border-line bg-glass px-3 py-2 text-fg/80 backdrop-blur-md transition-colors hover:text-fg"
          onClick={() => setChrome(true)}
          type="button"
        >
          Show UI · H
        </button>
      ) : null}

      <HowItWorks effect={effect} onClose={() => setHow(false)} open={how} />
      <ArchiveSheet
        active={active}
        onClose={() => setArchiveOpen(false)}
        onGo={(i) => {
          setArchiveOpen(false)
          goTo(i, false)
        }}
        open={archiveOpen}
      />
      <About onClose={() => setAboutOpen(false)} open={aboutOpen} />

      {status.state === "lost" ? (
        <div className="meta fixed inset-x-0 top-0 z-30 bg-alert px-4 py-2 text-center text-bg">
          GPU connection lost.{" "}
          <button className="underline" onClick={() => window.location.reload()} type="button">
            Reload
          </button>
        </div>
      ) : null}
    </>
  )
}

/* ── One screen of the feed ───────────────────────────────────────────── */

function Screen({
  effect,
  index,
  active,
  live,
  running,
  controls,
  showCopy,
  ref,
}: {
  effect: HeroEffect
  index: number
  active: boolean
  live: boolean
  running: boolean
  controls: Readonly<Record<string, number>> | undefined
  showCopy: boolean
  ref: React.Ref<HTMLElement>
}) {
  return (
    <section
      aria-label={effect.name}
      className="relative h-dvh snap-start snap-always overflow-hidden"
      data-index={index}
      ref={ref}
    >
      {live ? (
        <ShaderView
          className="absolute inset-0 size-full"
          controls={controls}
          effect={effect}
          // Neighbours run too, but only while some of them is on screen: the
          // view's own observer stops them the moment they are fully off.
          enabled={running}
          maxDpr={2}
          // Neighbours mount while the current screen is settled, so they
          // render a few frames up front and arrive with a picture.
          prime={!active}
          quality={1}
          rootMargin="0px"
        />
      ) : (
        // Far from view: a quiet stand-in in the effect's own colour.
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: `radial-gradient(80% 60% at 60% 40%, color-mix(in srgb, ${effect.accent} 22%, transparent), transparent 70%)`,
          }}
        />
      )}

      <div
        aria-hidden
        className={cn(
          "scrim pointer-events-none absolute inset-0 transition-opacity duration-500",
          showCopy ? "opacity-100" : "opacity-0"
        )}
      />

      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 p-4 pb-20 transition-[opacity,translate] duration-700 ease-out-quint sm:p-6 sm:pb-24 lg:pb-6",
          showCopy && active ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        )}
      >
        <p className="legible meta flex flex-wrap gap-x-3 text-fg/80">
          <span style={{ color: effect.accent }}>No. {numberOf(effect)}</span>
          {effect.published ? <span>{formatDate(effect.published)}</span> : null}
          <span>{effect.category}</span>
        </p>
        <h1 className="legible mt-3 max-w-[14ch] font-medium text-display leading-display tracking-display [text-wrap:balance]">
          {effect.name}
        </h1>
        <p className="legible mt-4 max-w-md text-fg/85 text-sm leading-relaxed sm:text-base">
          {effect.tagline}
        </p>
      </div>
    </section>
  )
}

/* ── Navigation ───────────────────────────────────────────────────────── */

/**
 * One tick per effect down the right edge, newest at the top. The ticks share
 * a capped height, so the rail stays the same size as the run grows.
 */
function Rail({ active, onGo }: { active: number; onGo: (i: number) => void }) {
  return (
    <nav
      aria-label="Jump to an experiment"
      className="pointer-events-auto absolute top-1/2 right-0 hidden max-h-[56dvh] -translate-y-1/2 flex-col items-end pr-3 sm:flex sm:pr-5"
      style={{ height: `${FEED.length * 18}px` }}
    >
      {FEED.map((e, i) => {
        const current = i === active
        return (
          <button
            aria-current={current ? "true" : undefined}
            aria-label={`${numberOf(e)} ${e.name}`}
            className="group relative flex min-h-0 flex-1 items-center justify-end pl-4"
            key={e.id}
            onClick={() => onGo(i)}
            type="button"
          >
            <span className="legible meta pointer-events-none absolute right-full mr-1 whitespace-nowrap text-fg opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              {numberOf(e)} {e.name}
            </span>
            <span
              className={cn(
                // The halo keeps a one-pixel tick visible on a pale frame.
                "block h-px shadow-[0_0_3px_1px_rgb(0_0_0/0.55)] transition-all duration-300",
                current ? "w-6" : "w-2.5 bg-fg/55 group-hover:w-4 group-hover:bg-fg"
              )}
              style={current ? { background: e.accent } : undefined}
            />
          </button>
        )
      })}
    </nav>
  )
}

function ScrollHint({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <button
      className={cn(
        "legible meta pointer-events-auto absolute bottom-6 left-1/2 hidden -translate-x-1/2 items-center gap-2 text-fg/80 transition-opacity duration-500 hover:text-fg lg:flex",
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      )}
      onClick={onClick}
      tabIndex={visible ? 0 : -1}
      type="button"
    >
      Scroll for older
      <svg aria-hidden className="size-3 animate-bounce" fill="none" viewBox="0 0 12 12">
        <path d="M6 1v10M2 7l4 4 4-4" stroke="currentColor" />
      </svg>
    </button>
  )
}

/* ── Controls ─────────────────────────────────────────────────────────── */

function TunePanel({
  effect,
  controls,
  onChange,
  onReset,
}: {
  effect: HeroEffect
  controls: Readonly<Record<string, number>>
  onChange: (key: string, value: number) => void
  onReset: () => void
}) {
  return (
    <div className="pointer-events-auto grid w-[min(18rem,calc(100vw-2rem))] gap-3 rounded-2xl border border-line bg-glass p-4 backdrop-blur-md">
      {effect.controls.map((c) => {
        const value = controls[c.key]
        const fill = ((value - c.min) / (c.max - c.min)) * 100
        return (
          <label className="grid gap-1" key={c.key}>
            <span className="meta flex justify-between text-dim">
              <span>{c.label}</span>
              <span className="text-fg tabular-nums">{value.toFixed(c.step < 0.01 ? 3 : 2)}</span>
            </span>
            <input
              className="range"
              max={c.max}
              min={c.min}
              onChange={(ev) => onChange(c.key, Number(ev.target.value))}
              step={c.step}
              style={{ "--fill": `${fill}%` } as React.CSSProperties}
              type="range"
              value={value}
            />
          </label>
        )
      })}
      <button
        className="meta justify-self-start text-faint transition-colors hover:text-fg"
        onClick={onReset}
        type="button"
      >
        Reset
      </button>
    </div>
  )
}

function PillButton({
  pressed,
  className,
  ...props
}: React.ComponentProps<"button"> & { pressed?: boolean }) {
  return (
    <button
      className={cn(
        "meta flex h-8 min-w-8 items-center justify-center rounded-full px-3 transition-colors",
        pressed ? "bg-fg text-bg" : "text-fg/80 hover:bg-fg/10 hover:text-fg",
        className
      )}
      type="button"
      {...props}
    />
  )
}

function TextButton(props: React.ComponentProps<"button">) {
  return (
    <button
      className="meta flex h-8 items-center gap-1.5 rounded-full px-3 text-fg/80 transition-colors hover:bg-fg/10 hover:text-fg"
      type="button"
      {...props}
    />
  )
}

/* ── Sheets ───────────────────────────────────────────────────────────── */

/**
 * A native modal <dialog>: focus trapping, Escape and the top layer for free.
 * Clicking the empty sheet outside its content closes it too.
 */
function Sheet({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean
  onClose: () => void
  label: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      // React handles autoFocus itself on mount, before the dialog opens, and
      // showModal then moves focus to the first button. Ask again afterwards.
      d.querySelector<HTMLElement>("[data-autofocus]")?.focus()
    }
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      aria-label={label}
      className="sheet"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose()
      }}
      onClose={onClose}
      ref={ref}
    >
      {open ? (
        <div className="relative mx-auto flex h-full max-w-5xl flex-col">
          <button
            className="meta absolute top-4 right-4 z-10 rounded-full border border-line bg-bg px-3 py-2 text-dim transition-colors hover:text-fg sm:top-6 sm:right-6"
            onClick={onClose}
            type="button"
          >
            Close · Esc
          </button>
          {children}
        </div>
      ) : null}
    </dialog>
  )
}

/** Everything a search can match an effect on: its words and its techniques. */
const haystack = (e: HeroEffect) =>
  [
    numberOf(e),
    e.name,
    e.category,
    e.tagline,
    e.published ?? "",
    ...e.technical.techniques,
  ]
    .join(" ")
    .toLowerCase()

const HAYSTACKS = new Map(FEED.map((e) => [e, haystack(e)]))

/**
 * Every experiment, newest first, with a search box over names, categories,
 * taglines and techniques. Every word typed has to match somewhere, so
 * "fluid pointer" narrows rather than widens. Enter opens the first result.
 */
function ArchiveSheet({
  open,
  onClose,
  onGo,
  active,
}: {
  open: boolean
  onClose: () => void
  onGo: (i: number) => void
  active: number
}) {
  const [query, setQuery] = useState("")
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const results = FEED.map((e, i) => ({ e, i })).filter(({ e }) => {
    const hay = HAYSTACKS.get(e) ?? ""
    return words.every((w) => hay.includes(w))
  })

  return (
    <Sheet
      label="Archive"
      onClose={() => {
        setQuery("")
        onClose()
      }}
      open={open}
    >
      <div className="px-4 pt-7 sm:px-6 sm:pt-9">
        <p className="meta text-dim">Archive · newest first</p>
        <label className="mt-6 flex items-baseline gap-3 border-line border-b pb-3 focus-within:border-fg">
          <span className="sr-only">Search the archive</span>
          <svg aria-hidden className="size-4 shrink-0 self-center text-faint" fill="none" stroke="currentColor" viewBox="0 0 16 16">
            <circle cx="7" cy="7" r="5" />
            <path d="m11 11 4 4" />
          </svg>
          <input
            autoComplete="off"
            // Focused when the sheet opens, so typing searches at once.
            data-autofocus
            className="w-full bg-transparent font-medium text-2xl tracking-tight outline-none placeholder:text-faint sm:text-3xl [&::-webkit-search-cancel-button]:appearance-none"
            onChange={(ev) => setQuery(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && results.length > 0) {
                setQuery("")
                onGo(results[0].i)
              }
            }}
            placeholder="Search by name, mood or technique"
            spellCheck={false}
            type="search"
            value={query}
          />
          <span className="meta shrink-0 text-faint tabular-nums">
            {results.length}/{FEED.length}
          </span>
        </label>
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 sm:px-6">
        {results.map(({ e, i }) => (
          <li key={e.id}>
            <a
              aria-current={i === active ? "true" : undefined}
              className="group grid grid-cols-[2.5rem_1fr] items-baseline gap-x-4 border-line border-b py-3 sm:grid-cols-[3.5rem_1fr_auto]"
              href={pathFor({ index: i, how: false })}
              onClick={(ev) => {
                if (isModifiedClick(ev)) return
                ev.preventDefault()
                setQuery("")
                onGo(i)
              }}
            >
              <span className="meta tabular-nums" style={{ color: e.accent }}>
                {numberOf(e)}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    "block font-medium text-2xl tracking-tight transition-colors sm:text-4xl",
                    i === active ? "text-fg" : "text-dim group-hover:text-fg"
                  )}
                >
                  {e.name}
                </span>
                <span className="mt-1 block truncate text-faint text-sm transition-colors group-hover:text-dim">
                  {e.tagline}
                </span>
              </span>
              <span className="meta hidden text-faint sm:block">
                {e.published ? formatDate(e.published) : e.category}
              </span>
            </a>
          </li>
        ))}
        {results.length === 0 ? (
          <li className="py-10 text-dim">
            Nothing matches “{query}”.{" "}
            <button className="text-fg underline underline-offset-4" onClick={() => setQuery("")} type="button">
              Clear the search
            </button>
          </li>
        ) : null}
      </ol>
    </Sheet>
  )
}

/** What you are looking at, how it is made, and the implementation notes under that. */
function HowItWorks({
  effect,
  open,
  onClose,
}: {
  effect: HeroEffect
  open: boolean
  onClose: () => void
}) {
  const t = effect.technical
  return (
    <Sheet label={`How ${effect.name} works`} onClose={onClose} open={open}>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-7 pb-16 sm:px-6 sm:pt-9">
        <p className="meta text-dim">
          <span style={{ color: effect.accent }}>No. {numberOf(effect)}</span> · How it works
        </p>
        <h2 className="mt-4 font-medium text-5xl tracking-tighter sm:text-7xl">{effect.name}</h2>
        <p className="mt-6 max-w-2xl text-dim text-lg leading-relaxed">{effect.summary}</p>

        <ol className="mt-12 grid gap-px border border-line bg-line sm:grid-cols-3">
          {effect.explanation.map((stage, i) => (
            <li className="bg-bg p-5" key={stage.title}>
              <span className="meta text-faint tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 font-medium text-lg">{stage.title}</h3>
              <p className="mt-2 text-dim text-sm leading-relaxed">{stage.body}</p>
            </li>
          ))}
        </ol>

        <p
          className="mt-10 max-w-2xl border-l pl-4 text-sm leading-relaxed"
          style={{ borderColor: effect.accent }}
        >
          {t.insight}
        </p>

        <details className="group mt-12 border-line border-t pt-4">
          <summary className="meta flex cursor-pointer list-none items-center justify-between text-dim hover:text-fg">
            Under the hood
            <span className="transition-transform group-open:rotate-45">+</span>
          </summary>
          <div className="grid gap-6 pt-6">
            <ol className="grid gap-2">
              {t.pipeline.map((stage, i) => (
                <li className="flex gap-3 font-mono text-dim text-xs leading-relaxed" key={stage}>
                  <span className="text-faint tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  {stage}
                </li>
              ))}
            </ol>
            <ul className="flex flex-wrap gap-2">
              {t.techniques.map((tag) => (
                <li className="meta rounded-full border border-line px-2.5 py-1 text-dim" key={tag}>
                  {tag}
                </li>
              ))}
            </ul>
            <p className="max-w-2xl text-dim text-sm leading-relaxed">{t.notes}</p>
            <a
              className="meta justify-self-start rounded-full border border-line px-3 py-2 text-dim transition-colors hover:text-fg"
              href={`${REPO}/blob/main/${t.source}`}
              rel="noreferrer"
              target="_blank"
            >
              View source ↗
            </a>
          </div>
        </details>
      </div>
    </Sheet>
  )
}

function InlineLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      className="text-fg underline decoration-line underline-offset-4 transition-colors hover:decoration-fg"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  )
}

const KEYS: ReadonlyArray<readonly [string, string]> = [
  ["Next / previous", "↓ ↑  or  J K"],
  ["Tune", "T"],
  ["Archive and search", "A  or  /"],
  ["Pause", "Space"],
  ["Hide interface", "H"],
  ["This page", "?"],
]

function About({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet label="About Afterimage" onClose={onClose} open={open}>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-7 pb-16 sm:px-6 sm:pt-9">
        <p className="meta text-dim">About</p>
        <h2 className="mt-4 max-w-3xl font-medium text-4xl tracking-tighter sm:text-6xl">
          One live experiment at a time.
        </h2>
        <p className="mt-6 max-w-2xl text-dim text-lg leading-relaxed">
          Every screen is rendered live in your browser with WebGPU, not played back as video. The
          newest is always on top, and a new one lands most days. Scroll for older ones, tune
          them, or hide the interface and let one fill the screen.
        </p>
        <p className="mt-4 max-w-2xl text-dim leading-relaxed">
          Made by <InlineLink href="https://thebuilder.dk">thebuilder</InlineLink> with{" "}
          <InlineLink href="https://vgpu.sh">vgpu</InlineLink>. The source and the full technical
          notes are <InlineLink href={REPO}>on GitHub</InlineLink>.
        </p>

        <p className="meta mt-12 text-dim">Keyboard</p>
        <dl className="mt-3 grid max-w-md">
          {KEYS.map(([label, keys]) => (
            <div className="meta flex justify-between border-line border-t py-2.5" key={label}>
              <dt className="text-dim">{label}</dt>
              <dd className="text-fg">{keys}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Sheet>
  )
}

/* ── Small pieces ─────────────────────────────────────────────────────── */

/** The mark: a lit square and the faint ghost it leaves behind. */
function Mark() {
  return (
    <span aria-hidden className="relative block size-3.5">
      <span className="absolute right-0 bottom-0 size-2.5 bg-fg/30" />
      <span className="absolute top-0 left-0 size-2.5 bg-fg" />
    </span>
  )
}

const PauseIcon = () => (
  <svg aria-hidden className="size-3" fill="currentColor" viewBox="0 0 12 12">
    <rect height="10" width="3" x="2" y="1" />
    <rect height="10" width="3" x="7" y="1" />
  </svg>
)

const PlayIcon = () => (
  <svg aria-hidden className="size-3" fill="currentColor" viewBox="0 0 12 12">
    <path d="M2.5 1v10l8.5-5z" />
  </svg>
)

const HideIcon = () => (
  <svg aria-hidden className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 14 14">
    <path d="M1 1h4M1 1v4M13 1H9M13 1v4M1 13h4M1 13V9M13 13H9M13 13V9" />
  </svg>
)

function Unsupported({ reason }: { reason: string }) {
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-lg">
        <p className="meta text-alert">Device check failed</p>
        <h1 className="mt-4 font-medium text-4xl tracking-tighter">This needs WebGPU</h1>
        <p className="mt-4 text-dim leading-relaxed">
          Everything here is rendered live on the GPU. Chrome or Edge 113+, or Safari 26, on a
          machine with a supported GPU will run it.
        </p>
        <pre className="mt-6 overflow-x-auto border border-line p-3 font-mono text-alert text-xs">
          {reason}
        </pre>
      </div>
    </div>
  )
}
