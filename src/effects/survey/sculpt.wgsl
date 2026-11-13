// One step of the hand-raised land. r holds how much the pointer has lifted
// the ground here, in the same units as the map's heights. A moving hand
// pushes up a ridge along its path; the land slowly slumps, spreads and
// wears back down to the terrain beneath.
struct Sim {
  texel: vec2f,
  hand: vec2f,  // pointer now, in uv
  prev: vec2f,  // pointer a frame ago, in uv
  aspect: f32,
  touch: f32,   // how hard the hand lifts this frame
  dt: f32,
  wear: f32,    // how fast raised land wears away
  _p0: f32,
  _p1: f32,
}
@group(0) @binding(0) var state: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> sim: Sim;

fn at(uv: vec2f) -> f32 {
  return textureSampleLevel(state, samp, uv, 0.0).r;
}

fn segDist(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  return length(pa - ba * h);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let o = sim.texel * 1.5;
  let c = at(uv);
  let avg = 0.25 * (at(uv + vec2f(o.x, 0.0)) + at(uv - vec2f(o.x, 0.0)) + at(uv + vec2f(0.0, o.y)) + at(uv - vec2f(0.0, o.y)));
  // Slump toward the neighbours, so peaks round off, then wear away.
  var h = mix(c, avg, clamp(sim.dt * 3.0, 0.0, 0.5));
  h *= exp(-sim.dt * 0.045 * sim.wear);

  // The hand lifts a broad mound along its path, harder at the centre, and
  // less as the land there is already high.
  let sc = vec2f(sim.aspect, 1.0);
  let d = segDist(uv * sc, sim.prev * sc, sim.hand * sc);
  let g = exp(-d * d / (0.075 * 0.075));
  h += sim.touch * sim.dt * 1.6 * g * max(0.0, 1.0 - h / 0.7);
  return vec4f(h, 0.0, 0.0, 1.0);
}
