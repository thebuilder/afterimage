// Aurora Veil: noise-driven drapes hanging from a wandering ribbon line.
import { fbmSimplex2d, simplex2d } from "@vgpu/wgsl-std/noise/simplex";
import { centered, filmic, dither, hash21 } from "./common.wgsl";

struct Params {
  res: vec2f,
  mouse: vec2f,
  time: f32,
  brightness: f32,
  drift: f32,
  fringe: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

/// One drape. `ribbon` is the wandering top edge; the sheet hangs below it,
/// bright and sharp at the edge, dissolving downward. That shape is what
/// separates an aurora from a stage curtain.
/// Returns (density, depth-below-edge) so the caller can colour by altitude.
fn drape(p: vec2f, t: f32, seed: f32, span: f32) -> vec2f {
  // Field lines converge slightly toward the top, so the sheet is sheared in x by y.
  let q = vec2f(p.x * (1.0 + p.y * 0.18), p.y);
  let ribbon = 0.30 + fbmSimplex2d(vec2f(q.x * 0.55 + seed, t * 0.07 + seed), 4, 2.0, 0.5) * 0.42;
  let d = ribbon - q.y;
  if (d < -0.05) { return vec2f(0.0, 0.0); }

  // Vertical striations: the field lines. High frequency in x, drifting in time.
  let stri = fbmSimplex2d(vec2f(q.x * 6.5 + seed * 3.0, t * 0.45 + q.y * 0.35), 4, 2.2, 0.55);
  let fine = simplex2d(vec2f(q.x * 26.0 + seed * 9.0, t * 0.9));
  let vert = pow(smoothstep(-0.25, 0.95, stri), 1.6) * (0.72 + 0.28 * fine);

  // Brighter rays also reach further down: uneven ray length is what makes the
  // bottom edge read as dissolving gas rather than a cropped rectangle.
  let reach = span * (0.55 + 0.9 * smoothstep(0.0, 1.0, stri * 0.5 + 0.5));
  let hang = smoothstep(-0.02, 0.05, d) * exp(-max(d, 0.0) * (4.2 / reach));

  // The drape does not span the frame: it wanders in and out.
  let centre = sin(t * 0.11 + seed * 2.3) * 0.75;
  let env = smoothstep(0.95, 0.05, abs(q.x - centre) * (0.9 + 0.35 * seed));

  return vec2f(hang * vert * env, clamp(d * 0.85, 0.0, 1.0));
}

fn stars(p: vec2f, t: f32) -> vec3f {
  let cell = floor(p * 40.0);
  let f = fract(p * 40.0) - 0.5;
  let h = hash21(cell);
  if (h < 0.975) { return vec3f(0.0); }
  let twinkle = 0.5 + 0.5 * sin(t * 2.1 + h * 90.0);
  let core = smoothstep(0.18, 0.0, length(f)) * twinkle;
  return vec3f(core) * mix(vec3f(0.72, 0.86, 1.0), vec3f(1.0, 0.9, 0.78), fract(h * 31.0));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = centered(uv, params.res);
  let t = params.time * params.drift;
  let m = (params.mouse - 0.5) * vec2f(1.0, -1.0);

  var col = mix(vec3f(0.020, 0.032, 0.062), vec3f(0.002, 0.003, 0.010), smoothstep(-0.55, 0.65, p.y));
  col += stars(p + vec2f(t * 0.003, 0.0), t) * smoothstep(-0.35, 0.35, p.y);

  // Emission colours: green low in the curtain, the classic magenta fringe on top.
  let GREEN = vec3f(0.16, 1.00, 0.62);
  let TEAL = vec3f(0.10, 0.72, 0.95);
  let FRINGE = vec3f(0.95, 0.28, 0.75);

  var glow = 0.0;
  var acc = vec3f(0.0);
  for (var i = 0; i < 3; i++) {
    let fi = f32(i);
    let depth = 1.0 + fi * 0.42;
    let par = m * (0.30 - fi * 0.08);
    let q = vec2f(p.x * depth + fi * 0.7 + par.x, (p.y - 0.05 * fi) * depth + par.y * 0.5);
    let s = drape(q, t + fi * 17.0, fi * 5.3, 1.0 + fi * 0.35);
    let alt = s.y;
    var tint = mix(FRINGE, GREEN, smoothstep(0.0, 0.05 + 0.34 * params.fringe, alt));
    tint = mix(tint, TEAL, smoothstep(0.45, 1.0, alt) * 0.55);
    acc += tint * s.x * (1.9 - fi * 0.45);
    glow += s.x;
  }

  col += acc * params.brightness;
  // Airglow spilling onto the horizon under the curtains.
  col += vec3f(0.06, 0.20, 0.15) * glow * 0.20 * smoothstep(0.25, -0.7, p.y) * params.brightness;

  col = filmic(col * 1.2);
  col *= 0.58 + 0.42 * smoothstep(1.3, 0.1, length((uv - 0.5) * vec2f(1.1, 1.0)));
  return vec4f(col + dither(uv, params.res), 1.0);
}
