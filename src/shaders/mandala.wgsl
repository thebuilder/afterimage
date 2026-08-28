// Mandala: a noise field folded through a kaleidoscope, so structure appears
// that the field never contained.
import { fbmSimplex2d, simplex2d } from "@vgpu/wgsl-std/noise/simplex";
import { centered, filmic, dither, palette, rot2 } from "./common.wgsl";

struct Params {
  res: vec2f,
  mouse: vec2f,
  time: f32,
  segments: f32,
  twist: f32,
  zoom: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

const TAU: f32 = 6.283185307;

/// Fold the plane into one wedge and mirror it. Reflecting rather than merely
/// wrapping is what closes the seams: a wrap leaves a visible cut on every
/// spoke, a mirror makes the two sides of the cut agree.
fn kaleido(p: vec2f, segments: f32) -> vec2f {
  let r = length(p);
  var a = atan2(p.y, p.x);
  let wedge = TAU / segments;
  a = a - wedge * floor(a / wedge);      // into one wedge
  a = abs(a - wedge * 0.5);              // mirror about its centre line
  return vec2f(cos(a), sin(a)) * r;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var p = centered(uv, params.res) * params.zoom;
  let t = params.time;
  let m = (params.mouse - 0.5) * vec2f(1.0, -1.0);

  p = rot2(t * 0.05) * p;
  // Twist with radius, so the folded wedge shears into spirals.
  let r0 = length(p);
  p = rot2(r0 * params.twist + t * 0.1) * p;
  p = kaleido(p + m * 0.25, max(params.segments, 2.0));

  let r = length(p);
  // Rings that breathe, crossed with a warped fbm: the fold turns both into
  // petals.
  let warp = fbmSimplex2d(p * 0.85 + vec2f(t * 0.09, -t * 0.07), 3, 2.0, 0.5);
  let rings = sin(r * 11.0 - t * 0.9 + warp * 2.4);
  let petals = simplex2d(p * 1.9 + warp * 0.6);

  let band = pow(max(rings, 0.0), 3.0);
  let core = pow(max(1.0 - r * 0.85, 0.0), 2.5);

  let hue = 0.55 + r * 0.11 - t * 0.02 + warp * 0.06;
  let tint = palette(hue,
    vec3f(0.48, 0.42, 0.55),
    vec3f(0.42, 0.38, 0.45),
    vec3f(1.0, 1.0, 1.0),
    vec3f(0.00, 0.22, 0.48));

  var col = vec3f(0.006, 0.008, 0.016);
  col += tint * band * (0.45 + 0.55 * smoothstep(-0.3, 0.8, petals));
  col += tint * core * 0.9;
  // Filigree: a thin bright line exactly where the fbm crosses zero.
  col += vec3f(0.85, 0.95, 1.0) * (1.0 - smoothstep(0.0, 0.030, abs(warp))) * 0.9;
  // Rim light at the outer edge of the figure.
  col += vec3f(1.0, 0.55, 0.72) * pow(max(1.0 - abs(r - 1.35) * 2.2, 0.0), 4.0) * 0.6;

  col = filmic(col * 1.35);
  col *= 0.58 + 0.42 * smoothstep(1.45, 0.10, length((uv - 0.5) * vec2f(1.1, 1.0)));
  return vec4f(col + dither(uv, params.res), 1.0);
}
