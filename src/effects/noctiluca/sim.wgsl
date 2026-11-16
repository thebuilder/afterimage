// The plankton's memory: how brightly the water glows at each point (r) and
// how wet the sand is (g), and the pointer's own trail (b). Glow fades over a couple of seconds, rides up and
// down the beach with the swash, and is set off again wherever a wave breaks
// or the pointer stirs the water.
import { WAVES, shore, edge, front } from "./shore.wgsl";

struct Sim {
  a: vec2f,        // pointer segment this frame, screen heights, y up
  b: vec2f,
  sea: vec2f,      // unit direction out to sea
  origin: vec2f,   // a point on the waterline
  aspect: f32,
  time: f32,
  dt: f32,
  touch: f32,      // 0..1 how much the pointer is stirring
  speed: f32,      // pointer speed, screen heights per second
  surf: f32,
  linger: f32,
  glow: f32,
}
@group(0) @binding(0) var state: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> sim: Sim;

fn segDist(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let ab = b - a;
  let h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  return length(p - a - ab * h);
}

fn n2(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let h = vec4f(dot(i, vec2f(127.1, 311.7)), dot(i + vec2f(1.0, 0.0), vec2f(127.1, 311.7)),
                dot(i + vec2f(0.0, 1.0), vec2f(127.1, 311.7)), dot(i + vec2f(1.0, 1.0), vec2f(127.1, 311.7)));
  let r = fract(sin(h) * 43758.5453);
  return mix(mix(r.x, r.y, w.x), mix(r.z, r.w, w.x), w.y);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = vec2f(uv.x * sim.aspect, 1.0 - uv.y);
  let t = sim.time;
  let su = shore(p, sim.sea, sim.origin);
  let s = su.x;
  let u = su.y;

  // The swash carries the glow up the beach and drags it back.
  let e = edge(u, t, sim.surf);
  let ePrev = edge(u, t - 0.03, sim.surf);
  let swash = (e - ePrev) / 0.03;
  let water = smoothstep(e - 0.004, e + 0.006, s);
  var v = sim.sea * swash * (1.0 - smoothstep(-0.02, 0.28, s)) * water;
  // The pointer drags a little water along with it.
  let dHand = segDist(p, sim.a, sim.b);
  let dir = sim.b - sim.a;
  v += dir / max(sim.dt, 1e-3) * 0.35 * exp(-dHand * dHand / 0.003) * sim.touch * water;
  let back = p - v * sim.dt;
  let prev = textureSampleLevel(state, samp, vec2f(back.x / sim.aspect, 1.0 - back.y), 0.0);
  let here = textureSampleLevel(state, samp, uv, 0.0);

  // Glow fades; stranded on wet sand it flashes out faster.
  // Surf glow (r) flashes and fades fast so breakers stay lines; the
  // pointer's trail (b) lingers longer so you can see what you drew.
  var g = prev.r * exp(-sim.dt / (sim.linger * mix(0.35, 0.8, water)));
  var h = prev.b * exp(-sim.dt / (sim.linger * mix(0.8, 2.0, water)));

  // Breaking fronts set the plankton off, in patches along the wave.
  for (var i = 0; i < WAVES; i++) {
    let f = front(i, u, t, sim.surf);
    if (f.y > 0.001) {
      let w = 0.005 + 0.012 * smoothstep(0.0, 0.3, f.x);
      let z = (s - f.x) / w;
      let clump = 0.45 + 0.55 * smoothstep(0.2, 0.8, n2(vec2f(u * 4.0 + f32(i) * 13.0, t * 0.3)) * 0.6 + n2(vec2f(u * 11.0 - f32(i) * 7.0, t * 0.5)) * 0.4);
      g += f.y * clump * exp(-z * z) * sim.dt * 20.0 * sim.glow;
    }
  }

  // The pointer stirs the water, and presses the glow out of wet sand.
  let wet = here.g;
  let medium = max(water, 0.75 * smoothstep(0.15, 0.6, wet));
  let stir = 0.45 + min(sim.speed, 3.0) * 0.9;
  let r = 0.022 + 0.008 * min(sim.speed, 2.0);
  h += exp(-dHand * dHand / (r * r)) * sim.touch * medium * stir * sim.dt * 14.0 * sim.glow;

  let wetNow = max(here.g * exp(-sim.dt / 7.0), water);
  return vec4f(min(g, 3.0), wetNow, min(h, 3.0), 1.0);
}
