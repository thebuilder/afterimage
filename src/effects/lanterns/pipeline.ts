import { effect } from "vgpu"
import type { Frame, Target } from "vgpu"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

/**
 * One pass. The near lanterns live here: each rises at its own pace, sways,
 * and drifts slowly away so it shrinks as it climbs. Moving the pointer is a
 * breath of warm air that pushes the lanterns near it; pressing lets a new
 * lantern go from under your hand. Left alone, lanterns keep being released
 * from boats across the lake, away from the lower left.
 */
type V2 = [number, number]

const MAXL = 44

interface Lantern {
  x: number
  y: number
  vx: number
  vy: number
  s: number
  water: number
  phase: number
  born: number
}

/** Seeded, so the opening frame and the social card are the same each time. */
let seed = 20261121
function rnd(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}

/** Where boats let lanterns go: away from the lower left on wide screens. */
function spawnX(aspect: number): number {
  return aspect >= 1 ? aspect * (0.32 + 0.66 * rnd()) : aspect * (0.08 + 0.84 * rnd())
}

export function horizonFor(aspect: number): number {
  return aspect >= 1 ? 0.34 : 0.3
}

export function createLanterns(setup: EffectSetup, wgsl: Wgsl): EffectInstance {
  const { gpu, target } = setup
  const zero = Array.from({ length: MAXL }, () => [0, 0, 0, 0])
  const fx = effect(gpu, wgsl, {
    set: {
      params: { res: target.size, aspect: 1, time: 0, horizon: 0.34, count: 1, glow: 1, n: 0, lan: zero, aux: zero },
    },
  })

  let lanterns: Lantern[] = []
  let seeded = false
  let nextAuto = 0
  let nextHeld = 0
  let prev: V2 | null = null
  let lastGesture = 0
  let wasPressed = false

  function release(x: number, water: number, y: number, t: number, aspect: number) {
    const H = horizonFor(aspect)
    const w = Math.min(H - 0.015, Math.max(0.02, water))
    const near = 1 - w / H
    if (lanterns.length >= MAXL) {
      // Make room: the one that has risen highest goes.
      lanterns.sort((a, b) => b.y - a.y)
      lanterns.shift()
    }
    lanterns.push({
      x,
      y: Math.max(y, w + 0.01),
      vx: 0,
      vy: 0,
      s: 0.012 + 0.07 * Math.pow(near, 1.5),
      water: w,
      phase: rnd() * 100,
      born: t,
    })
  }

  return {
    render(frame: Frame, tgt: Target, inputs: FrameInputs) {
      const t = inputs.time
      const dt = Math.min(Math.max(inputs.dt, 1 / 240), 1 / 20)
      const aspect = tgt.size[0] / Math.max(tgt.size[1], 1)
      const H = horizonFor(aspect)
      const count = inputs.controls.count ?? 1
      const live = inputs.pointer > 0.05
      const pressed = inputs.pressed ?? false
      const hand: V2 = [inputs.mouse[0] * aspect, 1 - inputs.mouse[1]]

      // The first frame already has lanterns in the air.
      if (!seeded) {
        seeded = true
        for (let i = 0; i < 26; i++) {
          const water = 0.03 + rnd() * (H - 0.06)
          release(spawnX(aspect), water, water + 0.05 + rnd() * 0.75, t - 10, aspect)
        }
      }

      // Boats across the lake keep letting lanterns go.
      if (t >= nextAuto) {
        const water = 0.03 + rnd() * (H - 0.06)
        release(spawnX(aspect), water, water + 0.01, t, aspect)
        nextAuto = t + (0.5 + rnd() * 0.9) / count
      }
      // Pressing lets one go from under the hand, and more while held.
      if (pressed && (!wasPressed || t >= nextHeld)) {
        const water = hand[1] < H ? hand[1] - 0.03 : H - 0.03
        release(hand[0], water, hand[1], t, aspect)
        nextHeld = t + 0.35
      }
      wasPressed = pressed

      // The pointer as warm moving air, felt more the closer it passes.
      const gesture = inputs.gesture ?? 0
      const jump = !prev || gesture !== lastGesture || Math.hypot(hand[0] - prev[0], hand[1] - prev[1]) > 0.25
      const v: V2 = live && !jump && prev ? [(hand[0] - prev[0]) / dt, (hand[1] - prev[1]) / dt] : [0, 0]
      prev = hand
      lastGesture = gesture

      for (const L of lanterns) {
        const rise = 0.018 + 0.9 * L.s
        const sway = 0.012 * Math.sin(t * 0.4 + L.phase) + 0.006 * Math.sin(t * 1.1 + L.phase * 2)
        const dx = L.x - hand[0]
        const dy = L.y - hand[1]
        const reach = live ? Math.exp(-(dx * dx + dy * dy) / (0.022 + L.s * 0.6)) : 0
        // The air pushes along the hand's path, and lifts what is under it.
        const ax = v[0] * reach * 2.2 + (live ? (dx / (Math.hypot(dx, dy) + 0.02)) * reach * 0.25 : 0)
        const ay = v[1] * reach * 2.2 + reach * 0.15
        L.vx += (ax + (sway - L.vx) * 1.2) * dt
        L.vy += (ay + (rise - L.vy) * 1.2) * dt
        L.x += L.vx * dt
        L.y += L.vy * dt
        // Drifting away as they climb.
        L.s *= Math.exp(-dt * 0.035)
        L.water = Math.min(H - 0.004, L.water + dt * 0.002)
      }
      lanterns = lanterns.filter((L) => L.y < 1.15 && L.x > -0.2 && L.x < aspect + 0.2)

      // Far ones first, so near ones are drawn over them.
      const order = [...lanterns].sort((a, b) => a.s - b.s)
      const lan = zero.map(() => [0, 0, 0, 0])
      const aux = zero.map(() => [0, 0, 0, 0])
      order.forEach((L, i) => {
        // A new lantern takes a moment to catch.
        const lit = Math.min(1, (t - L.born) / 0.8)
        lan[i] = [L.x, L.y, L.s, 0.25 + 0.75 * lit * lit]
        aux[i] = [L.water, L.phase, 0, 0]
      })

      fx.set({
        params: {
          res: tgt.size,
          aspect,
          time: t,
          horizon: H,
          count,
          glow: inputs.controls.glow ?? 1,
          n: order.length,
          lan,
          aux,
        },
      })
      frame.pass(tgt, fx)
    },
    resize(width, height) {
      fx.set({ params: { res: [width, height] } })
    },
  }
}
