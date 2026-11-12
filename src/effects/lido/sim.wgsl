// One step of the ripples on the pool. r holds the water height now (in
// hundredths of a screen height), g the
// height a step ago; the wave equation turns their difference into motion.
// The pool wall reflects, a trailing fingertip and the odd drop disturb it.
struct Sim {
  texel: vec2f,
  hand: vec2f,  // fingertip now, in uv
  prev: vec2f,  // fingertip a frame ago, in uv
  drop: vec4f,  // a falling drop: uv, radius, strength (0 for none)
  wall: vec4f,  // water where dot(s, wall.xy) > wall.z, s in height units
  aspect: f32,
  touch: f32,   // how hard the fingertip pushes this frame
  damp: f32,
  _p0: f32,
}
@group(0) @binding(0) var state: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> sim: Sim;

fn at(uv: vec2f) -> vec2f {
  return textureSampleLevel(state, samp, uv, 0.0).rg;
}

fn segDist(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  return length(pa - ba * h);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let o = sim.texel;
  let c = at(uv);
  let n4 = at(uv + vec2f(o.x, 0.0)) + at(uv - vec2f(o.x, 0.0)) + at(uv + vec2f(0.0, o.y)) + at(uv - vec2f(0.0, o.y));
  let lap = n4 - 4.0 * c;
  // Viscosity on the surface's velocity calms the grid-scale chatter the plain
  // scheme leaves, without slowing the ripples you can see.
  var h = (2.0 * c.r - c.g + 0.42 * lap.r + 0.04 * (lap.r - lap.g)) * sim.damp;

  let s = vec2f(uv.x * sim.aspect, 1.0 - uv.y);
  let sc = vec2f(sim.aspect, 1.0);

  // The fingertip presses the surface down along its path this frame.
  let d = segDist(uv * sc, sim.prev * sc, sim.hand * sc);
  h -= sim.touch * 0.05 * exp(-d * d / (0.016 * 0.016));

  // A drop lands as a sharp dimple.
  let dd = length((uv - sim.drop.xy) * sc);
  h -= sim.drop.w * 0.22 * exp(-dd * dd / (sim.drop.z * sim.drop.z));

  // On the deck there is no water: the wall holds the surface flat and reflects.
  let water = dot(s, sim.wall.xy) - sim.wall.z;
  h = select(0.0, h, water > 0.0);
  return vec4f(h, c.r * select(0.0, 1.0, water > 0.0), 0.0, 1.0);
}
