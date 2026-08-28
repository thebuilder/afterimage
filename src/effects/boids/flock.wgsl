// Flocking, one invocation per bird, ping-ponged so the update never reads a
// half-written neighbour.
//
// Every bird looks at every other bird. That is O(n²) and it is the wrong
// algorithm above a few thousand, but at this population it beats a spatial
// hash: no grid to build, no bucket to sort, and the loop is a straight run
// through coalesced memory.
import { hash11 } from "../../shaders/common.wgsl";

struct Bird {
  pos: vec2f,
  vel: vec2f,
}

struct Sim {
  mouse: vec2f,
  dt: f32,
  time: f32,
  aspect: f32,
  cohesion: f32,
  separation: f32,
  speed: f32,
  pointer: f32,
  count: u32,
  reset: u32,
  _pad: f32,
}

@group(0) @binding(0) var<storage, read> src: array<Bird>;
@group(0) @binding(1) var<storage, read_write> dst: array<Bird>;
@group(0) @binding(2) var<uniform> sim: Sim;

const VIEW: f32 = 0.38;      // neighbourhood radius
const AVOID: f32 = 0.030;    // personal space

@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= sim.count) { return; }

  var me = src[i];

  if (sim.reset == 1u || (me.vel.x == 0.0 && me.vel.y == 0.0)) {
    let fi = f32(i);
    let a = hash11(fi * 0.013) * 6.2831853;
    let r = sqrt(hash11(fi * 0.029 + 3.0));
    me.pos = vec2f(cos(a) * r * sim.aspect, sin(a) * r) * 0.35;
    let va = hash11(fi * 0.047 + 7.0) * 6.2831853;
    me.vel = vec2f(cos(va), sin(va)) * 0.35;
    dst[i] = me;
    return;
  }

  var centre = vec2f(0.0);
  var heading = vec2f(0.0);
  var push = vec2f(0.0);
  var n = 0.0;

  for (var j = 0u; j < sim.count; j++) {
    if (j == i) { continue; }
    let other = src[j];
    let delta = other.pos - me.pos;
    let d2 = dot(delta, delta);
    if (d2 > VIEW * VIEW || d2 < 1e-9) { continue; }
    let d = sqrt(d2);

    centre += other.pos;
    heading += other.vel;
    // Separation is weighted by 1/d, so a bird two body-lengths away barely
    // registers and one about to collide dominates everything else.
    push -= delta / d * (AVOID / max(d, 1e-4));
    n += 1.0;
  }

  var accel = vec2f(0.0);
  if (n > 0.0) {
    centre /= n;
    heading /= n;
    accel += (centre - me.pos) * sim.cohesion * 3.4;
    accel += (heading - me.vel) * 2.2;
    // Averaged like the other two. Left as a raw sum, separation grows with the
    // neighbour count and blows the flock apart into a shell against the walls.
    accel += push / n * sim.separation * 9.0;
  }

  // Wander, so a settled flock never freezes into a rigid lattice.
  let w = sim.time * 0.7 + hash11(f32(i) * 0.011) * 40.0;
  accel += vec2f(cos(w), sin(w)) * 0.10;

  // The pointer scatters them.
  let toMouse = me.pos - sim.mouse;
  let md = length(toMouse);
  if (md < 0.55) {
    accel += toMouse / max(md, 1e-4) * (0.55 - md) * 9.0 * sim.pointer;
  }

  // Soft walls: turn before the edge rather than wrapping, which would tear the
  // flock in half every time it crossed.
  let bound = vec2f(sim.aspect, 1.0) * 0.94;
  accel += vec2f(
    select(0.0, (-bound.x - me.pos.x) * 6.0, me.pos.x < -bound.x) + select(0.0, (bound.x - me.pos.x) * 6.0, me.pos.x > bound.x),
    select(0.0, (-bound.y - me.pos.y) * 6.0, me.pos.y < -bound.y) + select(0.0, (bound.y - me.pos.y) * 6.0, me.pos.y > bound.y)
  );

  me.vel += accel * sim.dt;

  // Speed limit both ways. A minimum matters as much as a maximum: birds that
  // are allowed to stop turn the flock into a static point cloud.
  let sp = length(me.vel);
  let cruise = 0.32 * sim.speed;
  if (sp > 1e-5) {
    me.vel = me.vel / sp * clamp(sp, cruise * 0.55, cruise * 1.7);
  }
  me.pos += me.vel * sim.dt;

  dst[i] = me;
}
