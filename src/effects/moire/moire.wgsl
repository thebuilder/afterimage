// Moire: two acetate sheets printed with fine concentric rings, lying on a
// warm light table. The lower sheet stays put; the upper one follows the
// pointer, and where the two sets of rings cross, broad interference fringes
// appear that swing wildly with the smallest movement.

struct Params {
  res: vec2f,
  // Centre of the lower sheet, centre of the upper sheet, both in screen units.
  base: vec2f,
  top: vec2f,
  radius: f32,
  time: f32,
  pitch: f32,
  scale: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

const DUTY = 0.42;
const TABLE = vec3f(1.0, 0.972, 0.918);
const INK_LOW = vec3f(0.06, 0.09, 0.22);
const INK_TOP = vec3f(0.24, 0.07, 0.05);

/// Integral of a square wave of period 1 that is "on" for DUTY of each cycle.
fn ramp(x: f32) -> f32 {
  return floor(x) * DUTY + max(fract(x) - (1.0 - DUTY), 0.0);
}

/// Box-filtered line coverage at phase x over a footprint w: crisp up close,
/// an even grey once the rings are finer than a pixel, so they never alias.
fn lines(x: f32, w: f32) -> f32 {
  let h = max(w, 1e-4) * 0.5;
  return (ramp(x + h) - ramp(x - h)) / (2.0 * h);
}

/// 0 outside, 1 inside a disc of radius r, antialiased over one pixel.
fn disc(d: f32, r: f32, px: f32) -> f32 {
  return 1.0 - smoothstep(r - px, r + px, d);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = params.res.x / max(params.res.y, 1.0);
  let p = vec2f((uv.x - 0.5) * aspect, 0.5 - uv.y);
  let px = 1.0 / max(params.res.y, 1.0);
  let r = params.radius;
  let rTop = r * 0.96;

  // Ring phases, taken at the top level so their screen derivatives are valid.
  let dLow = length(p - params.base);
  let dTop = length(p - params.top);
  let phLow = dLow / params.pitch;
  let phTop = dTop / (params.pitch * params.scale);
  let covLow = lines(phLow, fwidth(phLow));
  let covTop = lines(phTop, fwidth(phTop));

  // The light table: brightest under the sheets, falling off to the corners.
  let glow = 1.0 - 0.16 * smoothstep(0.15, 1.1, length(p - params.base * 0.6) / max(aspect * 0.55, 0.6));
  var col = TABLE * glow;

  let inLow = disc(dLow, r, px);
  let inTop = disc(dTop, rTop, px);

  // Each sheet's clear acetate dims the light a touch; its edge is a fine bright line.
  col *= 1.0 - 0.035 * inLow;
  // The upper sheet floats a little above and throws a soft shadow down and right.
  let sh = disc(length(p - params.top - vec2f(0.006, -0.009)), rTop, 0.012);
  col *= 1.0 - 0.1 * sh * (1.0 - inTop);

  // Inks multiply: light passes through the lower rings, then the upper ones.
  col *= mix(vec3f(1.0), INK_LOW, 0.9 * covLow * inLow);
  col *= 1.0 - 0.03 * inTop;
  col *= mix(vec3f(1.0), INK_TOP, 0.88 * covTop * inTop);

  // Cut edges catch the light.
  let rimLow = exp(-pow((dLow - r) / (1.3 * px), 2.0));
  let rimTop = exp(-pow((dTop - rTop) / (1.3 * px), 2.0));
  col = mix(col, vec3f(1.0), 0.35 * rimLow * (1.0 - inTop) + 0.5 * rimTop);
  col *= 1.0 - 0.18 * exp(-pow((dTop - rTop - 1.5 * px) / (1.5 * px), 2.0));

  // A faint film grain so the flat light never bands.
  let g = fract(sin(dot(floor(uv * params.res), vec2f(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) / 255.0;
  return vec4f(col, 1.0);
}
