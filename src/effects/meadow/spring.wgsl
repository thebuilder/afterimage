// The grass's memory of a hand: one texel per stretch of field per row,
// holding how far the blades there are pushed over (r) and how fast they are
// moving (g). Each is a damped spring back to upright; the hand drags the
// blades it passes through the way it moves and parts them around it.
import { LAYERS, row } from "./field.wgsl";

struct Sim {
  hand: vec2f,    // pointer in screen heights, y up
  vel: vec2f,     // pointer velocity, screen heights per second
  aspect: f32,
  touch: f32,     // 0..1, is a hand in the field at all
  dt: f32,
  stiff: f32,
}
@group(0) @binding(0) var state: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> sim: Sim;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(state, samp, uv, 0.0).rg;
  let l = min(i32(uv.y * f32(LAYERS)), LAYERS - 1);
  let r = row(l);
  let x = uv.x * sim.aspect;

  // Is the hand among this row's blades? Only between their roots and tips.
  let inRow = smoothstep(r.x - 0.02, r.x + 0.03, sim.hand.y) * (1.0 - smoothstep(r.x + r.y * 0.85, r.x + r.y * 1.1, sim.hand.y));
  let dx = (x - sim.hand.x) / (0.05 + r.y * 0.12);
  let near = exp(-dx * dx) * inRow * sim.touch;
  // Dragged the way the hand moves, and parted to either side of it.
  let force = near * (clamp(sim.vel.x, -3.0, 3.0) * 26.0 + sign(dx) * 9.0);

  let k = 38.0 * sim.stiff;
  let damp = 2.0 * sqrt(k) * 0.22;
  var v = c.y + (force - k * c.x - damp * c.y) * sim.dt;
  var b = clamp(c.x + v * sim.dt, -1.4, 1.4);
  return vec4f(b, v, 0.0, 1.0);
}
