import { effect } from "vgpu"
import type { Frame, Target } from "vgpu"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

/**
 * One pass. The focus puller lives here: focus is a distance in diopters
 * that follows a critically damped spring toward a target. Pointing at
 * something sets the target to that thing's depth, worked out from the same
 * layout the shader draws; left alone, the lens racks between the string
 * lights, the city, the street and the far string on a slow cycle.
 */
type V2 = [number, number]
type V4 = [number, number, number, number]

/** Depths in diopters, as in the shader. */
const D_CITY = 0.07
const D_STREET = 0.25
const D_PARAPET = 1.3
const D_NEAR = 1 / 1.1
const D_FAR_STRING = 1 / 1.7
const PARAPET_Y = 0.26
const SKY_BASE = 0.37
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
  if (hand[1] < SKY_BASE) return D_STREET
  return D_CITY
}

const CYCLE = [D_CITY, D_STREET, D_FAR_STRING, D_NEAR]

export function createFocus(setup: EffectSetup, wgsl: Wgsl): EffectInstance {
  const { gpu, target } = setup
  const zero: V4[] = [
    [0, 0, 1, 0],
    [0, 0, 1, 0],
  ]
  const fx = effect(gpu, wgsl, {
    set: {
      params: { res: target.size, aspect: 1, time: 0, focus: D_NEAR, aperture: APERTURE, exposure: 1, breath: 1, ends: zero, str: zero },
    },
  })

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

      const { ends, str } = strings(aspect)
      fx.set({
        params: {
          res: tgt.size,
          aspect,
          time: t,
          focus,
          aperture: APERTURE * (inputs.controls.aperture ?? 1),
          exposure: inputs.controls.exposure ?? 1,
          breath: 1 + 0.014 * (focus - 0.5),
          ends,
          str,
        },
      })
      frame.pass(tgt, fx)
    },
    resize(width, height) {
      fx.set({ params: { res: [width, height] } })
    },
  }
}
