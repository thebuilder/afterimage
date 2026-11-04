// Windwall: a kinetic facade of small metal fins, each hinged along its top
// edge, rippling in wind that rolls across the wall. The pointer is a gust:
// it lifts the fins around it and lets out the warm light hidden behind them.
import { simplex2d } from "@vgpu/wgsl-std/noise/simplex";
import { hash21 } from "./common.wgsl";

struct Params {
  res: vec2f,
  mouse: vec2f,
  time: f32,
  wind: f32,
  fins: f32,
  glow: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

const TAU: f32 = 6.2831853;
const GAP: f32 = 0.06;
const METAL = vec3f(0.80, 0.77, 0.72);
const EMBER = vec3f(1.00, 0.46, 0.16);
const GLINT = vec3f(1.00, 0.84, 0.66);
const WALL = vec3f(0.035, 0.038, 0.048);
// A low warm light from below right, so a fin swinging toward you catches it.
const KEY = vec3f(0.12, -0.48, 0.87);

/// Swing of one fin, in radians. Positive lifts its lower edge toward the viewer.
fn swing(cc: vec2f, m: vec2f, t: f32, aspect: f32, seed: f32) -> f32 {
  let w = params.wind;
  // Wind arrives in broad gusts that roll diagonally across the facade.
  let flow = cc * vec2f(1.1, 1.6) - vec2f(t * 0.32, t * 0.07);
  var g = simplex2d(flow) * 0.65 + simplex2d(flow * 2.3 + 7.1) * 0.35;
  g = smoothstep(-0.35, 0.85, g);
  // Calmer air in the lower left, where the title sits.
  let corner = vec2f(-0.5 * aspect, -0.5);
  let calm = smoothstep(0.15, 0.85, length((cc - corner) * vec2f(0.75, 1.25)));
  let amp = w * mix(0.45, 1.0, calm);
  var a = 0.03 + 0.42 * g * amp;
  // Ripples run through the gusts like wind over a field of wheat.
  let along = dot(cc, vec2f(0.94, 0.34));
  a += 0.16 * amp * (0.35 + g) * sin(along * 15.0 - t * 2.6 + seed * 0.9);
  // Every fin flutters on its own clock, harder when the wind is up.
  a += sin(t * (5.0 + 4.0 * seed) + seed * TAU) * (0.03 + 0.09 * g) * amp;
  // The gust: a lift around the pointer and rings travelling out from it.
  let d = length(cc - m);
  a += 1.05 * exp(-d * d / 0.017);
  a += 0.32 * sin(d * 20.0 - t * 5.0) * exp(-d * 3.2) * min(w, 1.0);
  return clamp(a, -0.3, 1.4);
}

/// The metal in a direction, the warm key light, and a cool sky above.
fn env(r: vec3f) -> vec3f {
  // Overcast sky above, dark street below, a soft horizon between.
  var c = mix(vec3f(0.018, 0.02, 0.026), vec3f(0.16, 0.18, 0.22), smoothstep(-0.6, 0.05, r.y));
  c = mix(c, vec3f(0.42, 0.46, 0.54), smoothstep(0.05, 0.8, r.y));
  let k = max(dot(r, normalize(KEY)), 0.0);
  c += GLINT * (pow(k, 220.0) * 3.4 + pow(k, 26.0) * 0.32);
  return c;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = params.res.x / max(params.res.y, 1.0);
  let p = vec2f((uv.x - 0.5) * aspect, 0.5 - uv.y);
  let m = vec2f((params.mouse.x - 0.5) * aspect, 0.5 - params.mouse.y);
  let t = params.time;

  let rows = params.fins;
  let cell = floor(p * rows);
  let q = fract(p * rows); // 0..1 inside the cell, y up
  let cc = (cell + 0.5) / rows;
  let seed = hash21(cell + 17.0);

  let a = swing(cc, m, t, aspect, seed);
  // A little yaw per fin, so neighbours never glint in lockstep.
  let yaw = (seed - 0.5) * 0.1 + sin(t * 1.7 + seed * 40.0) * 0.05 * params.wind;
  // Fins are pressed with a slight curve, so a glint slides down each one
  // instead of switching the whole fin on at once.
  let ac = a + (q.y - 0.55) * 0.22;
  let n = normalize(vec3f(sin(yaw) * cos(ac), -sin(ac), cos(ac) * cos(yaw)));

  // Seen from the front, a fin hinged at its top shortens as it swings.
  let top = 1.0 - GAP;
  let len = 1.0 - 2.0 * GAP;
  let bottom = top - len * abs(cos(a));
  let hw = (0.5 - GAP) * mix(1.0, abs(cos(yaw)), 0.6);
  let px = fwidth(q.y) * 1.2;
  let inY = smoothstep(bottom - px, bottom + px, q.y) * smoothstep(top + px, top - px, q.y);
  let inX = smoothstep(hw + px, hw - px, abs(q.x - 0.5));
  let fin = inY * inX;

  // Behind the facade: a dark wall with warm light pooled under the pointer and
  // a low ember glow along the bottom, seen only through the gaps.
  let d = length(p - m);
  let light = params.glow * (exp(-d * d / 0.04) * 1.1 + 0.22 * smoothstep(0.65, -0.6, p.y));
  var wall = WALL + EMBER * light;
  // The fin above shades the wall just under its lower edge.
  let under = clamp((bottom - q.y) / max(bottom, 0.001), 0.0, 1.0);
  wall *= mix(0.3, 1.0, smoothstep(0.0, 0.6, under));
  // Light through a gap also warms the fin's own edge.
  let rim = smoothstep(bottom + 0.12, bottom, q.y) * inX;

  // The fin: brushed metal reflecting its surroundings.
  let r = reflect(vec3f(0.0, 0.0, -1.0), n);
  let brushed = 0.95 + 0.05 * simplex2d(vec2f(p.x * rows * 0.4, p.y * rows * 30.0));
  var metal = METAL * env(r) * brushed;
  metal += EMBER * light * rim * 0.35 * smoothstep(0.1, 0.6, a);
  // Darken toward the hinge, where the fin meets its rail.
  metal *= mix(0.72, 1.0, smoothstep(top, top - 0.18, q.y));

  var col = mix(wall, metal, fin);
  // A gentle vignette and a filmic shoulder for the glints.
  col *= 1.0 - 0.35 * dot(uv - 0.5, uv - 0.5);
  col = col / (1.0 + col * 0.35);
  return vec4f(pow(col, vec3f(0.9)), 1.0);
}
