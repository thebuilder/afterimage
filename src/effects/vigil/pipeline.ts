import { effect } from "vgpu"
import type { Frame, Target } from "vgpu"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

/**
 * One pass. The flame's motion is worked out here: the pointer's movement is
 * air, felt more strongly the closer it passes, and it pushes the flame on an
 * underdamped spring so it sways back through upright. Strong air makes it
 * gutter, dim and smoke before it steadies. Left alone, a faint draft keeps
 * it alive, and now and then a door somewhere makes it bow.
 */
type V2 = [number, number]

export function layout(aspect: number): { wick: V2; radius: number; floor: number } {
  if (aspect >= 1) {
    const halfW = 0.5 * aspect
    return { wick: [Math.min(0.24 * aspect, halfW - 0.22), 0.02], radius: 0.1, floor: -0.4 }
  }
  return { wick: [0, 0.12], radius: 0.1, floor: -0.42 }
}

/** Seconds between the unseen drafts. */
const DRAFT_EVERY = 9

export function createVigil(setup: EffectSetup, wgsl: Wgsl): EffectInstance {
  const { gpu, target } = setup
  const fx = effect(gpu, wgsl, {
    set: {
      params: {
        res: target.size,
        wick: [0.3, 0],
        lean: [0, 0],
        time: 0,
        flicker: 0,
        bright: 1,
        smoke: 0,
        radius: 0.1,
        floor: -0.4,
        warmth: 0.5,
        _p0: 0,
      },
    },
  })

  let lean: V2 = [0, 0]
  let vel: V2 = [0, 0]
  let flicker = 0
  let bright = 1
  let smoke = 0
  let prev: V2 | null = null
  let lastGesture = 0

  return {
    render(frame: Frame, tgt: Target, inputs: FrameInputs) {
      const t = inputs.time
      const dt = Math.min(Math.max(inputs.dt, 1 / 240), 1 / 20)
      const aspect = tgt.size[0] / Math.max(tgt.size[1], 1)
      const { wick, radius, floor } = layout(aspect)
      const breath = inputs.controls.breath ?? 1

      // The pointer as moving air, in the same units as the shader.
      const zoom = Math.min(1, Math.max(0.7, aspect))
      const hand: V2 = [((inputs.mouse[0] - 0.5) * aspect) / zoom, (0.5 - inputs.mouse[1]) / zoom]
      const gesture = inputs.gesture ?? 0
      const live = inputs.pointer > 0.05
      const jump = !prev || gesture !== lastGesture || Math.hypot(hand[0] - prev[0], hand[1] - prev[1]) > 0.25
      const v: V2 = live && !jump && prev ? [(hand[0] - prev[0]) / dt, (hand[1] - prev[1]) / dt] : [0, 0]
      prev = hand
      lastGesture = gesture
      const flameAt: V2 = [wick[0], wick[1] + 0.07]
      const dist = Math.hypot(hand[0] - flameAt[0], hand[1] - flameAt[1])
      const reach = Math.pow(1 + (dist / 0.32) ** 2, -1.5)
      let wind: V2 = [v[0] * reach * breath, v[1] * reach * breath]

      // Left alone: a faint wandering draft, and every so often a longer bow.
      const k = t / DRAFT_EVERY
      const phase = (k - Math.floor(k)) * DRAFT_EVERY
      const gust = phase < 1.6 ? Math.sin((phase / 1.6) * Math.PI) * (Math.floor(k) % 2 === 0 ? 1 : -1) : 0
      const idle: V2 = [0.18 * Math.sin(t * 0.7) + 0.1 * Math.sin(t * 1.9 + 1.3) + 0.55 * gust, 0.05 * Math.sin(t * 1.1)]
      wind = [wind[0] + idle[0], wind[1] + idle[1]]

      // The flame sways on an underdamped spring, the tip lagging the air.
      const stiff = 55
      const damp = 2 * Math.sqrt(stiff) * 0.3
      const push = 16
      vel = [vel[0] + (push * wind[0] - stiff * lean[0] - damp * vel[0]) * dt, vel[1] + (push * 0.5 * wind[1] - stiff * lean[1] - damp * vel[1]) * dt]
      lean = [lean[0] + vel[0] * dt, lean[1] + vel[1] * dt]
      lean = [Math.max(-1.6, Math.min(1.6, lean[0])), Math.max(-0.5, Math.min(0.6, lean[1]))]

      // Strong air makes it flutter, dim and smoke; it steadies over a second or two.
      const gale = Math.hypot(wind[0], wind[1])
      flicker = Math.max(flicker * Math.exp(-dt * 2.2), Math.min(1.5, gale * 0.5))
      const want = 1 - Math.min(0.72, Math.max(0, gale - 1.1) * 0.45)
      bright += (want - bright) * (1 - Math.exp(-dt * (want < bright ? 14 : 1.6)))
      smoke = Math.min(1, smoke * Math.exp(-dt * 0.35) + Math.max(0, 0.9 - bright) * dt * 9)

      fx.set({
        params: {
          wick,
          lean,
          time: t,
          flicker,
          bright,
          smoke,
          radius,
          floor,
          warmth: inputs.controls.warmth ?? 0.5,
        },
      })
      frame.pass(tgt, fx)
    },
    resize(width, height) {
      fx.set({ params: { res: [width, height] } })
    },
  }
}
