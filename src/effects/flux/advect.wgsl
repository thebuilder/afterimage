// Curl-noise advection. One invocation per particle, ping-ponged so no buffer is
// ever read and written in the same dispatch.
import { fbmSimplex2d } from "@vgpu/wgsl-std/noise/simplex";
import { hash11 } from "../../shaders/common.wgsl";

struct Particle {
  pos: vec2f,
  vel: vec2f,
  age: f32,
  seed: f32,
}

struct Sim {
  mouse: vec2f,
  dt: f32,
  time: f32,
  aspect: f32,
  intensity: f32,
  count: u32,
  reset: u32,
}

@group(0) @binding(0) var<storage, read> src: array<Particle>;
@group(0) @binding(1) var<storage, read_write> dst: array<Particle>;
@group(0) @binding(2) var<uniform> sim: Sim;

/// Curl of a scalar noise field. Taking the perpendicular gradient makes the
/// flow divergence-free, which is why particles swirl instead of piling up in sinks.
fn curl(p: vec2f, t: f32) -> vec2f {
  let e = 0.055;
  let o = vec2f(0.0, t * 0.055);
  let nx1 = fbmSimplex2d(p + vec2f(e, 0.0) + o, 4, 2.1, 0.55);
  let nx0 = fbmSimplex2d(p - vec2f(e, 0.0) + o, 4, 2.1, 0.55);
  let ny1 = fbmSimplex2d(p + vec2f(0.0, e) + o, 4, 2.1, 0.55);
  let ny0 = fbmSimplex2d(p - vec2f(0.0, e) + o, 4, 2.1, 0.55);
  return vec2f((ny1 - ny0), -(nx1 - nx0)) / (2.0 * e);
}

fn spawn(i: u32, t: f32) -> Particle {
  let fi = f32(i);
  let a = hash11(fi * 0.017 + t * 0.37) * 6.2831853;
  let r = sqrt(hash11(fi * 0.041 + t * 0.11 + 5.0)) * 1.15;
  var p: Particle;
  p.pos = vec2f(cos(a) * r * sim.aspect, sin(a) * r);
  p.vel = vec2f(0.0);
  // Age counts down from 1: a particle spawned at 0 would be reaped on the
  // very next dispatch and nothing would ever draw.
  p.age = 1.0;
  p.seed = hash11(fi * 0.0073 + 3.0);
  return p;
}

@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= sim.count) { return; }

  var p = src[i];
  if (sim.reset == 1u || p.age <= 0.0) {
    dst[i] = spawn(i, sim.time + f32(sim.reset));
    return;
  }

  let field = curl(p.pos * 1.15, sim.time) * (0.55 + 0.75 * sim.intensity);

  // The pointer is a soft repeller, so dragging carves a hole in the flow.
  let toMouse = p.pos - sim.mouse;
  let md = length(toMouse);
  let push = toMouse / max(md, 0.001) * exp(-md * 3.2) * 2.4;

  // Damped integration: velocity chases the field instead of matching it, which
  // is what gives the streaks their inertia.
  p.vel = mix(p.vel, field + push, 1.0 - exp(-sim.dt * 3.5));
  p.pos += p.vel * sim.dt * 0.22;
  p.age -= sim.dt * (0.10 + p.seed * 0.16);

  // Leaving the frame ends the life early.
  if (abs(p.pos.x) > sim.aspect * 1.25 || abs(p.pos.y) > 1.25) { p.age = 0.0; }

  dst[i] = p;
}
