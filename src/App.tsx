"use client"

import type * as React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Slider } from "@/components/ui/slider"
import { Eyebrow } from "@/components/eyebrow"
import { Scanlines } from "@/components/scanlines"
import { ShaderView } from "@/components/shader-view"
import { EFFECTS } from "@/effects"
import type { HeroEffect } from "@/effects/types"
import { acquireGpu, onGpuLost, type GpuStatus } from "@/lib/gpu"
import { cn } from "@/lib/utils"

const REPO = "https://github.com/thebuilder/afterimage"
const BASE_TITLE = "Afterimage | One live experiment at a time"

/**
 * The registry is in publish order, so the newest effect is the last entry and
 * an effect's number is its position. The front page always shows the newest.
 */
const LATEST = EFFECTS[EFFECTS.length - 1]

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
 * The route: which effect, and whether its explanation is open.
 *
 * Both live in the path so an explanation can be linked to directly, the same
 * way an effect can. `/ink` is Ink; `/ink/how-it-works` is Ink with the panel
 * open. `id: null` is the front page, which is always the newest effect, so
 * `/how-it-works` explains whatever is newest today. Everything the page shows
 * derives from this one value.
 *
 * The newest effect also has its own `/<id>`, and that is the link to share:
 * `/` moves on tomorrow, `/<id>` does not.
 */
interface Route {
  readonly id: string | null
  readonly how: boolean
}

const segments = () => window.location.pathname.split("/").filter(Boolean)

function routeFromLocation(): Route {
  const [first, second] = segments()
  if (first === "how-it-works" && second === undefined) return { id: null, how: true }
  const id = EFFECTS.some((e) => e.id === first) ? first : null
  return { id, how: id !== null && second === "how-it-works" }
}

const pathFor = (r: Route) => {
  const base = r.id === null ? "" : `/${r.id}`
  return r.how ? `${base}/how-it-works` : base || "/"
}

const effectFor = (r: Route) => EFFECTS.find((e) => e.id === r.id) ?? LATEST

/**
 * Whether the path as written is one this app would ever produce.
 *
 * Asking whether it round-trips catches every kind of junk at once: an unknown
 * slug, a trailing slash, a second segment that is not the panel.
 */
const pathIsRoute = () => window.location.pathname === pathFor(routeFromLocation())

/**
 * A click the browser should keep for itself: open in a new tab or window, or
 * anything that is not a plain primary-button press.
 */
const isModifiedClick = (ev: React.MouseEvent) =>
  ev.button !== 0 || [ev.metaKey, ev.ctrlKey, ev.shiftKey, ev.altKey].some(Boolean)

export default function App() {
  const [status, setStatus] = useState<GpuStatus>({ state: "idle" })
  const [route, setRoute] = useState<Route>(routeFromLocation)
  // Control values are kept per effect, so stepping away and back does not
  // reset the knobs, and every effect starts from its own declared defaults.
  const [tweaks, setTweaks] = useState<Record<string, Record<string, number>>>({})
  const [running, setRunning] = useState(true)
  const [heroFps, setHeroFps] = useState(0)
  const [chromeVisible, setChromeVisible] = useState(true)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [indexOpen, setIndexOpen] = useState(false)
  const [diagnostics, setDiagnostics] = useState(false)

  useEffect(() => {
    acquireGpu().then(setStatus)
  }, [])

  // A driver reset or a GPU switch kills the canvas. Nothing here can repair
  // that, so the page stops claiming to be live and asks for a reload.
  useEffect(() => onGpuLost(setStatus), [])

  // Reduced motion: render for a couple of seconds so the screen is not black,
  // then freeze. A WebGPU canvas keeps its last presented frame, so stopping
  // the loop leaves a still image behind.
  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const id = window.setTimeout(() => setRunning(false), 2600)
    return () => window.clearTimeout(id)
  }, [])

  const active = useMemo(() => effectFor(route), [route])
  const position = EFFECTS.indexOf(active)
  const older = EFFECTS[position - 1] as HeroEffect | undefined
  const newer = EFFECTS[position + 1] as HeroEffect | undefined

  const controls = useMemo(() => {
    const base: Record<string, number> = {}
    for (const c of active.controls) base[c.key] = c.value
    return { ...base, ...(tweaks[active.id] ?? {}) }
  }, [active, tweaks])

  const setControl = useCallback(
    (id: string, key: string, value: number) =>
      setTweaks((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [key]: value } })),
    []
  )

  const resetControls = useCallback(
    (id: string) => setTweaks((prev) => ({ ...prev, [id]: {} })),
    []
  )

  const select = useCallback((effect: HeroEffect) => {
    // The newest effect lives at `/`, so the front page stays the front page
    // when someone steps back to it instead of turning into `/rain`.
    setRoute({ id: effect === LATEST ? null : effect.id, how: false })
    setIndexOpen(false)
  }, [])

  const setHow = useCallback(
    (how: boolean) => setRoute((r) => ({ id: r.id, how })),
    []
  )

  // Write the route to the URL. Comparing against the path makes this
  // idempotent, which StrictMode's double-invoked effects require.
  useEffect(() => {
    const path = pathFor(route)
    if (window.location.pathname === path) return
    // Correcting a path that was never a route is a normalisation, not a
    // navigation: replace it, so Back does not walk into a URL we rewrote.
    window.history[pathIsRoute() ? "pushState" : "replaceState"](null, "", path)
  }, [route])

  useEffect(() => {
    document.title = route.id === null ? BASE_TITLE : `${active.name} | Afterimage`
  }, [route.id, active.name])

  useEffect(() => {
    const onPop = () => setRoute(routeFromLocation())
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  const modalOpen = aboutOpen || indexOpen || route.how

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      // Browser chords stay the browser's. Shift stays allowed because "?" needs it.
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return
      // A dialog owns the keyboard while it is open: without this, an arrow key
      // behind the scrim would swap the effect out from under it.
      if (modalOpen) return
      // Sliders take arrow keys for themselves; let them.
      if (ev.target instanceof HTMLElement && ev.target.closest("[role=slider]")) return
      const key = ev.key.toLowerCase()
      if (ev.key === "?") setAboutOpen(true)
      if (ev.key === "Escape") setChromeVisible(true)
      if (key === "h") setChromeVisible((v) => !v)
      if (key === "d") setDiagnostics((v) => !v)
      if (key === "i") setIndexOpen(true)
      if ((ev.key === "ArrowLeft" || key === "j") && older) select(older)
      if ((ev.key === "ArrowRight" || key === "k") && newer) select(newer)
      if (ev.key === " " && ev.target === document.body) {
        ev.preventDefault()
        setRunning((r) => !r)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [modalOpen, select, older, newer])

  if (status.state === "unsupported") {
    return <Unsupported reason={status.reason} />
  }

  return (
    <div className="h-dvh overflow-hidden bg-void text-foreground">
      <Scanlines density="soft" fixed />

      <main className="relative isolate h-dvh w-full overflow-hidden">
        <ShaderView
          className="absolute inset-0 size-full"
          controls={controls}
          effect={active}
          enabled={running}
          key="hero"
          maxDpr={2}
          onFps={diagnostics ? setHeroFps : undefined}
          quality={1}
        />

        {/* Scrims. A hero has to survive having words on it, and several of these
            effects fill the frame with bright, high-frequency detail. The copy
            needs a ground of its own, and a text-shadow will not carry it.
            The scrims fade with the chrome: they exist for the copy, not the picture. */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 hero-scrim-bottom transition-opacity duration-300",
            chromeVisible ? "opacity-100" : "opacity-0"
          )}
        />
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 hero-scrim-left transition-opacity duration-300",
            chromeVisible ? "opacity-100" : "opacity-0"
          )}
        />

        <div
          // inert removes the whole subtree from hit-testing, focus order and the
          // accessibility tree while hidden, which the children's pointer-events-auto
          // would otherwise re-enable underneath the fade.
          inert={!chromeVisible}
          className={cn(
            "pointer-events-none absolute inset-0 flex flex-col justify-between transition-opacity duration-300",
            chromeVisible ? "opacity-100" : "opacity-0"
          )}
        >
          <div className="pointer-events-auto flex items-center justify-between gap-4 border-line border-b bg-gradient-to-b from-void/85 to-transparent px-5 py-3 backdrop-blur-bar sm:px-8">
            <a
              className="flex items-center gap-3"
              href="/"
              onClick={(ev) => {
                if (isModifiedClick(ev)) return
                ev.preventDefault()
                select(LATEST)
              }}
            >
              {/* The mark: a lit square and the complementary ghost it burns in. */}
              <span aria-hidden className="relative block size-3.5">
                <span className="absolute right-0 bottom-0 size-2.5 bg-signal" />
                <span className="absolute top-0 left-0 size-2.5 bg-phosphor shadow-glow" />
              </span>
              <span className="font-bold font-mono text-label text-phosphor-bright uppercase tracking-brand">
                Afterimage
              </span>
              <Separator className="hidden h-4 sm:block" orientation="vertical" />
              <span className="hidden font-mono text-readout text-muted-foreground uppercase tracking-readout sm:inline">
                One live experiment at a time
              </span>
            </a>
            <div className="flex items-center gap-4 sm:gap-5">
              <TopLink onClick={() => setIndexOpen(true)}>Index</TopLink>
              <TopLink onClick={() => setAboutOpen(true)}>About</TopLink>
              <a
                className="hidden font-mono text-readout text-muted-foreground uppercase tracking-readout transition-colors hover:text-phosphor sm:inline"
                href={REPO}
                rel="noreferrer"
                target="_blank"
              >
                Source
              </a>
              {/* The adapter name and frame rate are diagnostics, not decoration.
                  A visitor needs to know it is running, not which GPU it found. */}
              {diagnostics ? (
                <span className="hidden items-center gap-4 font-mono text-readout text-phosphor-dim sm:flex">
                  <span className="tabular-nums">{heroFps.toFixed(0).padStart(3, "0")} FPS</span>
                  <span>{status.state === "ready" ? status.adapter : "acquiring"}</span>
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-8 px-5 pb-8 sm:px-8 sm:pb-12 lg:grid-cols-[minmax(0,34rem)_1fr] lg:items-end">
            <div>
              <Eyebrow caret>
                No. {numberOf(active)}
                {active.published ? ` · ${formatDate(active.published)}` : ""} · {active.category}
              </Eyebrow>
              <h1 className="mt-4 font-semibold text-hero text-phosphor-bright leading-hero tracking-hero [text-shadow:0_0_40px_rgb(0_0_0/0.85)]">
                {active.name}
              </h1>
              <p className="mt-4 max-w-lg text-balance text-ink text-sm leading-relaxed [text-shadow:0_1px_12px_rgb(0_0_0/0.9)] sm:text-base">
                {active.tagline}
              </p>
              <div className="pointer-events-auto mt-6 flex flex-wrap items-center gap-2.5">
                <Button onClick={() => setHow(true)} size="lg">
                  How it works
                </Button>
                <Button onClick={() => setRunning((r) => !r)} size="lg" variant="outline">
                  {running ? "Pause" : "Resume"}
                </Button>
                <Button onClick={() => setChromeVisible(false)} size="lg" variant="outline">
                  Hide UI
                </Button>
              </div>
            </div>

            <div className="grid gap-4 lg:w-panel lg:justify-self-end">
              <div className="pointer-events-auto grid gap-3 border border-line bg-void/78 p-4 backdrop-blur-panel">
                <Eyebrow>Shape the effect</Eyebrow>
                {active.controls.map((c) => (
                  <div className="grid gap-1.5" key={c.key}>
                    <div className="flex items-center justify-between font-mono text-readout text-muted-foreground uppercase tracking-readout">
                      <span>{c.label}</span>
                      <span className="text-phosphor tabular-nums">
                        {controls[c.key].toFixed(c.step < 0.01 ? 4 : 2)}
                      </span>
                    </div>
                    <Slider
                      max={c.max}
                      min={c.min}
                      onValueChange={(v) => setControl(active.id, c.key, Array.isArray(v) ? v[0] : v)}
                      step={c.step}
                      value={controls[c.key]}
                    />
                  </div>
                ))}
                <button
                  className="justify-self-start font-mono text-tag text-phosphor-dim uppercase tracking-readout hover:text-phosphor"
                  onClick={() => resetControls(active.id)}
                  type="button"
                >
                  Reset
                </button>
              </div>

              <nav
                aria-label="Step through the experiments"
                className="pointer-events-auto grid grid-cols-2 gap-px border border-line bg-line"
              >
                <StepLink direction="older" effect={older} onSelect={select} />
                <StepLink direction="newer" effect={newer} onSelect={select} />
              </nav>
            </div>
          </div>
        </div>

        {!chromeVisible ? (
          <button
            className="pointer-events-auto absolute right-4 bottom-4 z-50 border border-line bg-void/70 px-2.5 py-1.5 font-mono text-readout text-phosphor-dim uppercase tracking-readout hover:text-phosphor"
            onClick={() => setChromeVisible(true)}
            type="button"
          >
            show ui · H
          </button>
        ) : null}
      </main>

      <HowItWorks effect={active} onOpenChange={setHow} open={route.how} />
      <About
        onBrowse={() => {
          setAboutOpen(false)
          setIndexOpen(true)
        }}
        onOpenChange={setAboutOpen}
        open={aboutOpen}
      />
      <Index active={active} onOpenChange={setIndexOpen} onSelect={select} open={indexOpen} />

      {status.state === "lost" ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-line border-t bg-void/95 px-5 py-3 text-center font-mono text-readout text-signal uppercase tracking-readout">
          GPU connection lost.{" "}
          <button
            className="underline decoration-dotted underline-offset-4"
            onClick={() => window.location.reload()}
            type="button"
          >
            Reload
          </button>
        </div>
      ) : null}
    </div>
  )
}

function TopLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className="font-mono text-readout text-muted-foreground uppercase tracking-readout transition-colors hover:text-phosphor"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

/**
 * One half of the older / newer pair. A real anchor, so cmd-click opens the
 * neighbour in a new tab; the handler only takes over the plain left click.
 * At either end of the run the slot stays, empty, so the other one does not
 * jump across.
 */
function StepLink({
  direction,
  effect,
  onSelect,
}: {
  direction: "older" | "newer"
  effect: HeroEffect | undefined
  onSelect: (e: HeroEffect) => void
}) {
  const align = direction === "older" ? "text-left" : "text-right"
  const label = direction === "older" ? "← Previous" : "Next →"
  if (!effect) {
    return (
      <span className={cn("grid gap-1 bg-void/78 p-3 backdrop-blur-panel", align)}>
        <span className="font-mono text-tag text-muted-foreground/50 uppercase tracking-readout">
          {direction === "older" ? "First" : "Latest"}
        </span>
      </span>
    )
  }
  return (
    <a
      className={cn(
        "group grid gap-1 bg-void/78 p-3 backdrop-blur-panel outline-none transition-colors hover:bg-panel focus-visible:outline-2 focus-visible:outline-phosphor-bright",
        align
      )}
      href={pathFor({ id: effect === LATEST ? null : effect.id, how: false })}
      onClick={(ev) => {
        if (isModifiedClick(ev)) return
        ev.preventDefault()
        onSelect(effect)
      }}
    >
      <span className="font-mono text-tag text-phosphor-dim uppercase tracking-readout group-hover:text-phosphor">
        {label}
      </span>
      <span className="truncate text-ink text-xs">
        <span className="font-mono text-muted-foreground tabular-nums">{numberOf(effect)}</span>{" "}
        {effect.name}
      </span>
    </a>
  )
}

/**
 * Every experiment, newest first, as plain links. No canvases: the point of
 * the page is one picture at a time, and twenty live previews behind a drawer
 * would spend the GPU on things nobody is looking at.
 */
function Index({
  open,
  onOpenChange,
  onSelect,
  active,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (e: HeroEffect) => void
  active: HeroEffect
}) {
  const newestFirst = useMemo(() => [...EFFECTS].reverse(), [])
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full gap-0 bg-void/95 sm:max-w-md" side="right">
        <SheetHeader className="border-line border-b">
          <Eyebrow>Index</Eyebrow>
          <SheetTitle className="text-xl">{EFFECTS.length} experiments</SheetTitle>
          <SheetDescription>Newest first. A new one most days.</SheetDescription>
        </SheetHeader>
        <ol className="min-h-0 flex-1 overflow-y-auto">
          {newestFirst.map((effect) => {
            const current = effect === active
            return (
              <li key={effect.id}>
                <a
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "grid grid-cols-[3rem_1fr_auto] items-baseline gap-3 border-line border-b px-6 py-3 outline-none transition-colors",
                    "hover:bg-panel focus-visible:bg-panel",
                    current && "bg-panel"
                  )}
                  href={pathFor({ id: effect === LATEST ? null : effect.id, how: false })}
                  onClick={(ev) => {
                    if (isModifiedClick(ev)) return
                    ev.preventDefault()
                    onSelect(effect)
                  }}
                >
                  <span
                    className="font-mono text-readout tabular-nums"
                    style={{ color: effect.accent }}
                  >
                    {numberOf(effect)}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block truncate font-semibold text-sm tracking-card",
                        current ? "text-phosphor-bright" : "text-ink"
                      )}
                    >
                      {effect.name}
                    </span>
                    <span className="block truncate text-ink-muted text-xs">{effect.tagline}</span>
                  </span>
                  <span className="font-mono text-tag text-muted-foreground uppercase tracking-readout">
                    {effect.published ? formatDate(effect.published) : effect.category}
                  </span>
                </a>
              </li>
            )
          })}
        </ol>
      </SheetContent>
    </Sheet>
  )
}

/**
 * The per-effect explanation: what you are looking at, how it is made, and the
 * implementation notes folded away underneath.
 */
function HowItWorks({
  effect,
  open,
  onOpenChange,
}: {
  effect: HeroEffect
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = effect.technical
  const body = useRef<HTMLDivElement>(null)
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-2xl" initialFocus={body}>
        <DialogHeader>
          <Eyebrow>{effect.category}</Eyebrow>
          <DialogTitle className="text-xl">{effect.name}</DialogTitle>
          <DialogDescription className="sr-only">
            What you are seeing in {effect.name}, and how it is made.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-6 dialog-scroll px-6" ref={body} tabIndex={-1}>
          <p className="text-ink text-sm leading-relaxed">{effect.summary}</p>

          <Eyebrow className="mt-8">How it works</Eyebrow>
          <ol className="mt-4 grid gap-px bg-line">
            {effect.explanation.map((stage, i) => (
              <li className="flex gap-4 bg-popover p-4" key={stage.title}>
                <span className="font-mono text-readout text-signal tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="font-mono text-label text-phosphor uppercase tracking-readout">
                    {stage.title}
                  </h3>
                  <p className="mt-2 text-ink-muted text-xs leading-relaxed">{stage.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <p className="mt-6 border-phosphor-dim border-l-2 pl-4 text-ink-muted text-xs leading-relaxed">
            {t.insight}
          </p>

          <Collapsible className="mt-8">
            <CollapsibleTrigger className="group flex w-full items-center justify-between border-line border-t pt-4 font-mono text-readout text-phosphor-dim uppercase tracking-readout transition-colors hover:text-phosphor">
              Under the hood
              <span className="transition-transform group-data-[panel-open]:rotate-45">+</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="grid gap-5 pt-5">
                <div>
                  <p className="font-mono text-tag text-muted-foreground uppercase tracking-readout">
                    Frame graph
                  </p>
                  <ol className="mt-2 grid gap-2">
                    {t.pipeline.map((stage, i) => (
                      <li className="flex gap-3" key={stage}>
                        <span className="font-mono text-readout text-phosphor-dim tabular-nums">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="font-mono text-readout text-ink-muted leading-relaxed">
                          {stage}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="flex flex-wrap gap-2">
                  {t.techniques.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <p className="text-ink-muted text-xs leading-relaxed">{t.notes}</p>
                <a
                  className="justify-self-start border border-line px-3 py-2 font-mono text-readout text-phosphor uppercase tracking-readout transition-colors hover:border-line-strong hover:text-phosphor-bright"
                  href={`${REPO}/blob/main/${t.source}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  View source
                </a>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function About({
  open,
  onOpenChange,
  onBrowse,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onBrowse: () => void
}) {
  const body = useRef<HTMLDivElement>(null)
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-xl" initialFocus={body}>
        <DialogHeader>
          <Eyebrow>About</Eyebrow>
          <DialogTitle className="text-xl">Afterimage</DialogTitle>
          <DialogDescription className="sr-only">
            What Afterimage is and what it is built with.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-6 dialog-scroll px-6" ref={body} tabIndex={-1}>
          <p className="text-ink text-sm leading-relaxed">
            One live visual experiment at a time, rendered in your browser. The front page is
            always the newest one. Shape it with a few controls, hide the interface and let it
            fill the screen, or step back through the earlier ones.
          </p>
          <p className="mt-4 text-ink-muted text-sm leading-relaxed">
            Afterimage is by <FootLink href="https://thebuilder.dk">thebuilder</FootLink>, built
            with <FootLink href="https://vgpu.sh">vgpu</FootLink> on WebGPU and styled with{" "}
            <FootLink href="https://afterglow.thebuilder.dk">Afterglow</FootLink>. The source and
            the full technical notes are on GitHub.
          </p>

          <div className="mt-6 flex flex-wrap gap-2.5">
            <Button onClick={onBrowse}>Browse the index</Button>
            <Button
              // Base UI needs telling that this one renders an anchor, or it
              // warns that the native button semantics have been dropped.
              nativeButton={false}
              render={<a href={REPO} rel="noreferrer" target="_blank" />}
              variant="outline"
            >
              View source
            </Button>
          </div>

          <Collapsible className="mt-8">
            <CollapsibleTrigger className="group flex w-full items-center justify-between border-line border-t pt-4 font-mono text-readout text-phosphor-dim uppercase tracking-readout transition-colors hover:text-phosphor">
              What is WebGPU?
              <span className="transition-transform group-data-[panel-open]:rotate-45">+</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="pt-4 text-ink-muted text-xs leading-relaxed">
                WebGPU lets a website use modern graphics hardware for real-time rendering and
                simulation. Everything here is generated live rather than played back as video.
              </p>
            </CollapsibleContent>
          </Collapsible>

          <Eyebrow className="mt-8">Keyboard</Eyebrow>
          <div className="mt-3 grid gap-2 font-mono text-readout text-muted-foreground uppercase tracking-readout">
            <Row label="Previous / next" value="← →" />
            <Row label="Index" value="I" />
            <Row label="Pause" value="Space" />
            <Row label="Hide interface" value="H" />
            <Row label="Diagnostics" value="D" />
            <Row label="This panel" value="?" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FootLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      className="text-phosphor-dim underline decoration-line decoration-dotted underline-offset-4 transition-colors hover:text-phosphor hover:decoration-phosphor"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-line border-b pb-2">
      <span>{label}</span>
      <span className="text-phosphor">{value}</span>
    </div>
  )
}

function Unsupported({ reason }: { reason: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-void px-6">
      <Scanlines density="soft" fixed />
      <div className="max-w-lg border border-line bg-panel p-8">
        <Eyebrow caret>Device check failed</Eyebrow>
        <h1 className="mt-4 font-semibold text-2xl text-phosphor-bright">No WebGPU adapter</h1>
        <p className="mt-4 text-ink-muted text-sm leading-relaxed">
          Everything here is rendered live on the GPU, so the page needs WebGPU. Chrome 113+,
          Edge 113+, or Safari 26 on a machine with a supported GPU will run it.
        </p>
        <pre className="mt-6 overflow-x-auto border border-line bg-void p-3 font-mono text-readout text-signal">
          {reason}
        </pre>
      </div>
    </div>
  )
}
