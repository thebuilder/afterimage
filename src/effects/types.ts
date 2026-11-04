import type { Frame, Gpu, ShaderSource, Target } from "vgpu"

/** Everything a hero effect is given on each frame. */
export interface FrameInputs {
  /** Seconds since the effect started. */
  readonly time: number
  /** Seconds since the previous frame, clamped so a tab-switch cannot explode a sim. */
  readonly dt: number
  /** Pointer in 0..1 target space, top-origin, smoothed. */
  readonly mouse: readonly [number, number]
  /** 0..1: how recently the pointer moved over this canvas. Decays to 0 when idle. */
  readonly pointer: number
  /**
   * Current value of every control the effect declared, keyed by `Control.key`.
   * For a single-pass effect the key is also the WGSL `Params` member name.
   */
  readonly controls: Readonly<Record<string, number>>
}

/** A live instance of an effect, bound to one target. */
export interface EffectInstance {
  /** Encode this effect's work for one frame. */
  render(frame: Frame, target: Target, inputs: FrameInputs): void
  /** Called after the target changes size. */
  resize?(width: number, height: number): void
  dispose?(): void
}

/** WGSL as Vite's loader hands it over, or as a plain string. */
export type Wgsl = string | ShaderSource

export interface EffectSetup {
  readonly gpu: Gpu
  readonly target: Target
  /** Scale factor for internal buffers relative to the target. */
  readonly quality: number
}

/**
 * One knob on an effect.
 *
 * `key` is the contract: `fullscreen()` writes the value into the `Params`
 * member of the same name, so a control named `swell` needs a `swell: f32` in
 * the shader's uniform block. Multi-pass effects read theirs off
 * `inputs.controls` and decide what to do with them.
 */
export interface Control {
  readonly key: string
  readonly label: string
  readonly min: number
  readonly max: number
  readonly step: number
  /** Starting value, and the one the gallery tiles run at. */
  readonly value: number
}

/** One stage of the plain-language explanation. Three per effect. */
export interface Stage {
  readonly title: string
  readonly body: string
}

/**
 * The case for an effect, worked out before it is built. Every daily drop
 * answers all six, and `check:registry` holds new entries to it. Keep each
 * answer to a sentence or two.
 */
export interface Rationale {
  /** The idea in one sentence. If it cannot be said simply, it is not clear yet. */
  readonly idea: string
  /** What it feels like in the first three seconds, before any interaction. Most visitors never move the mouse. */
  readonly firstSeconds: string
  /** What the pointer reveals or changes. Following the cursor is not enough. */
  readonly interaction: string
  /** The calm area that keeps a headline readable. */
  readonly headline: string
  /** The closest effect already in the archive, and how this one differs. */
  readonly nearest: string
  /** What could ruin it: too slow on a laptop, too busy, or a gimmick that wears off. */
  readonly risks: string
}

/**
 * The technical layer.
 *
 * All of it is true and none of it belongs in front of someone who came to look
 * at the pictures, so it lives behind a disclosure and the page never shows it
 * by default.
 */
export interface Technical {
  /** One fact worth remembering, in a sentence a non-specialist can read. */
  readonly insight: string
  readonly pipeline: readonly string[]
  readonly techniques: readonly string[]
  /** The implementation notes: why it is built this way and what it avoids. */
  readonly notes: string
  /** Repo-relative path to the shader or pipeline. */
  readonly source: string
}

export interface HeroEffect {
  readonly id: string
  readonly name: string
  /** A plain word for what you are looking at. Not a technique. */
  readonly category: string
  /** One sentence about the image, shown in the hero and on the card. */
  readonly tagline: string
  /** Two sentences on what makes the image, and what the controls do to it. */
  readonly summary: string
  readonly explanation: readonly Stage[]
  /** The case for the effect, all six answers. Required on every entry. */
  readonly rationale: Rationale
  readonly technical: Technical
  readonly accent: string
  /**
   * The day this effect went live, `YYYY-MM-DD`. Shown next to its number.
   * The original thirteen predate the one-a-day run and leave it out; every effect
   * added since carries one, and `check:registry` holds new entries to it.
   */
  readonly published?: string
  /** The knobs this effect exposes. One to three; more than that is a control panel, not a hero. */
  readonly controls: readonly Control[]
  create(setup: EffectSetup): EffectInstance
}
