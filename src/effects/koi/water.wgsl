// The pond surface: a damped wave equation on a coarse grid. Red holds the
// height now, green the height a step ago. Drops are gaussian dents pressed
// in by the hand, food landing, a koi gulping and shallow fish pushing past.
struct Sim {
  res: vec2f,
  aspect: f32,
  n: f32,
  init: f32,
  gain: f32,
  _p0: f32,
  _p1: f32,
  drops: array<vec4f, 8>,  // x, y in screen heights, strength, radius
}
@group(0) @binding(0) var state: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> sim: Sim;

fn h(ip: vec2i) -> vec2f {
  let size = vec2i(sim.res);
  return textureLoad(state, clamp(ip, vec2i(0), size - 1), 0).rg;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  if (sim.init > 0.5) { return vec4f(0.0); }
  let ip = vec2i(uv * sim.res);
  let c = h(ip);
  let lap = h(ip + vec2i(1, 0)).x + h(ip - vec2i(1, 0)).x + h(ip + vec2i(0, 1)).x + h(ip - vec2i(0, 1)).x - 4.0 * c.x;
  var next = (2.0 * c.x - c.y + 0.24 * lap) * 0.986;
  let p = vec2f(uv.x * sim.aspect, 1.0 - uv.y);
  for (var i = 0; i < i32(sim.n); i++) {
    let d = sim.drops[i];
    let o = p - d.xy;
    next -= d.z * sim.gain * exp(-dot(o, o) / (d.w * d.w));
  }
  return vec4f(clamp(next, -4.0, 4.0), c.x, 0.0, 1.0);
}
