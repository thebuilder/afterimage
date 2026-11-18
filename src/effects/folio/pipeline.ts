import { effect } from "vgpu"
import type { Frame, Target } from "vgpu"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

/**
 * One pass. The page's motion lives here: which corner is lifted, where it
 * has been pulled to, and when a page turns. The pointer grabs the nearest
 * corner and the corner follows it on a spring. Let go past the middle and
 * the page turns over; let go short of it and it falls back. Left alone, the
 * corner breathes, and every few seconds the stack turns a page by itself.
 */
type V2 = [number, number]

const IDLE_TURN = 7
const TURN_TIME = 2.0

function corners(a: number): V2[] {
  return [
    [a, 0],
    [a, 1],
    [0, 0],
    [0, 1],
  ]
}

function ease(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

export function createFolio(setup: EffectSetup, wgsl: Wgsl): EffectInstance {
  const { gpu, target } = setup
  const fx = effect(gpu, wgsl, {
    set: {
      params: { res: target.size, corner: [1, 0], pull: [1, 0], time: 0, radius: 0.05, sheet: 0, aspect: 1, foil: 1, _p0: 0 },
    },
  })

  let sheet = 0
  let corner: V2 | null = null
  let pull: V2 | null = null
  let vel: V2 = [0, 0]
  let mode: "rest" | "hold" | "turn" | "auto" = "rest"
  let autoStart = 0
  let autoFrom: V2 = [0, 0]
  let lastActive = -10
  let lastGesture = 0
  // Start with a page already turning, so the first seconds move.
  let nextAuto = 0.6

  function far(c: V2, a: number): V2 {
    return [c[0] > a / 2 ? -a * 1.05 : a * 2.05, c[1]]
  }

  return {
    render(frame: Frame, tgt: Target, inputs: FrameInputs) {
      const t = inputs.time
      const dt = Math.min(Math.max(inputs.dt, 1 / 240), 1 / 20)
      const a = tgt.size[0] / Math.max(tgt.size[1], 1)
      const live = inputs.pointer > 0.05
      const hand: V2 = [inputs.mouse[0] * a, 1 - inputs.mouse[1]]
      const gesture = inputs.gesture ?? 0
      if (!corner || !pull) {
        corner = [a, 0]
        pull = [a, 0]
      }

      if (live) {
        lastActive = t
        if (mode !== "hold" || gesture !== lastGesture) {
          if (mode === "turn" || mode === "auto") {
            // A turn in progress finishes before the hand can take the next page.
          } else {
            // Grab the corner nearest the hand.
            let best = corners(a)[0]
            for (const c of corners(a)) if (Math.hypot(c[0] - hand[0], c[1] - hand[1]) < Math.hypot(best[0] - hand[0], best[1] - hand[1])) best = c
            if (best[0] !== corner[0] || best[1] !== corner[1]) {
              corner = best
              pull = [best[0], best[1]]
              vel = [0, 0]
            }
            mode = "hold"
          }
        }
      } else if (mode === "hold") {
        // Let go: past the middle the page turns, short of it it falls back.
        const across = Math.abs(pull[0] - corner[0])
        mode = across > a * 0.5 ? "turn" : "rest"
      }
      lastGesture = gesture

      if (mode === "rest" && t - lastActive > IDLE_TURN && t > nextAuto) nextAuto = t
      if (mode === "rest" && t >= nextAuto && !live) {
        mode = "auto"
        corner = [a, 0]
        autoStart = t
        autoFrom = [pull[0], pull[1]]
      }

      // Where the corner wants to be.
      let goal: V2
      let w = 14
      if (mode === "hold") {
        goal = hand
        w = 16
      } else if (mode === "turn") {
        goal = far(corner, a)
        w = 7
      } else if (mode === "auto") {
        const k = Math.min(1, (t - autoStart) / TURN_TIME)
        const e = ease(k)
        const end = far(corner, a)
        const lift = Math.sin(Math.PI * k) * 0.35
        goal = [autoFrom[0] + (end[0] - autoFrom[0]) * e, autoFrom[1] + (end[1] - autoFrom[1]) * e + lift]
        w = 30
      } else {
        // Resting: the corner breathes, lifted a little toward the middle.
        const lift = 0.055 + 0.015 * Math.sin(t * 1.3)
        const inward: V2 = [corner[0] > a / 2 ? -1 : 1, corner[1] > 0.5 ? -1 : 1]
        goal = [corner[0] + inward[0] * lift * 1.4, corner[1] + inward[1] * lift]
      }
      // Critically damped spring.
      const ax = w * w * (goal[0] - pull[0]) - 2 * w * vel[0]
      const ay = w * w * (goal[1] - pull[1]) - 2 * w * vel[1]
      vel = [vel[0] + ax * dt, vel[1] + ay * dt]
      pull = [pull[0] + vel[0] * dt, pull[1] + vel[1] * dt]

      // A finished turn: the page is gone, the next one is on top.
      const end = far(corner, a)
      const doneAuto = mode === "auto" && t - autoStart > TURN_TIME
      if ((mode === "turn" && Math.abs(pull[0] - end[0]) < 0.08) || doneAuto) {
        sheet++
        corner = [a, 0]
        pull = [a, 0]
        vel = [0, 0]
        mode = "rest"
        nextAuto = t + IDLE_TURN
      }

      const span = Math.hypot(corner[0] - pull[0], corner[1] - pull[1])
      const radius = (0.035 + 0.05 * Math.min(1, span / 0.8)) * (inputs.controls.curl ?? 1)
      fx.set({
        params: {
          res: tgt.size,
          corner,
          pull,
          time: t,
          radius,
          sheet,
          aspect: a,
          foil: inputs.controls.foil ?? 1,
        },
      })
      frame.pass(tgt, fx)
    },
    resize(width, height) {
      fx.set({ params: { res: [width, height] } })
      corner = null
      pull = null
    },
  }
}
