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

export interface HeroEffect {
  readonly id: string
  readonly name: string
  readonly tagline: string
  readonly description: string
  /** What the effect is doing on the GPU, in the order the frame runs it. */
  readonly pipeline: readonly string[]
  readonly techniques: readonly string[]
  /** Rough cost class, for the gallery. */
  readonly cost: "light" | "medium" | "heavy"
  readonly accent: string
  /** The knobs this effect exposes. One to three; more than that is a control panel, not a hero. */
  readonly controls: readonly Control[]
  create(setup: EffectSetup): EffectInstance
}
