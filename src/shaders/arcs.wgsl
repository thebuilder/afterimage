// Tesla Arc: filaments of plasma whipping out of a core in polar space.
import { fbmSimplex2d, simplex2d } from "@vgpu/wgsl-std/noise/simplex";
import { centered, filmic, dither, hash11 } from "./common.wgsl";

struct Params {
  res: vec2f,
  mouse: vec2f,
  time: f32,
  energy: f32,
  chaos: f32,
  beat: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

const ARCS: i32 = 7;
const TAU: f32 = 6.283185307;

/// Shortest signed distance between two angles, so an arc crossing the -pi/pi
/// seam does not tear.
fn angleDelta(a: f32, b: f32) -> f32 {
  var d = a - b;
  d = d - TAU * floor(d / TAU + 0.5);
  return d;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = centered(uv, params.res);
  let t = params.time;
  let mp = centered(params.mouse, params.res) * vec2f(1.0, -1.0);

  // The core follows the pointer, lazily.
  let core = mp * 0.55;
  let q = p - core;
  let r = length(q);
  let a = atan2(q.y, q.x);

  var glow = vec3f(0.0);
  var heat = 0.0;

  for (var i = 0; i < ARCS; i++) {
    let fi = f32(i);
    let seed = hash11(fi * 13.7) * 40.0;
    // Each arc lives for a beat and then re-fires somewhere else.
    let beat = floor(t * params.beat + fi * 0.37);
    let life = fract(t * params.beat + fi * 0.37);
    let born = hash11(beat * 7.3 + fi * 3.1);
    let baseAngle = born * TAU;
    let reach = 0.55 + born * 0.85;

    // The filament wanders: its angle is a noise function of radius, at two
    // scales. The low-frequency term steers the bolt outward in a lazy S;
    // the high-frequency term only nudges the angle, which reads as a kink rather
    // than a curl. Put the detail in the steering term instead and every arc
    // collapses into a circle.
    let steer = fbmSimplex2d(vec2f(r * 1.8 + seed, t * 1.3 + seed), 3, 2.0, 0.5);
    let jag = fbmSimplex2d(vec2f(r * 26.0 + seed * 2.0, t * 3.1 + seed), 2, 2.4, 0.6);
    let path = baseAngle + steer * (0.22 + r * 0.60) * params.chaos + jag * 0.055 * params.chaos;

    // Angular distance converted to screen distance by multiplying with r.
    let d = abs(angleDelta(a, path)) * max(r, 0.02);

    // Envelope: fades in fast, dies out over the beat, and stops at `reach`.
    let env = smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.45, 1.0, life));
    // Arcs start at the shell of the ball, not at the singular centre: near r = 0
    // every angle collapses onto the path and the core rings.
    let radial = smoothstep(reach, reach * 0.30, r) * smoothstep(0.10, 0.20, r);

    // Core is a hard 1/d² spike; a second, wider term is the corona around it.
    let core = 0.00016 / (d * d + 0.0000045);
    let corona = 0.0009 / (d * d + 0.0022);
    let filament = env * radial * (core + corona * 0.5);
    heat += filament;
    // Hot core to cool violet at the tips.
    let tint = mix(vec3f(0.55, 0.85, 1.0), vec3f(0.75, 0.45, 1.0), smoothstep(0.1, 0.9, r / reach));
    glow += tint * filament;
  }

  // The plasma ball itself.
  let ballR = 0.16 + 0.012 * sin(t * 7.0);
  let ball = smoothstep(ballR, ballR * 0.25, r);
  let shell = pow(max(1.0 - abs(r - ballR) * 9.0, 0.0), 3.0);
  glow += vec3f(0.75, 0.90, 1.0) * ball * 2.4;
  glow += vec3f(0.45, 0.70, 1.0) * shell * 0.9;

  // Ionised haze around everything.
  let haze = exp(-r * 3.2) * (0.55 + 0.45 * simplex2d(q * 4.0 + vec2f(0.0, -t * 0.7)));
  glow += vec3f(0.10, 0.24, 0.55) * haze * 0.30;

  var col = glow * params.energy;
  // Air scatter: the whole frame lifts slightly when the arcs are firing hard.
  col += vec3f(0.05, 0.09, 0.22) * clamp(heat * 0.015, 0.0, 0.45);

  col = filmic(col);
  col *= 0.55 + 0.45 * smoothstep(1.35, 0.10, length((uv - 0.5) * vec2f(1.1, 1.0)));
  return vec4f(col + dither(uv, params.res), 1.0);
}
