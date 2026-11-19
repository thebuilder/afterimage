import { effect } from "vgpu"
import type { Frame, Target } from "vgpu"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

/**
 * One pass. The page's motion lives here: which corner is lifted, where it
 * has been pulled to, and when a page turns. A press grabs the nearest
 * corner for the whole drag and the corner follows the hand on a spring;
 * hovering only lifts the nearest corner a little. Let go past the middle and
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
  // The corner the hand wants. When it differs from the lifted one, the lifted
  // corner lays itself flat first, so the curl never jumps between corners.
  let want: V2 = [1, 0]
  let autoStart = 0
  let autoFrom: V2 = [0, 0]
  let lastActive = -10
  let lastAspect = 1
  // Start with a page already turning, so the first seconds move.
  let nextAuto = 0.6

  function far(c: V2, a: number): V2 {
    return [c[0] > a / 2 ? -a * 1.05 : a * 2.05, c[1]]
  }
  const same = (p: V2, q: V2) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6

  return {
    render(frame: Frame, tgt: Target, inputs: FrameInputs) {
      const t = inputs.time
      const dt = Math.min(Math.max(inputs.dt, 1 / 240), 1 / 20)
      const a = tgt.size[0] / Math.max(tgt.size[1], 1)
      const live = inputs.pointer > 0.05
      // Headless harnesses have no buttons, so there a hovering pointer holds.
      const pressed = inputs.pressed ?? live
      const hand: V2 = [inputs.mouse[0] * a, 1 - inputs.mouse[1]]
      if (!corner || !pull) {
        corner = [a, 0]
        pull = [a, 0]
        want = corner
        lastAspect = a
      }
      if (a !== lastAspect) {
        // A resize stretches the stack sideways; carry the page with it
        // rather than snapping it flat mid-turn.
        const k = a / lastAspect
        corner = [corner[0] * k, corner[1]]
        pull = [pull[0] * k, pull[1]]
        want = [want[0] * k, want[1]]
        autoFrom = [autoFrom[0] * k, autoFrom[1]]
        lastAspect = a
      }
      if (live || pressed) lastActive = t

      let nearest = corners(a)[0]
      for (const c of corners(a)) if (Math.hypot(c[0] - hand[0], c[1] - hand[1]) < Math.hypot(nearest[0] - hand[0], nearest[1] - hand[1])) nearest = c

      if (pressed && mode === "rest") {
        // Press: take the corner nearest the hand for the whole drag.
        want = nearest
        mode = "hold"
      } else if (!pressed && mode === "hold") {
        // Let go: the page turns if it was dragged past the middle or flicked
        // toward the far side, and falls back otherwise. Decided at once.
        const toward = Math.sign(far(corner, a)[0] - corner[0])
        const across = (pull[0] - corner[0]) * toward
        const flick = vel[0] * toward
        mode = same(want, corner) && (across > a * 0.45 || (across > a * 0.12 && flick > 1.2)) ? "turn" : "rest"
      } else if (mode === "rest" && live && !same(nearest, want)) {
        // Hovering moves the lift to another corner only when the hand is
        // clearly nearer that one, so a hand halfway between two corners
        // does not make the lift flick back and forth.
        const dn = Math.hypot(nearest[0] - hand[0], nearest[1] - hand[1])
        const dw = Math.hypot(want[0] - hand[0], want[1] - hand[1])
        if (dn < 0.4 && dn < dw - 0.15) want = nearest
      }

      if (mode === "rest" && t - lastActive > IDLE_TURN && t > nextAuto) nextAuto = t
      if (mode === "rest" && t >= nextAuto && !live && !pressed && same(want, corner)) {
        mode = "auto"
        autoStart = t
        autoFrom = [pull[0], pull[1]]
      }

      // Where the corner wants to be.
      let goal: V2
      let w = 14
      if ((mode === "hold" || mode === "rest") && !same(want, corner)) {
        // Lay the old corner flat, then lift the new one.
        goal = corner
        w = 34
        if (Math.hypot(pull[0] - corner[0], pull[1] - corner[1]) < 0.012) {
          corner = want
          pull = [want[0], want[1]]
          vel = [0, 0]
          goal = corner
        }
      } else if (mode === "hold") {
        goal = hand
        w = 18
      } else if (mode === "turn") {
        goal = far(corner, a)
        w = 11
      } else if (mode === "auto") {
        const k = Math.min(1, (t - autoStart) / TURN_TIME)
        const e = ease(k)
        const end = far(corner, a)
        const lift = Math.sin(Math.PI * k) * 0.35 * (corner[1] > 0.5 ? -1 : 1)
        goal = [autoFrom[0] + (end[0] - autoFrom[0]) * e, autoFrom[1] + (end[1] - autoFrom[1]) * e + lift]
        w = 30
      } else {
        // Resting: the corner breathes, lifted a little toward the middle, and
        // a hand hovering near it lifts it further, as an invitation to grab.
        const lift = 0.055 + 0.015 * Math.sin(t * 1.3)
        const inward: V2 = [corner[0] > a / 2 ? -1 : 1, corner[1] > 0.5 ? -1 : 1]
        goal = [corner[0] + inward[0] * lift * 1.4, corner[1] + inward[1] * lift]
        if (live) {
          const dx = hand[0] - corner[0]
          const dy = hand[1] - corner[1]
          const dd = Math.hypot(dx, dy)
          const near = Math.max(0, 1 - dd / 0.5)
          const reach = Math.min(dd * 0.3, 0.12) * near
          if (dd > 1e-4) goal = [goal[0] + (dx / dd) * reach, goal[1] + (dy / dd) * reach]
        }
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
        want = corner
        vel = [0, 0]
        mode = "rest"
        nextAuto = t + IDLE_TURN
      }

      const span = Math.hypot(corner[0] - pull[0], corner[1] - pull[1])
      // The roll shrinks to nothing as the corner lies down, so a flat corner
      // shows no curl at all and its direction can never flick.
      const radius = Math.min((0.035 + 0.05 * Math.min(1, span / 0.8)) * (inputs.controls.curl ?? 1), span * 0.45)
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
    },
  }
}
