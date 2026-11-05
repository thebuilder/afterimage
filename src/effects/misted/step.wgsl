// One step of the window. r holds how clear the glass is: 0 is fogged, 1 is
// freshly wiped. The pointer wipes, drips slide down and clear thin trails,
// and everything slowly fogs over again.
import { simplex2d } from "@vgpu/wgsl-std/noise/simplex";

struct Sim {
  texel: vec2f,
  mouse: vec2f,
  prev: vec2f,
  dt: f32,
  time: f32,
  brush: f32,
  refog: f32,
  drips: f32,
  wipe: f32,
  aspect: f32,
  _pad: f32,
}
@group(0) @binding(0) var state: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> sim: Sim;

fn hash11(n: f32) -> f32 {
  return fract(sin(n * 127.1) * 43758.5453);
}

/// Where the drip in column `col` is, in uv. y beyond 1 means it is resting.
fn dripHead(col: f32, cols: f32, t: f32) -> vec2f {
  let h = hash11(col * 1.7 + 3.0);
  let speed = 0.035 + 0.07 * hash11(col * 3.1 + 9.0);
  let y = fract(t * speed + h) * 2.6 - 0.25;
  // Drips stall and lurch, and wander a little sideways as they go.
  let lurch = y + 0.02 * sin(y * 40.0 + h * 30.0);
  let x = (col + 0.5 + 0.28 * sin(y * 11.0 + h * 50.0)) / cols;
  return vec2f(x, lurch);
}

fn segDist(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var clear = textureSampleLevel(state, samp, uv, 0.0).r;
  let asp = vec2f(sim.aspect, 1.0);

  // Fog creeps back unevenly, faster in some patches than others.
  let patchy = 0.55 + 0.9 * (0.5 + 0.5 * simplex2d(uv * asp * 3.0 + sim.time * 0.03));
  clear = max(clear - sim.dt * sim.refog * 0.1 * patchy, 0.0);

  // The hand: a soft-edged stroke from the last pointer position to this one.
  if (sim.wipe > 0.0) {
    let d = segDist(uv * asp, sim.prev * asp, sim.mouse * asp);
    let r = 0.055 * sim.brush;
    let edge = r * (0.85 + 0.25 * simplex2d(uv * asp * 40.0));
    clear = max(clear, smoothstep(edge, edge * 0.55, d) * sim.wipe);
  }

  // Drips: each column has one, and it clears a thin trail behind its head.
  let cols = max(10.0, floor(26.0 * sim.aspect));
  let col = floor(uv.x * cols);
  if (hash11(col * 5.3 + 1.0) < 0.22 * sim.drips) {
    let head = dripHead(col, cols, sim.time);
    let d = length((uv - head) * asp);
    clear = max(clear, smoothstep(0.0055, 0.003, d));
  }

  return vec4f(clear, 0.0, 0.0, 1.0);
}
