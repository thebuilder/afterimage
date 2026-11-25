/**
 * The deck's sound, made here rather than loaded: a loop of surface noise one
 * revolution long, played at the record's speed, so it slows, stops, runs
 * backwards in pitch and spins up exactly as the platter does; a band of
 * noise that whistles up and down with a hand dragging the record; and a
 * click for each key. Silent until the volume is turned up. Every frame keeps
 * the output alive for a moment longer, so if frames stop (the tab hides, the
 * feed moves on) the sound fades out by itself.
 */

const REV = 1.8 // seconds per revolution at 33 1/3

export interface DeckSound {
  /** speed: the record's speed over 33 1/3; drag: how hard a hand is working it, 0..1. */
  update(volume: number, speed: number, drag: number): void
  click(): void
  /** Called on a press, which is when a browser lets sound start. */
  wake(): void
  dispose(): void
}

function surface(ctx: AudioContext): AudioBuffer {
  const n = Math.round(ctx.sampleRate * REV)
  const buf = ctx.createBuffer(2, n, ctx.sampleRate)
  let seed = 7
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const L = buf.getChannelData(0)
  const R = buf.getChannelData(1)
  // Hiss: soft, dark noise.
  let lo = 0
  let lo2 = 0
  for (let i = 0; i < n; i++) {
    lo += (rnd() * 2 - 1 - lo) * 0.25
    lo2 += (rnd() * 2 - 1 - lo2) * 0.25
    L[i] = lo * 0.05
    R[i] = lo2 * 0.05
  }
  // Pops and ticks: mostly small, a few loud, each a short ringing decay.
  const pops = 46
  for (let k = 0; k < pops; k++) {
    const at = Math.floor(rnd() * n)
    const big = rnd() < 0.12
    const amp = (big ? 0.5 + rnd() * 0.4 : 0.06 + rnd() * 0.16) * (rnd() < 0.5 ? -1 : 1)
    const len = Math.floor(ctx.sampleRate * (big ? 0.004 : 0.0015))
    const pan = rnd()
    for (let j = 0; j < len; j++) {
      const i = (at + j) % n
      const v = amp * Math.exp((-j / len) * 5) * (j % 2 ? -0.6 : 1)
      L[i] += v * (1 - pan * 0.5)
      R[i] += v * (0.5 + pan * 0.5)
    }
  }
  // One deeper scratch across the record: a thud once a turn.
  const at = Math.floor(n * 0.37)
  for (let j = 0; j < 900; j++) {
    const v = 0.35 * Math.exp(-j / 160) * Math.sin(j * 0.09)
    L[(at + j) % n] += v
    R[(at + j) % n] += v
  }
  return buf
}

function noise(ctx: AudioContext, seconds: number): AudioBuffer {
  const n = Math.round(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(1, n, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  return buf
}

export function createDeckSound(): DeckSound {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let surf: AudioBufferSourceNode | null = null
  let surfGain: GainNode | null = null
  let scratchGain: GainNode | null = null
  let band: BiquadFilterNode | null = null
  let clickBuf: AudioBuffer | null = null
  let dead = false
  // Some browsers (Safari) only let sound start inside an input event, so the
  // context is made, silent, on the page's first press or key, and every later
  // one nudges it awake.
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

    surf = ctx.createBufferSource()
    surf.buffer = surface(ctx)
    surf.loop = true
    const tone = ctx.createBiquadFilter()
    tone.type = "lowpass"
    tone.frequency.value = 7000
    surfGain = ctx.createGain()
    surfGain.gain.value = 0
    surf.connect(tone).connect(surfGain).connect(master)
    surf.start()

    const hiss = ctx.createBufferSource()
    hiss.buffer = noise(ctx, 2)
    hiss.loop = true
    band = ctx.createBiquadFilter()
    band.type = "bandpass"
    band.Q.value = 3
    band.frequency.value = 400
    scratchGain = ctx.createGain()
    scratchGain.gain.value = 0
    hiss.connect(band).connect(scratchGain).connect(master)
    hiss.start()

    clickBuf = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.03), ctx.sampleRate)
    const c = clickBuf.getChannelData(0)
    for (let i = 0; i < c.length; i++) {
      const t = i / ctx.sampleRate
      c[i] = (Math.sin(t * 2 * Math.PI * 2400) * 0.5 + (Math.random() * 2 - 1) * 0.5) * Math.exp(-t * 400) * 0.6
    }
    return true
  }

  return {
    wake: nudge,
    update(volume, speed, drag) {
      if (volume <= 0.001) {
        if (ctx && master) {
          const now = ctx.currentTime
          master.gain.cancelScheduledValues(now)
          master.gain.setTargetAtTime(0, now, 0.03)
        }
        return
      }
      if (!start() || !ctx || !master || !surf || !surfGain || !band || !scratchGain) return
      if (ctx.state === "suspended") void ctx.resume()
      const now = ctx.currentTime
      const s = Math.abs(speed)
      // The loop runs at the record's speed; quieter as it slows, as a real one is.
      surf.playbackRate.setTargetAtTime(Math.max(s, 0.001), now, 0.02)
      band.frequency.setTargetAtTime(180 + 1400 * Math.min(s, 4), now, 0.015)
      scratchGain.gain.setTargetAtTime(drag * Math.min(s, 3) * 0.25, now, 0.02)
      surfGain.gain.setTargetAtTime(Math.min(1, s * 1.5), now, 0.02)
      const level = volume * volume
      // Keep sounding for a moment past this frame, then fade on our own.
      master.gain.cancelScheduledValues(now)
      master.gain.setTargetAtTime(level, now, 0.03)
      master.gain.setTargetAtTime(0, now + 0.25, 0.08)
    },
    click() {
      if (!ctx || !master || !clickBuf) return
      const src = ctx.createBufferSource()
      src.buffer = clickBuf
      const g = ctx.createGain()
      g.gain.value = 1.5
      src.connect(g).connect(master)
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
