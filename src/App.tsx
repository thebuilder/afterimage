"use client"

import type * as React from "react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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


/** The parts of vgpu that these effects actually exercise. */
const CAPABILITIES = [
  {
    title: "Bindings by name",
    body: "vgpu reflects the WGSL at build time, so you set uniforms by the names in the shader itself. Struct members nest. A binding you forget to set throws on the first draw instead of rendering black.",
    api: "fx.set({ params: { time, mouse } })",
  },
  {
    title: "Fullscreen effects",
    body: "Most of these are a single fragment shader. effect() generates the vertex stage and hands the fragment a top-origin uv, so the shader file contains nothing but the image.",
    api: "effect(gpu, source).draw(target)",
  },
  {
    title: "Compute + instancing",
    body: "Flux Field advects 140k particles in a compute pass, then draws them from one instanced call that reads the storage buffer directly. No vertex buffer is ever allocated.",
    api: "compute(gpu, wgsl).dispatch(n / 64)",
  },
  {
    title: "Ping-pong buffers",
    body: "Storage halves for the particle sim, HDR render-target halves for the trail buffer and the Gray-Scott state. swap() moves the read/write pair, so no buffer is ever both source and destination in one dispatch.",
    api: "pingPong(gpu, w, h, { format })",
  },
  {
    title: "Multi-pass frames",
    body: "A frame batches every pass into one command buffer. Membrane encodes thirteen passes per frame; Flux Field encodes a fade and an additive draw into a single pass.",
    api: "frame(gpu, f => f.pass(target, fx))",
  },
  {
    title: "Verified headless",
    body: "Every shader ran through vgpu check and a headless Dawn render before it reached a browser. The render script reads the pixels back and prints their mean and max, which catches the two things a screenshot hides: a black frame, and one clipped to white.",
    api: "npx vgpu check src/shaders/aurora.wgsl",
  },
] as const

/** Drops trailing zeroes so a range column does not read as 24.00 to 3.00. */
const trim = (n: number) => String(Number(n.toFixed(4)))

const COST_VARIANT = {
  light: "default",
  medium: "amber",
  heavy: "signal",
} as const

export default function App() {
  const [status, setStatus] = useState<GpuStatus>({ state: "idle" })
  const [activeId, setActiveId] = useState(EFFECTS[0].id)
  // Control values are kept per effect, so switching away and back does not
  // reset the knobs, and every effect starts from its own declared defaults.
  const [tweaks, setTweaks] = useState<Record<string, Record<string, number>>>({})
  const [running, setRunning] = useState(true)
  const [galleryLive, setGalleryLive] = useState(true)
  const [heroFps, setHeroFps] = useState(0)
  const [chromeVisible, setChromeVisible] = useState(true)
  const [aboutOpen, setAboutOpen] = useState(false)

  useEffect(() => {
    acquireGpu().then(setStatus)
  }, [])

  // Reduced motion: let every canvas render for a couple of seconds so the page
  // is not a wall of black rectangles, then freeze. A WebGPU canvas keeps its last
  // presented frame, so stopping the loop leaves a still image behind.
  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const id = window.setTimeout(() => {
      setRunning(false)
      setGalleryLive(false)
    }, 2600)
    return () => window.clearTimeout(id)
  }, [])

  const active = useMemo(
    () => EFFECTS.find((e) => e.id === activeId) ?? EFFECTS[0],
    [activeId]
  )

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
    setActiveId(effect.id)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [])

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      // The dialog owns the keyboard while it is open: without this, typing a
      // digit behind the scrim would swap the hero out from under it, and Escape
      // would both close the dialog and restore the chrome.
      if (aboutOpen) return
      if (ev.key === "?") setAboutOpen(true)
      if (ev.key === "Escape") setChromeVisible(true)
      if (ev.key.toLowerCase() === "h") setChromeVisible((v) => !v)
      if (ev.key === " " && ev.target === document.body) {
        ev.preventDefault()
        setRunning((r) => !r)
      }
      const n = Number(ev.key)
      if (!Number.isNaN(n) && n >= 1 && n <= 9) setActiveId(EFFECTS[n - 1].id)
      if (ev.key === "0") setActiveId(EFFECTS[9].id)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [aboutOpen])

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
          effect={active}
          enabled={running}
          controls={controls}
          key="hero"
          maxDpr={2}
          onFps={setHeroFps}
          quality={1}
        />

        {/* Scrims. A hero has to survive having words on it, and several of these
            effects fill the frame with bright, high-frequency detail. The copy
            needs a ground of its own, and a text-shadow will not carry it. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgb(5_9_10/0.94)_0%,rgb(5_9_10/0.72)_22%,rgb(5_9_10/0.18)_48%,transparent_70%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgb(5_9_10/0.80),rgb(5_9_10/0.30)_38%,transparent_62%)]"
        />

        {/* The copy sits in a column on the left so the right two thirds of the
            frame stay clear. */}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 flex flex-col justify-between transition-opacity duration-300",
            chromeVisible ? "opacity-100" : "opacity-0"
          )}
        >
          <div className="pointer-events-auto flex items-center justify-between gap-4 border-line border-b bg-gradient-to-b from-void/85 to-transparent px-5 py-3 backdrop-blur-[2px] sm:px-8">
            <div className="flex items-center gap-3">
              {/* The mark: a lit square and the complementary ghost it burns in. */}
              <span className="relative block size-3.5" aria-hidden>
                <span className="absolute right-0 bottom-0 size-2.5 bg-signal" />
                <span className="absolute top-0 left-0 size-2.5 bg-phosphor shadow-glow" />
              </span>
              <span className="font-bold font-mono text-[0.6875rem] text-phosphor-bright uppercase tracking-[0.28em]">
                Afterimage
              </span>
              <Separator className="hidden h-4 sm:block" orientation="vertical" />
              <button
                className="font-mono text-[0.625rem] text-muted-foreground uppercase tracking-[0.14em] underline decoration-line decoration-dotted underline-offset-4 transition-colors hover:text-phosphor hover:decoration-phosphor"
                onClick={() => setAboutOpen(true)}
                type="button"
              >
                how it works
              </button>
            </div>
            <div className="flex items-center gap-3 sm:gap-5">
              <Status tone={status.state === "ready" ? "ok" : "busy"}>
                {status.state === "ready" ? status.adapter : "acquiring device"}
              </Status>
              <span className="hidden font-mono text-[0.625rem] text-phosphor tabular-nums sm:inline">
                {heroFps.toFixed(0).padStart(3, "0")} FPS
              </span>
            </div>
          </div>

          <div className="grid gap-8 px-5 pb-8 sm:px-8 sm:pb-12 lg:grid-cols-[minmax(0,34rem)_1fr] lg:items-end">
            <div>
              <Eyebrow caret>
                {String(EFFECTS.indexOf(active) + 1).padStart(2, "0")} / {EFFECTS.length} ·{" "}
                {active.techniques[0]}
              </Eyebrow>
              <h1 className="mt-4 font-semibold text-[clamp(2.5rem,7vw,5rem)] text-phosphor-bright leading-[0.95] tracking-[-0.03em] [text-shadow:0_0_40px_rgb(0_0_0/0.85)]">
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
              </div>
            </div>

            <div className="pointer-events-auto grid gap-4 border border-line bg-void/78 p-4 backdrop-blur-[3px] lg:w-[26rem] lg:justify-self-end">
              <div className="grid gap-1.5">
                {active.pipeline.map((stage, i) => (
                  <div className="flex items-start gap-2.5 font-mono text-[0.625rem]" key={stage}>
                    <span className="mt-[0.15rem] text-phosphor-dim tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-ink-muted">{stage}</span>
                  </div>
                ))}
              </div>
              <div className="grid gap-3 border-line border-t pt-3">
                {active.controls.map((c) => (
                  <div className="grid gap-1.5" key={c.key}>
                    <div className="flex items-center justify-between font-mono text-[0.625rem] text-muted-foreground uppercase tracking-[0.14em]">
                      <span>{c.label}</span>
                      <span className="text-phosphor tabular-nums">
                        {controls[c.key].toFixed(c.step < 0.01 ? 4 : 2)}
                      </span>
                    </div>
                    <Slider
                      max={c.max}
                      min={c.min}
                      onValueChange={(v) =>
                        setControl(active.id, c.key, Array.isArray(v) ? v[0] : v)
                      }
                      step={c.step}
                      value={controls[c.key]}
                    />
                  </div>
                ))}
                <button
                  className="justify-self-start font-mono text-[0.5625rem] text-phosphor-dim uppercase tracking-[0.14em] hover:text-phosphor"
                  onClick={() => resetControls(active.id)}
                  type="button"
                >
                  reset knobs
                </button>
              </div>
            </div>
          </div>
        </div>

        {!chromeVisible ? (
          <button
            className="pointer-events-auto absolute right-4 bottom-4 z-50 border border-line bg-void/70 px-2.5 py-1.5 font-mono text-[0.625rem] text-phosphor-dim uppercase tracking-[0.14em] hover:text-phosphor"
            onClick={() => setChromeVisible(true)}
            type="button"
          >
            show ui · H
          </button>
        ) : null}
      </section>

      {/* ── DETAIL ────────────────────────────────────────────────────────── */}
      <section className="border-line border-t bg-panel-raised">
        <div className="mx-auto grid max-w-[100rem] gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1fr_minmax(0,26rem)]">
          <div>
            <Eyebrow caret>Now showing · {active.id}</Eyebrow>
            <h2 className="mt-3 font-semibold text-3xl text-phosphor-bright tracking-[-0.02em]">
              {active.name}
            </h2>
            <p className="mt-5 max-w-3xl text-ink text-sm leading-[1.75]">{active.description}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {active.techniques.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
          <aside className="border-line border-t pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
            <Eyebrow>Frame graph</Eyebrow>
            <ol className="mt-4 grid gap-3">
              {active.pipeline.map((stage, i) => (
                <li className="flex gap-3 border-line border-b pb-3 last:border-b-0" key={stage}>
                  <span className="font-mono text-[0.625rem] text-signal tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-mono text-[0.6875rem] text-ink-muted leading-relaxed">
                    {stage}
                  </span>
                </li>
              ))}
            </ol>
            <Eyebrow className="mt-8">Controls</Eyebrow>
            <div className="mt-3 grid gap-2 font-mono text-[0.625rem] text-muted-foreground uppercase tracking-[0.14em]">
              {/* The range, not the WGSL key: for most controls the key is just the
                  label again, and for a multi-pass effect it is not a Params
                  member at all, so printing it would be wrong as well as noisy. */}
              {active.controls.map((c) => (
                <Row
                  key={c.key}
                  label={c.label}
                  value={`${trim(c.min)} to ${trim(c.max)}`}
                />
              ))}
            </div>
            <div className="mt-6 grid gap-2 font-mono text-[0.625rem] text-muted-foreground uppercase tracking-[0.14em]">
              <Row label="cost class" value={active.cost} />
              <Row label="hero fps" value={`${heroFps.toFixed(0)}`} />
              <Row label="device" value={status.state === "ready" ? status.adapter : "acquiring"} />
            </div>
          </aside>
        </div>
      </section>

      {/* ── CATALOGUE ─────────────────────────────────────────────────────── */}
      <section className="relative border-line border-t bg-void" id="catalogue">
        <div className="mx-auto max-w-[100rem] px-5 py-14 sm:px-8">
          <header className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <Eyebrow>The catalogue</Eyebrow>
              <h2 className="mt-3 font-semibold text-2xl text-phosphor-bright tracking-[-0.02em] sm:text-3xl">
                {EFFECTS.length} full-viewport heroes
              </h2>
              <Connector className="mt-4" />
              <p className="mt-4 max-w-2xl text-ink-muted text-sm leading-relaxed">
                Every tile below is live. Each one owns a WebGPU surface, all of them drawn by
                the same device at reduced resolution and a capped frame rate. Click a tile to
                promote it to the hero; number keys reach the first {Math.min(10, EFFECTS.length)}. Every effect brings its
                own knobs, wired straight to members of its WGSL uniform block.
              </p>
            </div>
            <label className="flex items-center gap-3 border border-line bg-panel px-3 py-2">
              <Switch checked={galleryLive} onCheckedChange={setGalleryLive} />
              <span className="font-mono text-[0.625rem] text-muted-foreground uppercase tracking-[0.14em]">
                Live tiles
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
        <div className="mx-auto max-w-[100rem] px-5 py-8 font-mono text-[0.625rem] text-muted-foreground sm:px-8">
          Afterimage is by <FootLink href="https://thebuilder.dk">thebuilder</FootLink>. Built with{" "}
          <FootLink href="https://vgpu.sh">vgpu</FootLink> and styled with{" "}
          <FootLink href="https://afterglow.thebuilder.dk">Afterglow</FootLink>.
        </div>
      </footer>

      {/* Reference material rather than part of the page's argument, so it opens
          on demand instead of sitting under the catalogue where nobody reaches it. */}
      <Dialog onOpenChange={setAboutOpen} open={aboutOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <Eyebrow>What vgpu is doing here</Eyebrow>
            <DialogTitle className="text-xl">
              One device, one frame loop, every pipeline
            </DialogTitle>
            <DialogDescription className="sr-only">
              How this page uses vgpu to run every effect on a single WebGPU device.
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-6 max-h-[62dvh] overflow-y-auto px-6">
            <div className="grid gap-px sm:grid-cols-2">
              {CAPABILITIES.map((c) => (
                <article className="bg-popover p-4 ring-1 ring-line" key={c.title}>
                  <h3 className="font-mono text-[0.6875rem] text-phosphor uppercase tracking-[0.14em]">
                    {c.title}
                  </h3>
                  <p className="mt-2.5 text-ink-muted text-xs leading-relaxed">{c.body}</p>
                  <code className="mt-3 block overflow-x-auto border border-line bg-panel-sunken px-2.5 py-1.5 font-mono text-[0.625rem] text-phosphor-dim">
                    {c.api}
                  </code>
                </article>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
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
    <button
      className={cn(
        // A grid row stretches every card to the tallest one, and a button
        // vertically centres its own content, so one card whose badges wrap to a
        // second line pushes its neighbours' thumbnails down. Flex column pins
        // the content to the top and lets the slack fall to the bottom.
        "group relative isolate flex flex-col bg-void text-left outline-none ring-1 ring-line transition-colors",
        "focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-phosphor-bright"
      )}
      onClick={() => onSelect(effect)}
      type="button"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden">
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
          className="pointer-events-none absolute top-3 left-3 font-mono text-[0.625rem] tabular-nums"
          style={{ color: effect.accent }}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        {/* Selection is drawn as an inset outline rather than a border, so the
            chosen tile stays exactly the same size as the other nine. */}
        <span
          className={cn(
            "pointer-events-none absolute inset-0 transition-colors",
            selected
              ? "outline-2 -outline-offset-2 outline-phosphor shadow-[inset_0_0_40px_rgb(134_250_221/0.18)]"
              : "outline outline-transparent -outline-offset-1 group-hover:outline-line-strong"
          )}
        />
      </div>

      <div className="grid gap-2 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-phosphor-bright text-sm tracking-[-0.01em]">
            {effect.name}
          </h3>
          <Badge variant={COST_VARIANT[effect.cost]}>{effect.cost}</Badge>
        </div>
        <p className="text-ink-muted text-xs leading-relaxed">{effect.tagline}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {effect.techniques.slice(0, 3).map((tag) => (
            <span
              className="border border-line px-1.5 py-0.5 font-mono text-[0.5625rem] text-phosphor-dim uppercase tracking-[0.1em]"
              key={tag}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </button>
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
          Every effect here compiles WGSL and renders through vgpu, so the page needs a WebGPU
          device. Chrome 113+, Edge 113+, or Safari 26 on a machine with a supported GPU will run
          it.
        </p>
        <pre className="mt-6 overflow-x-auto border border-line bg-void p-3 font-mono text-[0.625rem] text-signal">
          {reason}
        </pre>
      </div>
    </div>
  )
}
