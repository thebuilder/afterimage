// The gold. Per texel: r = how much gold is in the crack here, g = whether a
// main fracture runs through this texel (worked out once), b = heat, high
// where gold has just arrived and still molten. Each step gold moves one
// texel along the fracture, losing a little, so a pour runs a fair way and
// then stops; set gold slowly sinks back over half a minute.
import { fracture } from "./cracks.wgsl";

struct Flow {
  pour: vec4f,     // pointer: x, y, radius, strength
  drip: vec4f,     // the bowl's own pour when idle: x, y, radius, strength
  aspect: f32,
  texel: f32,      // one texel in screen heights
  time: f32,
  dt: f32,
  init: f32,
  reach: f32,      // how far gold runs
  seed: f32,
}
@group(0) @binding(0) var state: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> flow: Flow;

fn rnd(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let size = vec2f(textureDimensions(state));
  let ip = vec2i(uv * size);
  let p = vec2f(uv.x * flow.aspect, 1.0 - uv.y);
  var c = textureLoad(state, ip, 0);
  var mask = c.g;
  if (flow.init > 0.5) {
    mask = select(0.0, 1.0, fracture(p) < flow.texel * 1.25);
    c = vec4f(0.0);
  }
  if (mask < 0.5) { return vec4f(0.0, 0.0, 0.0, 1.0); }

  // The richest neighbour along the fracture feeds this texel.
  var best = 0.0;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      if (i == 0 && j == 0) { continue; }
      let n = textureLoad(state, clamp(ip + vec2i(i, j), vec2i(0), vec2i(size) - 1), 0);
      if (n.g > 0.5) { best = max(best, n.r); }
    }
  }
  var gold = c.r;
  var heat = c.b * exp(-flow.dt / 1.4);
  // Flow is uneven: a texel takes the gold on most steps, not all.
  let go = rnd(vec2f(ip) + flow.seed) < 0.78;
  let fed = best - (0.004 / flow.reach) * (flow.texel * 540.0);
  if (go && fed > gold + 0.01) {
    heat = max(heat, min(1.0, fed * 1.4));
    gold = fed;
  }
  // Pours: the pointer, and the bowl's own slow drip when nobody touches it.
  let dp = length(p - flow.pour.xy);
  if (dp < flow.pour.z) {
    gold = max(gold, flow.pour.w);
    heat = max(heat, flow.pour.w);
  }
  let dd = length(p - flow.drip.xy);
  if (dd < flow.drip.z) {
    gold = max(gold, flow.drip.w);
    heat = max(heat, flow.drip.w);
  }
  // Set gold slowly sinks back, so the bowl never fills for good.
  gold = max(gold - flow.dt / 45.0 * smoothstep(0.3, 0.0, heat), 0.0);
  return vec4f(gold, 1.0, heat, 1.0);
}
