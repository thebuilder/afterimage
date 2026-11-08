import { effect, pingPong } from "vgpu"
import type { Frame, Target } from "vgpu"
import { release } from "../release.ts"
import type { EffectInstance, EffectSetup, FrameInputs, Wgsl } from "../types"

export interface ChladniSources {
  readonly step: Wgsl
  readonly present: Wgsl
}

/** The sand lives on a square grid the plate's own shape, whatever the screen. */
const GRID = 512
/**
 * Sand steps per frame, in pairs: a fine grid needs small steps to stay
 * stable. Each half of a pair has its own pass, since one pass keeps one set
 * of bindings for the whole frame.
 */
const PAIRS = 2

/**
 * The plate's resonances, lowest first: (n, m, sign). Between two of them the
 * plate barely moves, so the sand only settles near a whole number.
 */
const MODES: readonly (readonly [number, number, number])[] = [
  [1, 4, -1],
  [2, 5, 1],
  [3, 4, -1],
  [1, 6, -1],
  [2, 7, 1],
  [3, 6, -1],
  [4, 7, 1],
  [3, 8, -1],
  [5, 8, 1],
  [4, 9, -1],
]

/** How much the plate rings at note position t: full on a resonance, nothing halfway. */
function resonance(t: number) {
  const off = Math.abs(t - Math.round(t))
  const k = Math.min(1, Math.max(0, (0.3 - off) / 0.22))
  return k * k * (3 - 2 * k)
}

export function createChladni(setup: EffectSetup, src: ChladniSources): EffectInstance {
  const { gpu } = setup
  // Full 32-bit floats: sand piles a hundred times deeper on a line than on
  // the open plate, and with half floats the trickle arriving at a deep pile
  // rounds away to nothing, so the sand would slowly vanish.
  const state = pingPong(gpu, GRID, GRID, { format: "r32float" })
  const a = state.read
  const b = state.write
  const there = effect(gpu, src.step, { set: { state: a.color } })
  const back = effect(gpu, src.step, { set: { state: b.color } })
  const present = effect(gpu, src.present)

  let seeded = false
  let note: number | null = null
  let hold = 0

  return {
    render(frame: Frame, tgt: Target, inputs: FrameInputs) {
      const t = inputs.time
      const dt = Math.min(inputs.dt, 1 / 20)
      const tempo = inputs.controls.tempo ?? 1
      const top = MODES.length - 1

      // Left alone, the plate is bowed through its notes on its own: it holds
      // each long enough for the figure to form, then glides to the next.
      const dwell = 7 / tempo
      const k = t / dwell
      const i = Math.floor(k)
      const f = Math.min(1, Math.max(0, (k - i - 0.82) / 0.18))
      const walk = (n: number) => {
        const c = n % (2 * top)
        return c <= top ? c : 2 * top - c
      }
      const idle = walk(i + 1) + (walk(i + 2) - walk(i + 1)) * f * f * (3 - 2 * f)
      // The pointer tunes: across the screen from the lowest note to the highest.
      const hand = Math.min(1, Math.max(0, (inputs.mouse[0] - 0.08) / 0.84)) * top

      hold = Math.max(inputs.pointer > 0.02 ? 1 : 0, hold - dt * 0.35)
      const w = hold * hold * (3 - 2 * hold)
      const want = idle + (hand - idle) * w
      note ??= want
      note += (want - note) * (1 - Math.exp(-dt * 7))

      const [n, m, s] = MODES[Math.round(note)]
      const mode: [number, number, number, number] = [n, m, s, resonance(note)]
      const bow = inputs.controls.bow ?? 1

      const sim = { mode, dt: dt / (2 * PAIRS), time: t, bow, seed: seeded ? 0 : 1 }
      seeded = true
      there.set({ sim })
      back.set({ sim })
      for (let j = 0; j < PAIRS; j++) {
        frame.pass(b, there)
        frame.pass(a, back)
      }

      present.set({
        state: a.color,
        view: {
          mode,
          res: tgt.size,
          time: t,
          sand: inputs.controls.sand ?? 1,
          bow,
          _p0: 0,
          _p1: 0,
          _p2: 0,
        },
      })
      frame.pass(tgt, present)
    },
    resize() {},
    dispose() {
      release(a, b)
    },
  }
}
