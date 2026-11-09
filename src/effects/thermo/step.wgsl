// One step of the sheet's temperature. r holds heat: 0 is the cool room, 1 is
// a warm hand held still. The hand warms the sheet along its stroke, heat
// spreads sideways through the film, and everything slowly cools.
struct Sim {
  texel: vec2f,
  hand: vec2f,
  prev: vec2f,
  dt: f32,
  time: f32,
  warmth: f32,
  cool: f32,
  touch: f32,
  aspect: f32,
  palm: vec4f, // where an unseen hand presses: centre, tilt, how firmly
  mirror: f32, // 1 for a right hand, -1 for a left
  _p0: f32,
  _p1: f32,
  _p2: f32,
}
@group(0) @binding(0) var state: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> sim: Sim;

fn segDist(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  return length(pa - ba * h);
}

fn capsule(p: vec2f, a: vec2f, b: vec2f, r: f32) -> f32 {
  return segDist(p, a, b) - r;
}

fn smin(a: f32, b: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

/// A flat right hand, fingers up, in screen units of height 1: negative inside.
/// The palm is no wider than the four fingers that grow from its top edge,
/// and narrows a little toward the wrist.
fn hand(q: vec2f) -> f32 {
  let taper = 1.0 + 0.22 * clamp(-(q.y + 0.02) / 0.09, 0.0, 1.0);
  let pd = abs(vec2f(q.x * taper, q.y + 0.012)) - vec2f(0.031, 0.056);
  var d = length(max(pd, vec2f(0.0))) + min(max(pd.x, pd.y), 0.0) - 0.026;
  // Knuckles sit in a gentle arc along the palm's top edge; the fingers fan out.
  d = smin(d, capsule(q, vec2f(-0.04, 0.056), vec2f(-0.058, 0.151), 0.0165), 0.008);
  d = smin(d, capsule(q, vec2f(-0.013, 0.064), vec2f(-0.017, 0.173), 0.0175), 0.008);
  d = smin(d, capsule(q, vec2f(0.014, 0.062), vec2f(0.023, 0.164), 0.0165), 0.008);
  d = smin(d, capsule(q, vec2f(0.04, 0.05), vec2f(0.061, 0.128), 0.0145), 0.008);
  // The thumb leaves from low on the palm's side and angles out and up.
  d = smin(d, capsule(q, vec2f(-0.04, -0.048), vec2f(-0.1, 0.01), 0.019), 0.016);
  return d;
}

fn heatAt(uv: vec2f) -> f32 {
  return textureSampleLevel(state, samp, uv, 0.0).r;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let o = sim.texel * 2.0;
  let t0 = heatAt(uv);
  let around = 0.25 * (heatAt(uv + vec2f(o.x, 0.0)) + heatAt(uv - vec2f(o.x, 0.0)) + heatAt(uv + vec2f(0.0, o.y)) + heatAt(uv - vec2f(0.0, o.y)));
  // Heat creeps sideways through the film.
  var t = mix(t0, around, clamp(sim.dt * 2.5, 0.0, 0.24));
  // And bleeds away into the room, the last of it all at once.
  t = max(t * exp(-sim.dt * 0.17 * sim.cool) - sim.dt * 0.004, 0.0);

  // The hand. Each frame it gives the same heat, spread along however far it
  // moved, so a slow touch burns hot and a quick swipe barely tints the sheet.
  if (sim.touch > 0.0) {
    let asp = vec2f(sim.aspect, 1.0);
    let a = sim.prev * asp;
    let b = sim.hand * asp;
    let r = 0.038;
    let d = segDist(uv * asp, a, b);
    let spread = 1.0 + 0.6 * length(b - a) / r;
    let fall = exp(-d * d / (r * r));
    t += sim.dt * 2.2 * sim.warmth * sim.touch * fall / spread;
    // Even a passing touch warms the film a little, so a swipe leaves a line.
    t = max(t, 0.15 * sim.touch * fall);
  }

  // The unseen hand: a palm pressed flat, warmest in its middle.
  if (sim.palm.w > 0.0) {
    let asp = vec2f(sim.aspect, 1.0);
    let rel = (uv * asp - sim.palm.xy * asp) * vec2f(sim.mirror, -1.0);
    let c = cos(sim.palm.z);
    let s = sin(sim.palm.z);
    let q = vec2f(c * rel.x + s * rel.y, -s * rel.x + c * rel.y);
    // Smaller on a narrow screen, so the whole hand fits across it.
    let size = 1.75 * mix(0.72, 1.0, clamp((sim.aspect - 0.5) / 0.7, 0.0, 1.0));
    let d = hand(q / size) * size;
    // The palm's middle is the warmest part of a hand, the fingertips the coolest.
    let qc = (q / size - vec2f(0.0, -0.03)) * vec2f(1.25, 1.0);
    let core = exp(-dot(qc, qc) / 0.0035);
    let inside = smoothstep(0.006, -0.01, d) * (0.55 + 0.25 * smoothstep(0.0, -0.04, d) + 0.5 * core);
    t += sim.dt * 1.0 * sim.warmth * sim.palm.w * inside;
  }

  return vec4f(min(t, 1.6), 0.0, 0.0, 1.0);
}
