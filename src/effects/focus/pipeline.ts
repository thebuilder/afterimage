import { effect, sampler, target as offscreen } from "vgpu"
import type { Frame, Target } from "vgpu"
import { release } from "../release.ts"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

export interface FocusSources {
  readonly still: Wgsl
  readonly lens: Wgsl
}

/**
 * Two passes. The still street (facades, windows, lamps, road, skyline) is
 * drawn into a half-float texture only when the focus or the lens changes;
 * the picture pass adds what moves (traffic, signals, string lights) every
 * frame. The focus puller lives here: focus is a distance in diopters that
 * follows a critically damped spring toward a target. Pointing at something
 * sets the target to that thing's depth, worked out from the same street the
 * shaders draw; left alone, the lens racks between the far end of the avenue,
 * the near blocks, and the two strings of lights on a slow cycle.
 */
type V2 = [number, number]
type V4 = [number, number, number, number]

/** The street, as in scene.wgsl. */
const F = 1.25
const H0 = 0.56
const CAM_H = 14
const X_LEFT = -11
const X_RIGHT = 21
const PARAPET_Y = 0.17
/** Depths in diopters. */
const D_PARAPET = 1.3
const D_SKYLINE = 0.0009
const D_NEAR = 1 / 1.1
const D_FAR_STRING = 1 / 1.7
const MAX_EDGE = 2400
/** Disc radius per diopter of defocus, in screen heights. */
const APERTURE = 0.07

export function strings(aspect: number): { ends: V4[]; str: V4[] } {
  const a = aspect
  if (a >= 1) {
    return {
      ends: [
        [-0.05, 0.95, a + 0.05, 0.9],
        [a * 0.34, 1.06, a + 0.05, 0.56],
      ],
      str: [
        [0.15, D_NEAR, 0.075, 0],
        [0.07, D_FAR_STRING, 0.06, 2],
      ],
    }
  }
  return {
    ends: [
      [-0.05, 0.93, a + 0.05, 0.88],
      [a * 0.2, 1.05, a + 0.05, 0.7],
    ],
    str: [
      [0.08, D_NEAR, 0.07, 0],
      [0.05, D_FAR_STRING, 0.055, 2],
    ],
  }
}

function stringY(e: V4, sag: number, x: number): number {
  const s = (x - e[0]) / (e[2] - e[0])
  return e[1] + (e[3] - e[1]) * s - sag * 4 * s * (1 - s)
}

/** The depth of whatever is under the hand. */
function depthAt(hand: V2, aspect: number): number {
  const { ends, str } = strings(aspect)
  let best = -1
  let bestD = 0.05
  ends.forEach((e, i) => {
    if (hand[0] < e[0] || hand[0] > e[2]) return
    const d = Math.abs(hand[1] - stringY(e, str[i][0], hand[0]) + 0.009)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  if (best >= 0) return str[best][1]
  if (hand[1] < PARAPET_Y + 0.01) return D_PARAPET
  const q: V2 = [hand[0] - aspect * 0.5, hand[1] - H0]
  let t = q[1] < 0 ? -q[1] / (F * CAM_H) : D_SKYLINE
  for (const xf of [X_LEFT, X_RIGHT]) {
    const tf = q[0] / (F * xf)
    const y = CAM_H + q[1] / (F * tf)
    // Most buildings stand between 16 and 46 metres.
    if (tf > t && y > 0 && y < 30) t = tf
  }
  return t
}

/** Far end of the avenue, the near blocks, the far string, the near string. */
const CYCLE = [1 / 260, 1 / 38, D_FAR_STRING, D_NEAR]

export function createFocus(setup: EffectSetup, src: FocusSources): EffectInstance {
  const { gpu, target, quality } = setup
  const dims = (w: number, h: number): [number, number] => {
    const scale = Math.min(quality, MAX_EDGE / Math.max(w, h, 1))
    return [Math.max(8, Math.round(w * scale)), Math.max(8, Math.round(h * scale))]
  }
  let size = dims(target.size[0], target.size[1])
  const still = offscreen(gpu, { size, format: "rgba16float" })
  const linear = sampler(gpu, { minFilter: "linear", magFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" })
  const stillFx = effect(gpu, src.still)
  const fx = effect(gpu, src.lens, { set: { samp: linear } })
  let drawn = ""

  // Opens on the near bulbs, then racks to the city.
  let focus = D_NEAR
  let vel = 0
  let want = D_NEAR
  let nextRack = 1.6
  let step = 0

  return {
    render(frame: Frame, tgt: Target, inputs: FrameInputs) {
      const t = inputs.time
      const dt = Math.min(Math.max(inputs.dt, 1 / 240), 1 / 20)
      const aspect = tgt.size[0] / Math.max(tgt.size[1], 1)
      const live = inputs.pointer > 0.05
      const hand: V2 = [inputs.mouse[0] * aspect, 1 - inputs.mouse[1]]

      if (live || inputs.pressed) {
        want = depthAt(hand, aspect)
        nextRack = t + 2.5
      } else if (t >= nextRack) {
        want = CYCLE[step % CYCLE.length]
        step++
        nextRack = t + 3.4
      }

      // A focus puller's hand: quick to start, settling without overshoot.
      const k = 34
      vel += ((want - focus) * k - vel * 2 * Math.sqrt(k)) * dt
      focus += vel * dt

      if (Math.abs(want - focus) < 2e-5 && Math.abs(vel) < 2e-4) {
        focus = want
        vel = 0
      }

      const aperture = APERTURE * (inputs.controls.aperture ?? 1)
      const breath = 1 + 0.014 * (focus - 0.5)
      // The still street is drawn again only when what it shows has changed.
      const key = `${focus.toFixed(5)} ${aperture} ${size[0]}x${size[1]}`
      if (key !== drawn) {
        drawn = key
        stillFx.set({ params: { res: size, aspect: size[0] / size[1], time: t, focus, aperture, breath, _p0: 0 } })
        frame.pass(still, stillFx)
      }

      const { ends, str } = strings(aspect)
      fx.set({
        still: still.color,
        params: {
          res: tgt.size,
          aspect,
          time: t,
          focus,
          aperture,
          exposure: inputs.controls.exposure ?? 1,
          breath,
          ends,
          str,
        },
      })
      frame.pass(tgt, fx)
    },
    resize(width, height) {
      const next = dims(width, height)
      if (next[0] === size[0] && next[1] === size[1]) return
      size = next
      still.resize(size)
    },
    dispose() {
      release(still)
    },
  }
}
