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
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Connector } from "@/components/connector"
import { Eyebrow } from "@/components/eyebrow"
import { Led, Status } from "@/components/led"
import { Scanlines } from "@/components/scanlines"
import { ShaderView } from "@/components/shader-view"
import { EFFECTS } from "@/effects"
import type { HeroEffect } from "@/effects/types"
import { acquireGpu, type GpuStatus } from "@/lib/gpu"
import { cn } from "@/lib/utils"

const REPO = "https://github.com/thebuilder/afterimage"
const BASE_TITLE = "Afterimage | Live visual experiments"

/**
 * The route: which effect, and whether its explanation is open.
 *
 * Both live in the path so an explanation can be linked to directly, the same
 * way an effect can. `/ink` is Ink; `/ink/how-it-works` is Ink with the panel
 * open. Everything the page shows derives from this one value.
 */
interface Route {
  readonly id: string | null
  readonly how: boolean
}

const segments = () => window.location.pathname.split("/").filter(Boolean)

function routeFromLocation(): Route {
  const [slug, sub] = segments()
  const id = EFFECTS.some((e) => e.id === slug) ? slug : null
  return { id, how: id !== null && sub === "how-it-works" }
}

const pathFor = (r: Route) => (r.id === null ? "/" : r.how ? `/${r.id}/how-it-works` : `/${r.id}`)

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
  // Control values are kept per effect, so switching away and back does not
  // reset the knobs, and every effect starts from its own declared defaults.
  const [tweaks, setTweaks] = useState<Record<string, Record<string, number>>>({})
  const [running, setRunning] = useState(true)
  const [galleryLive, setGalleryLive] = useState(true)
  const [heroFps, setHeroFps] = useState(0)
  const [chromeVisible, setChromeVisible] = useState(true)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [diagnostics, setDiagnostics] = useState(false)

  useEffect(() => {
    acquireGpu().then(setStatus)
  }, [])

  // Reduced motion: let every canvas render for a couple of seconds so the page
  // is not a wall of black rectangles, then freeze. A WebGPU canvas keeps its
  // last presented frame, so stopping the loop leaves a still image behind.
  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const id = window.setTimeout(() => {
      setRunning(false)
      setGalleryLive(false)
    }, 2600)
    return () => window.clearTimeout(id)
  }, [])

  const active = useMemo(() => EFFECTS.find((e) => e.id === route.id) ?? EFFECTS[0], [route.id])

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
    setRoute({ id: effect.id, how: false })
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [])

  const setHow = useCallback(
    (how: boolean) => setRoute((r) => ({ id: r.id ?? EFFECTS[0].id, how })),
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

  const modalOpen = aboutOpen || route.how

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      // A dialog owns the keyboard while it is open: without this, typing a
      // digit behind the scrim would swap the effect out from under it.
      if (modalOpen) return
      if (ev.key === "?") setAboutOpen(true)
      if (ev.key === "Escape") setChromeVisible(true)
      if (ev.key.toLowerCase() === "h") setChromeVisible((v) => !v)
      if (ev.key.toLowerCase() === "d") setDiagnostics((v) => !v)
      if (ev.key === " " && ev.target === document.body) {
        ev.preventDefault()
        setRunning((r) => !r)
      }
      const n = Number(ev.key)
      if (!Number.isNaN(n) && n >= 1 && n <= 9) select(EFFECTS[n - 1])
      if (ev.key === "0") select(EFFECTS[9])
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [modalOpen, select])

  if (status.state === "unsupported") {
    return <Unsupported reason={status.reason} />
  }

  return (
    <div className="min-h-dvh bg-void text-foreground">
      <Scanlines density="soft" fixed />

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative isolate h-dvh w-full overflow-hidden">
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
            needs a ground of its own, and a text-shadow will not carry it. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 hero-scrim-bottom"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 hero-scrim-left"
        />

        <div
          className={cn(
            "pointer-events-none absolute inset-0 flex flex-col justify-between transition-opacity duration-300",
            chromeVisible ? "opacity-100" : "opacity-0"
          )}
        >
          <div className="pointer-events-auto flex items-center justify-between gap-4 border-line border-b bg-gradient-to-b from-void/85 to-transparent px-5 py-3 backdrop-blur-bar sm:px-8">
            <div className="flex items-center gap-3">
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
                Live visual experiments
              </span>
            </div>
            <div className="flex items-center gap-4 sm:gap-5">
              <button
                className="font-mono text-readout text-muted-foreground uppercase tracking-readout transition-colors hover:text-phosphor"
                onClick={() => setAboutOpen(true)}
                type="button"
              >
                About
              </button>
              <a
                className="font-mono text-readout text-muted-foreground uppercase tracking-readout transition-colors hover:text-phosphor"
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
              <Status tone={status.state === "ready" ? "ok" : "busy"}>
                {status.state === "ready" ? "Live" : "Starting"}
              </Status>
            </div>
          </div>

          <div className="grid gap-8 px-5 pb-8 sm:px-8 sm:pb-12 lg:grid-cols-[minmax(0,34rem)_1fr] lg:items-end">
            <div>
              <Eyebrow caret>
                {String(EFFECTS.indexOf(active) + 1).padStart(2, "0")} / {EFFECTS.length} ·{" "}
                {active.category}
              </Eyebrow>
              <h1 className="mt-4 font-semibold text-hero text-phosphor-bright leading-hero tracking-hero [text-shadow:0_0_40px_rgb(0_0_0/0.85)]">
                {active.name}
              </h1>
              <p className="mt-4 max-w-lg text-balance text-ink text-sm leading-relaxed [text-shadow:0_1px_12px_rgb(0_0_0/0.9)] sm:text-base">
                {active.tagline}
              </p>
              <div className="pointer-events-auto mt-6 flex flex-wrap items-center gap-2.5">
                <Button onClick={() => setRunning((r) => !r)} size="lg">
                  {running ? "Pause" : "Resume"}
                </Button>
                <Button onClick={() => setChromeVisible(false)} size="lg" variant="outline">
                  Hide UI
                </Button>
                <Button onClick={() => setHow(true)} size="lg" variant="outline">
                  How it works
                </Button>
              </div>
            </div>

            <div className="pointer-events-auto grid gap-3 border border-line bg-void/78 p-4 backdrop-blur-panel lg:w-panel lg:justify-self-end">
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
      </section>

      {/* ── COLLECTION ────────────────────────────────────────────────────── */}
      <section className="relative border-line border-t bg-void" id="collection">
        <div className="mx-auto max-w-page px-5 py-14 sm:px-8">
          <header className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <Eyebrow>The collection</Eyebrow>
              <h2 className="mt-3 font-semibold text-2xl text-phosphor-bright tracking-heading sm:text-3xl">
                {EFFECTS.length} live visual experiments
              </h2>
              <Connector className="mt-4" />
              <p className="mt-4 max-w-2xl text-ink-muted text-sm leading-relaxed">
                Every preview is rendered live. Choose one to bring it full screen, then adjust
                the controls or hide the interface and let it unfold.
              </p>
            </div>
            <label className="flex items-center gap-3 border border-line bg-panel px-3 py-2">
              <Switch checked={galleryLive} onCheckedChange={setGalleryLive} />
              <span className="font-mono text-readout text-muted-foreground uppercase tracking-readout">
                Animate previews
              </span>
              <Led tone={galleryLive ? "ok" : "idle"} />
            </label>
          </header>

          <div className="mt-10 grid gap-px sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {EFFECTS.map((effect, index) => (
              <EffectCard
                effect={effect}
                index={index}
                key={effect.id}
                live={galleryLive}
                onSelect={select}
                selected={effect.id === active.id}
              />
            ))}
          </div>
        </div>
      </section>

      <footer className="border-line border-t bg-void">
        <div className="mx-auto max-w-page px-5 py-8 font-mono text-readout text-muted-foreground sm:px-8">
          Afterimage is by <FootLink href="https://thebuilder.dk">thebuilder</FootLink>. Built with{" "}
          <FootLink href="https://vgpu.sh">vgpu</FootLink>, styled with{" "}
          <FootLink href="https://afterglow.thebuilder.dk">Afterglow</FootLink>, and{" "}
          <FootLink href={REPO}>open source</FootLink>.
        </div>
      </footer>

      <HowItWorks effect={active} onOpenChange={setHow} open={route.how} />
      <About onOpenChange={setAboutOpen} open={aboutOpen} />
    </div>
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

function About({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
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
            A collection of live visual experiments rendered in your browser. Choose an effect,
            shape it with a few controls, or hide the interface and let it fill the screen.
          </p>
          <p className="mt-4 text-ink-muted text-sm leading-relaxed">
            The effects are built with WebGPU and vgpu. The source and the full technical notes
            are on GitHub.
          </p>

          <div className="mt-6 flex flex-wrap gap-2.5">
            <Button
              onClick={() => {
                onOpenChange(false)
                document.getElementById("collection")?.scrollIntoView({ behavior: "smooth" })
              }}
            >
              Explore the collection
            </Button>
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
                simulation. Everything in this gallery is generated live rather than played back
                as video.
              </p>
            </CollapsibleContent>
          </Collapsible>

          <Eyebrow className="mt-8">Keyboard</Eyebrow>
          <div className="mt-3 grid gap-2 font-mono text-readout text-muted-foreground uppercase tracking-readout">
            <Row label="Pause" value="Space" />
            <Row label="Hide interface" value="H" />
            <Row label="Diagnostics" value="D" />
            <Row label="Switch effect" value="1-0" />
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

function EffectCard({
  effect,
  index,
  live,
  onSelect,
  selected,
}: {
  effect: HeroEffect
  index: number
  live: boolean
  onSelect: (e: HeroEffect) => void
  selected: boolean
}) {
  return (
    // A real anchor, not a button: this navigates, so right-click, cmd-click
    // and "copy link address" should all do what they look like they do. The
    // handler only takes over the plain left click.
    <a
      className={cn(
        // A grid row stretches every card to the tallest one, so the content is
        // pinned to the top and the slack falls to the bottom. Otherwise one
        // card with a longer tagline drags its neighbours down.
        "group relative isolate flex flex-col bg-void text-left outline-none ring-1 ring-line transition-colors",
        "focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-phosphor-bright"
      )}
      href={`/${effect.id}`}
      onClick={(ev) => {
        if (isModifiedClick(ev)) return
        ev.preventDefault()
        onSelect(effect)
      }}
    >
      <div className="relative aspect-tile w-full overflow-hidden">
        <ShaderView
          className="absolute inset-0 size-full transition-[filter] duration-300 group-hover:brightness-115"
          effect={effect}
          enabled={live}
          fps={24}
          maxDpr={1}
          quality={0.85}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-void via-void/10 to-transparent" />
        <span
          className="pointer-events-none absolute top-3 left-3 font-mono text-readout tabular-nums"
          style={{ color: effect.accent }}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        {/* Selection is drawn as an inset outline rather than a border, so the
            chosen tile stays exactly the same size as the others. */}
        <span
          className={cn(
            "pointer-events-none absolute inset-0 transition-colors",
            selected
              ? "outline-2 -outline-offset-2 outline-phosphor shadow-tile-selected"
              : "outline outline-transparent -outline-offset-1 group-hover:outline-line-strong"
          )}
        />
      </div>

      <div className="grid gap-2 p-4">
        <p className="font-mono text-tag text-phosphor-dim uppercase tracking-readout">
          {effect.category}
        </p>
        <h3 className="font-semibold text-phosphor-bright text-sm tracking-card">
          {effect.name}
        </h3>
        <p className="text-ink-muted text-xs leading-relaxed">{effect.tagline}</p>
      </div>
    </a>
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
