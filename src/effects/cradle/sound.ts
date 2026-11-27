/**
 * The cradle's sound, made here rather than loaded: the clack of steel on
 * steel, a click of noise and a short metallic ring of a few inharmonic
 * partials, louder and brighter the harder the knock, panned to where the
 * balls meet. Silent until a press on the scene or the sound toggle turned
 * on. Every frame keeps the output alive for a moment longer, so if frames
 * stop (the tab hides, the feed moves on) it fades out by itself.
 */

export interface CradleSound {
  update(volume: number): void
  /** v: how fast the balls met, in scene units a second; pan: -1..1. */
  clack(v: number, pan: number): void
  /** Called on a press, which is when a browser lets sound start. */
  wake(): void
  dispose(): void
}

function clackBuffer(ctx: AudioContext, seed: number): AudioBuffer {
  const sr = ctx.sampleRate
  const n = Math.round(sr * 0.12)
  const buf = ctx.createBuffer(1, n, sr)
  const d = buf.getChannelData(0)
  let s = seed
  const rnd = () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
  // Partials of a struck steel ball: inharmonic, the high ones dying first.
  const parts = [
    [2650, 0.5, 0.022],
    [4180, 0.35, 0.016],
    [6020, 0.22, 0.01],
    [8930, 0.12, 0.006],
  ].map(([f, a, tau]) => [f * (0.97 + rnd() * 0.06), a, tau, rnd() * 6.28])
  let lp = 0
  for (let i = 0; i < n; i++) {
    const t = i / sr
    let v = 0
    for (const [f, a, tau, ph] of parts) v += a * Math.sin(t * 2 * Math.PI * f + ph) * Math.exp(-t / tau)
    // The knock itself: a millisecond of bright noise, and a dull thud under it.
    lp += (rnd() * 2 - 1 - lp) * 0.6
    v += lp * 0.9 * Math.exp(-t / 0.0012)
    v += 0.25 * Math.sin(t * 2 * Math.PI * 900) * Math.exp(-t / 0.004)
    d[i] = v * 0.5
  }
  return buf
}

export function createCradleSound(): CradleSound {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let bufs: AudioBuffer[] = []
  let dead = false
  let pick = 0
  const nudge = () => {
    if (!ctx) start()
    if (ctx && ctx.state === "suspended") void ctx.resume()
  }
  const EVENTS = ["pointerdown", "pointerup", "keydown"] as const
  if (typeof document !== "undefined") for (const ev of EVENTS) document.addEventListener(ev, nudge, true)

  function start(): boolean {
    if (ctx) return true
    if (dead || typeof AudioContext === "undefined") return false
    ctx = new AudioContext({ latencyHint: "interactive" })
    master = ctx.createGain()
    master.gain.value = 0
    master.connect(ctx.destination)
    // A few takes, so a run of knocks never sounds like one sample repeating.
    bufs = [11, 23, 37, 41].map((s) => clackBuffer(ctx!, s))
    return true
  }

  return {
    wake: nudge,
    update(volume) {
      if (volume <= 0.001) {
        if (ctx && master) {
          const now = ctx.currentTime
          master.gain.cancelScheduledValues(now)
          master.gain.setTargetAtTime(0, now, 0.03)
        }
        return
      }
      if (!start() || !ctx || !master) return
      if (ctx.state === "suspended") void ctx.resume()
      const now = ctx.currentTime
      master.gain.cancelScheduledValues(now)
      master.gain.setTargetAtTime(volume * volume, now, 0.03)
      master.gain.setTargetAtTime(0, now + 0.25, 0.08)
    },
    clack(v, pan) {
      if (!ctx || !master || bufs.length === 0) return
      const k = Math.min(1, v / 3)
      const src = ctx.createBufferSource()
      src.buffer = bufs[pick++ % bufs.length]
      // Harder knocks ring a touch higher and brighter.
      src.playbackRate.value = 0.94 + 0.1 * k + (Math.random() - 0.5) * 0.03
      const tone = ctx.createBiquadFilter()
      tone.type = "lowpass"
      tone.frequency.value = 2500 + 12000 * k
      const g = ctx.createGain()
      g.gain.value = 1.6 * Math.pow(k, 0.8)
      const p = ctx.createStereoPanner()
      p.pan.value = Math.max(-1, Math.min(1, pan * 0.6))
      src.connect(tone).connect(g).connect(p).connect(master)
      src.start()
    },
    dispose() {
      dead = true
      if (typeof document !== "undefined") for (const ev of EVENTS) document.removeEventListener(ev, nudge, true)
      void ctx?.close()
      ctx = null
    },
  }
}
