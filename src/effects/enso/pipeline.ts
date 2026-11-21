import { effect, pingPong, sampler } from "vgpu"
import type { Frame, Target } from "vgpu"
import { release } from "../release.ts"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

export interface EnsoSources {
  readonly ink: Wgsl
  readonly present: Wgsl
}

/**
 * Two passes: the ink on the sheet, then the picture. The brush is worked
 * out here. Pressing and dragging paints: the slower the hand, the harder
 * the brush presses and the wetter the line, and the ink runs out along the
 * stroke so it ends in dry, split bristles. Left alone, an unseen hand paints
 * an ensō, lets it sit, and lifts the sheet for a fresh one.
 */
type V2 = [number, number]

/** The ink grid's long edge; blooms are soft, bristle streaks need detail. */
const MAX_EDGE = 1100
/** Brush half width at full pressure, in screen heights. */
const BRUSH = 0.024

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function smooth(x: number): number {
  const c = Math.min(1, Math.max(0, x))
  return c * c * (3 - 2 * c)
}

/** Where the ensō sits and how large, for this screen. */
export function layout(aspect: number): { centre: V2; radius: number } {
  if (aspect >= 1) return { centre: [aspect * 0.63, 0.53], radius: 0.27 }
  return { centre: [aspect * 0.5, 0.64], radius: Math.min(0.27, aspect * 0.36) }
}

export function createEnso(setup: EffectSetup, src: EnsoSources): EffectInstance {
  const { gpu, target, quality } = setup

  const dims = (w: number, h: number): [number, number] => {
    const scale = Math.min(quality, MAX_EDGE / Math.max(w, h, 1))
    return [Math.max(8, Math.round(w * scale)), Math.max(8, Math.round(h * scale))]
  }
  const [w0, h0] = dims(target.size[0], target.size[1])
  const state = pingPong(gpu, w0, h0, { format: "rgba16float" })
  const nearest = sampler(gpu, { minFilter: "nearest", magFilter: "nearest", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" })
  const linear = sampler(gpu, { minFilter: "linear", magFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" })
  const sim = effect(gpu, src.ink, { set: { samp: nearest } })
  const present = effect(gpu, src.present, { set: { samp: linear } })

  let lastDims: readonly [number, number] = [w0, h0]
  let needInit = true

  // The brush.
  let prev: V2 | null = null
  let pressure = 0.8
  let load = 1
  let arc = 0
  let seed = 1
  let strokes = 0
  let wasDown = false
  let wasPressed = false
  let hint = 0

  // The unseen hand.
  let lastActive = -10
  /** Someone painted on this sheet, so it is left up longer before lifting. */
  let painted = false
  let autoStart = 0.35
  let autoSeed = 0
  let clearing = -1
  let sealShow = 0

  function startStroke() {
    strokes++
    seed = hash(strokes * 1.7) * 100
    load = 1
    arc = 0
  }

  function render(frame: Frame, tgt: Target, inputs: FrameInputs) {
    const aspect = tgt.size[0] / Math.max(tgt.size[1], 1)
    const dt = Math.min(Math.max(inputs.dt, 1 / 240), 1 / 20)
    const t = inputs.time
    const live = inputs.pointer > 0.05
    const pressed = inputs.pressed ?? false
    const hand: V2 = [inputs.mouse[0] * aspect, 1 - inputs.mouse[1]]
    const size = inputs.controls.brush ?? 1
    const { centre, radius } = layout(aspect)
    if (live || pressed) lastActive = t

    // Where the brush is this frame, and whether it touches the paper.
    let down = false
    let at: V2 = hand
    let press = pressure

    if (pressed) {
      painted = true
      autoStart = -1
      clearing = -1
      down = true
      if (!wasPressed) {
        // A fresh stroke, even if the unseen hand was mid-ensō.
        wasDown = false
        startStroke()
        prev = hand
        pressure = 1.1
      }
      const step = prev ? Math.hypot(hand[0] - prev[0], hand[1] - prev[1]) : 0
      const speed = step / dt
      // A slow hand presses harder; a quick one lifts the brush to its tip.
      const want = Math.min(1.25, Math.max(0.3, 1.2 - speed * 0.35))
      pressure += (want - pressure) * (1 - Math.exp(-dt * 7))
      press = pressure
    } else if (autoStart >= 0 && t >= autoStart) {
      // The ensō: one stroke round, heavy at the start, dry at the end.
      const DUR = 2.6
      const k = (t - autoStart) / DUR
      if (k <= 1) {
        if (!wasDown) startStroke()
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
        const start = -1.95 + (hash(autoSeed * 3.3) - 0.5) * 0.6
        const sweep = 5.55 + (hash(autoSeed * 5.1) - 0.5) * 0.4
        const ang = start + sweep * e
        const wob = 1 + 0.035 * Math.sin(ang * 2 + autoSeed) + 0.02 * Math.sin(ang * 5 + autoSeed * 2)
        at = [centre[0] + Math.cos(ang) * radius * wob, centre[1] + Math.sin(ang) * radius * wob]
        press = 1.25 - 0.2 * smooth(k / 0.15) - 0.35 * smooth((k - 0.55) / 0.45) + 0.1 * (1 - smooth(k / 0.05))
        down = true
      } else {
        autoStart = -1
        autoSeed++
        clearing = t + 9
      }
    }
    if (!down && autoStart < 0 && clearing < 0 && t - lastActive > (painted ? 18 : 7)) clearing = t + 2

    // Dry ink does not fade; the sheet is lifted instead. Any multiplier just
    // under 1 would be worse than useless: a half-float target can round each
    // write down by one step, and at 60 frames a second that greys a black
    // stroke within twenty seconds.
    let fade = 1
    // Lifting the sheet: the ink fades out quickly, then the hand paints again.
    if (clearing >= 0 && t >= clearing) {
      fade = Math.exp(-dt / 0.35)
      if (t >= clearing + 1.6) {
        clearing = -1
        autoStart = t + 0.4
        needInit = true
        painted = false
      }
    }

    // The stamp for this frame.
    const ds = prev && down && wasDown ? Math.hypot(at[0] - prev[0], at[1] - prev[1]) : 0
    const a: V2 = prev && down && wasDown ? prev : at
    if (down) {
      load = Math.max(0, load - ds * 0.42 - dt * 0.03)
    }
    // The tip touches first, then the brush settles to its full width.
    const width = BRUSH * size * (0.35 + 0.65 * press) * (0.55 + 0.45 * smooth(arc / 0.05))
    const wet = Math.min(1, 0.25 + 0.6 * press) * (0.4 + 0.6 * load)

    sim.set({
      state: state.read.color,
      sim: {
        seg: [a[0], a[1], at[0], at[1]],
        // A quick, light stroke leaves less ink and splits sooner.
        stroke: [width, load * (0.7 + 0.3 * Math.min(1, press)), arc, seed],
        aspect,
        texel: 1 / state.read.size[1],
        dt,
        fade,
        touching: down ? 1 : 0,
        wet,
        init: needInit ? 1 : 0,
      },
    })
    needInit = false
    frame.pass(state.write, sim)
    state.swap()
    if (down) arc += ds
    prev = down ? at : null
    wasDown = down
    wasPressed = pressed

    // The seal goes on once the first ensō is done, and leaves with the sheet.
    const sealWant = clearing >= 0 && t >= clearing ? 0 : autoSeed > 0 ? 1 : 0
    sealShow += (sealWant - sealShow) * (1 - Math.exp(-dt * (sealWant > sealShow ? 3 : 8)))
    hint += ((live && !pressed ? 1 : 0) - hint) * (1 - Math.exp(-dt * 6))

    present.set({
      state: state.read.color,
      view: {
        res: tgt.size,
        aspect,
        time: t,
        hint: [hand[0], hand[1], BRUSH * size, hint],
        seal: [centre[0] + radius * 1.12, centre[1] - radius * 0.95, 0.034, sealShow],
        ink: inputs.controls.ink ?? 1,
      },
    })
    frame.pass(tgt, present)
  }

  return {
    render,
    resize(width, height) {
      const [w, h] = dims(width, height)
      if (w === lastDims[0] && h === lastDims[1]) return
      // A phone's address bar showing or hiding changes the height a little.
      // Starting the sheet over for that wiped whatever was painted, so small
      // changes keep the grid and let it stretch a few percent instead.
      const near = (x: number, y: number) => Math.abs(x - y) / Math.max(y, 1) < 0.2
      if (near(w, lastDims[0]) && near(h, lastDims[1]) && !needInit) return
      lastDims = [w, h]
      state.read.resize([w, h])
      state.write.resize([w, h])
      needInit = true
      if (autoStart < 0 && clearing < 0) autoStart = 0
    },
    dispose() {
      release(state.read, state.write)
    },
  }
}
