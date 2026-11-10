import { effect, pingPong, sampler } from "vgpu"
import type { Frame, Target } from "vgpu"
import { release } from "../release.ts"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

export interface HarmonographSources {
  readonly draw: Wgsl
  readonly present: Wgsl
}

/** The sheet keeps ink at screen resolution, up to this long edge. */
const MAX_EDGE = 2400
/** Pendulum time per second at Speed 1. */
const RATE = 1.7
/** The pen is lifted once its swing has died to this fraction. */
const END = 0.12
/** How hard a moving pointer pushes the pendulums. */
const PUSH = 12
/** No single pendulum may swing wider than this, so the pen stays on the paper. */
const MAX_AMP = 0.7
/** Seconds the finished sheet takes to clear before the next one starts. */
const CLEAR = 1.6

type V4 = [number, number, number, number]

/**
 * Base frequencies (x1, x2, y1, y2) for each sheet, in turn. Each axis is two
 * pendulums at nearly the same rate, so their sum beats slowly; x against y
 * in a simple ratio makes the figure.
 */
const SHEETS: readonly V4[] = [
  [2, 2, 3, 3],
  [3, 3, 2, 2],
  [1, 1, 2, 2],
  [3, 3, 4, 4],
  [2, 2, 2, 2],
]

interface Swing {
  freq: V4
  phase: V4
  amp: V4
  shape: V4
  centre: V4
}

function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

function penAt(s: Swing, tau: number): [number, number] {
  const t = tau - s.shape[3]
  const e = Math.exp(-s.shape[0] * t)
  const w = s.freq.map((f, i) => Math.sin(f * t + s.phase[i]) * s.amp[i])
  const qx = (w[0] + w[1]) * e
  const qy = (w[2] + w[3]) * e
  const a = s.centre[2] + s.shape[1] * t
  return [
    s.centre[0] + (Math.cos(a) * qx - Math.sin(a) * qy) * s.shape[2],
    s.centre[1] + (Math.sin(a) * qx + Math.cos(a) * qy) * s.shape[2],
  ]
}

/**
 * Give one pendulum a push: its velocity changes by dv, its position stays
 * put, and its amplitude and phase follow from the two.
 */
function push(amp: number, theta: number, freq: number, dv: number): [number, number] {
  const p = amp * Math.sin(theta)
  const u = amp * freq * Math.cos(theta) + dv
  const a = Math.hypot(p, u / freq)
  if (a <= MAX_AMP) return [a, Math.atan2(p, u / freq)]
  // Too wide: keep where it is and which way it moves, but cap the swing.
  const k = Math.max(0, (MAX_AMP * MAX_AMP - p * p) / Math.max((u / freq) ** 2, 1e-9))
  const u2 = Math.abs(p) >= MAX_AMP ? 0 : Math.sqrt(k) * u
  return [Math.max(Math.abs(p), Math.hypot(p, u2 / freq)), Math.atan2(p, u2 / freq)]
}

export function createHarmonograph(setup: EffectSetup, src: HarmonographSources): EffectInstance {
  const { gpu, target, quality } = setup

  const dims = (w: number, h: number): [number, number] => {
    const scale = Math.min(1, quality, MAX_EDGE / Math.max(w, h, 1))
    return [Math.max(8, Math.round(w * scale)), Math.max(8, Math.round(h * scale))]
  }
  const [w0, h0] = dims(target.size[0], target.size[1])
  const state = pingPong(gpu, w0, h0, { format: "rgba16float" })
  const linear = sampler(gpu, {
    minFilter: "linear",
    magFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  })
  const draw = effect(gpu, src.draw)
  const present = effect(gpu, src.present, { set: { samp: linear } })

  let sheet = 0
  let tau = 0
  let clearing = 0
  // Each pendulum's phase and amplitude, carried forward frame by frame, so a
  // push changes how it swings from here on, never where the pen is now.
  let theta: V4 | null = null
  let amp: V4 = [0.55, 0.45, 0.55, 0.45]
  let angle = 0
  let lastMouse: [number, number] | null = null
  let lastGesture = 0
  let lastDims: readonly [number, number] = [w0, h0]

  return {
    render(frame: Frame, tgt: Target, inputs: FrameInputs) {
      const dt = Math.min(inputs.dt, 1 / 20)
      const aspect = tgt.size[0] / Math.max(tgt.size[1], 1)
      const damp = 0.04 * (inputs.controls.damping ?? 1)
      const rate = RATE * (inputs.controls.speed ?? 1)

      // Where the drawing sits: right of centre on a wide screen, clear of the
      // title; centred and a little high on a narrow one.
      const wide = Math.min(1, Math.max(0, (aspect - 0.9) / 0.4))
      const radius = Math.min(0.37, aspect * 0.44)
      const centre: V4 = [wide * Math.min(0.2 * aspect, 0.5 * aspect - radius - 0.06), 0.08 * (1 - wide), 0, 0]

      // Each sheet has its own ratios, phases and a slight detune between the
      // two pendulums on each axis, so their sum beats slowly.
      const base = SHEETS[sheet % SHEETS.length]
      const detune = [(hash(sheet * 3.1) - 0.5) * 0.05, (hash(sheet * 7.7) - 0.5) * 0.05]
      const freq: V4 = [3 * base[0], 3 * (base[1] + detune[0]), 3 * base[2], 3 * (base[3] + detune[1])]
      if (!theta) {
        // The two pendulums on an axis start nearly together, so they add up
        // rather than cancel; x and y start apart, so the figure opens out.
        const px = hash(sheet + 0.1) * 6.283
        const py = px + 0.8 + hash(sheet + 0.3) * 1.6
        theta = [px, px + (hash(sheet + 0.2) - 0.5) * 1.2, py, py + (hash(sheet + 0.4) - 0.5) * 1.2]
        amp = [0.55, 0.45, 0.55, 0.45]
        angle = 0
      }

      // The pointer pushes. Its movement across the paper, turned into the
      // table's frame and the pendulums' units, is added to their velocity,
      // so a sweep of the hand flings the pen wide in that direction.
      const gesture = inputs.gesture ?? 0
      const live = inputs.pointer > 0.05 && gesture === lastGesture
      if (live && lastMouse && clearing <= 0) {
        const mx = (inputs.mouse[0] - lastMouse[0]) * aspect
        const my = -(inputs.mouse[1] - lastMouse[1])
        if (Math.hypot(mx, my) < 0.25) {
          const c = Math.cos(-angle)
          const sn = Math.sin(-angle)
          const kick = (PUSH / radius) * Math.min(1, inputs.pointer)
          const dx = (c * mx - sn * my) * kick
          const dy = (sn * mx + c * my) * kick
          ;[amp[0], theta[0]] = push(amp[0], theta[0], freq[0], dx * 0.55)
          ;[amp[1], theta[1]] = push(amp[1], theta[1], freq[1], dx * 0.45)
          ;[amp[2], theta[2]] = push(amp[2], theta[2], freq[2], dy * 0.55)
          ;[amp[3], theta[3]] = push(amp[3], theta[3], freq[3], dy * 0.45)
        }
      }
      lastMouse = inputs.pointer > 0.05 ? [inputs.mouse[0], inputs.mouse[1]] : null
      lastGesture = gesture

      const swing: Swing = {
        freq,
        phase: theta,
        amp,
        shape: [damp, 0.012, radius, tau],
        centre: [centre[0], centre[1], angle, 0],
      }

      // Advance the pen; lift it once the swing has died away, clear the
      // sheet, and start the next.
      const tau0 = tau
      let down = 1
      let fade = 1
      if (clearing > 0) {
        clearing -= dt
        down = 0
        fade = Math.exp(-dt * 4.5)
        if (clearing <= 0) {
          sheet++
          tau = 0
          theta = null
        }
      } else {
        tau += dt * rate
        if (Math.max(amp[0] + amp[1], amp[2] + amp[3]) < END) clearing = CLEAR
      }
      const tau1 = down === 0 ? tau0 : tau

      // The box the pen swept this frame, so the drawing pass can skip the rest.
      let box: V4 = [1e3, 1e3, -1e3, -1e3]
      for (let i = 0; i <= 24; i++) {
        const [x, y] = penAt(swing, tau0 + ((tau1 - tau0) * i) / 24)
        box = [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)]
      }

      draw.set({
        sheet: state.read.color,
        draw: {
          swing,
          box,
          res: tgt.size,
          tau0,
          tau1,
          weight: inputs.controls.weight ?? 1,
          fade,
          down: tau1 > tau0 ? down : 0,
          _p0: 0,
        },
      })
      frame.pass(state.write, draw)
      state.swap()

      // Carry each pendulum to the end of the frame.
      const step = tau1 - tau0
      if (theta && step > 0) {
        const th = theta
        theta = th.map((v, i) => v + freq[i] * step) as V4
        const e = Math.exp(-damp * step)
        amp = amp.map((v) => v * e) as V4
        angle += 0.012 * step
      }

      present.set({
        sheet: state.read.color,
        view: { swing, res: tgt.size, tau: tau1, lift: clearing > 0 ? 1 : 0 },
      })
      frame.pass(tgt, present)
    },
    resize(width, height) {
      const [w, h] = dims(width, height)
      if (w === lastDims[0] && h === lastDims[1]) return
      lastDims = [w, h]
      state.read.resize([w, h])
      state.write.resize([w, h])
    },
    dispose() {
      release(state.read, state.write)
    },
  }
}
