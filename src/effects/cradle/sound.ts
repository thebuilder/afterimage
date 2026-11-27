/**
 * The cradle's sound, made here rather than loaded: the click of polished
 * steel balls knocking. A steel ball this size rings far above hearing
 * (its first mode is near 100 kHz), so what you hear is not a ring but the
 * knock itself: a Hertz contact a tenth of a millisecond long, radiated by
 * the balls' sudden change of speed as a sharp, bright tick, passed down
 * the row in a few closely spaced contacts, with a faint glassy shimmer from
 * the frame and one reflection off the table. Harder knocks are louder and
 * shorter, so brighter; soft ones are quieter and a little duller. Each hit
 * is synthesized fresh, so no two are alike. Silent until a press on the
 * scene or the sound toggle turned on. Every frame keeps the output alive
 * for a moment longer, so if frames stop (the tab hides, the feed moves on)
 * it fades out by itself.
 */

export interface CradleSound {
  update(volume: number): void
  /** v: how fast the balls met, in scene units a second; pan: -1..1. */
  clack(v: number, pan: number): void
  /** Called on a press, which is when a browser lets sound start. */
  wake(): void
  dispose(): void
}

/**
 * One knock, k in 0..1 for how hard. Returns samples normalised to a peak
 * of 1; loudness is applied by the caller.
 */
export function synthClack(sr: number, k: number, rnd: () => number): Float32Array<ArrayBuffer> {
  const n = Math.round(sr * 0.045)
  const out = new Float32Array(n)
  // Hertz contact: duration falls as v^-1/5, about 90 µs hard to 170 µs soft.
  const tc = 1.1e-4 * Math.pow(Math.max(0.02, k), -0.2) * (0.95 + rnd() * 0.1)
  // The blow runs down the row as a few contacts a few tens of µs apart,
  // each a little weaker; their spacing is what makes every knock its own.
  const hops = 3 + Math.floor(rnd() * 3)
  const exc = new Float32Array(n)
  let at = 0
  for (let h = 0; h < hops; h++) {
    const amp = Math.pow(0.72, h) * (0.85 + rnd() * 0.3)
    const t0 = at
    const len = tc * (0.9 + rnd() * 0.2)
    const i0 = Math.floor(t0 * sr)
    const i1 = Math.ceil((t0 + len) * sr) + 1
    for (let i = i0; i <= i1 && i < n; i++) {
      // Force is a half sine; sound pressure follows its rate of change.
      const x = (i / sr - t0) / len
      if (x < 0 || x > 1) continue
      exc[i] += amp * Math.cos(Math.PI * x)
    }
    at += 2.5e-5 + rnd() * 6e-5
  }
  // A small sphere radiates the low end poorly: high-pass near 1.2 kHz.
  const hp = Math.exp((-2 * Math.PI * 1200) / sr)
  let px = 0
  let py = 0
  for (let i = 0; i < n; i++) {
    const y = hp * (py + exc[i] - px)
    px = exc[i]
    py = y
    out[i] = y
  }
  // The shimmer: frame and fittings, high and short. Two-pole resonators
  // driven by the knock, so a sharper knock reaches the high ones harder.
  const modes: [number, number, number][] = [
    [3150, 0.007, 0.09],
    [4720, 0.005, 0.11],
    [6380, 0.0035, 0.1],
    [8110, 0.0025, 0.08],
    [10900, 0.0016, 0.06],
  ]
  for (const [f0, tau0, g] of modes) {
    const f = f0 * (0.985 + rnd() * 0.03)
    const tau = tau0 * (0.8 + rnd() * 0.4)
    const r = Math.exp(-1 / (tau * sr))
    const c = 2 * r * Math.cos((2 * Math.PI * f) / sr)
    let y1 = 0
    let y2 = 0
    for (let i = 0; i < n; i++) {
      const y = c * y1 - r * r * y2 + exc[i]
      y2 = y1
      y1 = y
      out[i] += g * y * (1 - r)
    }
  }
  // One bounce off the table, darker and later; then a little air.
  const d1 = Math.round(sr * (0.0011 + rnd() * 0.0006))
  const d2 = Math.round(sr * (0.0034 + rnd() * 0.0012))
  let lp = 0
  const dry = out.slice()
  for (let i = 0; i < n; i++) {
    lp += ((i >= d1 ? dry[i - d1] : 0) - lp) * 0.45
    out[i] += 0.32 * lp + (i >= d2 ? 0.12 * dry[i - d2] : 0)
  }
  // Fade the tail so the buffer never ends on a step.
  let peak = 1e-9
  for (let i = 0; i < n; i++) {
    const t = i / n
    out[i] *= t > 0.6 ? 0.5 + 0.5 * Math.cos(((t - 0.6) / 0.4) * Math.PI) : 1
    peak = Math.max(peak, Math.abs(out[i]))
  }
  for (let i = 0; i < n; i++) out[i] /= peak
  return out
}

export function createCradleSound(): CradleSound {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let dead = false
  let seed = 7919
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
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
      if (!ctx || !master) return
      const k = Math.min(1, v / 3)
      // Each knock made fresh (2k samples, well under a millisecond of work).
      const data = synthClack(ctx.sampleRate, k, rnd)
      const buf = ctx.createBuffer(1, data.length, ctx.sampleRate)
      buf.copyToChannel(data, 0)
      const src = ctx.createBufferSource()
      src.buffer = buf
      // Pressure grows a little faster than speed; soft taps stay audible.
      const g = ctx.createGain()
      g.gain.value = 0.9 * Math.pow(k, 1.1) + 0.02
      const p = ctx.createStereoPanner()
      p.pan.value = Math.max(-1, Math.min(1, pan * 0.6))
      src.connect(g).connect(p).connect(master)
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
