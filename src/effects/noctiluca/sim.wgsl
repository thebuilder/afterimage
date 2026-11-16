// The plankton's memory, kept per screen texel: how brightly the water glows
// on the surface there (r), how wet the sand is (g), and the pointer's own
// trail (b). Everything is worked out on the ground, in world units, so a
// trail is wide up close and thin out at sea. Glow fades, rides up and down
// the beach with the swash, and is set off wherever a wave breaks or the
// pointer stirs the water.
import { WAVES, ground, toScreen, shoreS, edge, wave } from "./shore.wgsl";

struct Sim {
  a: vec2f,        // pointer segment this frame, on the ground (x, z)
  b: vec2f,
  aspect: f32,
  horizon: f32,
  time: f32,
  dt: f32,
  touch: f32,      // 0..1 how much the pointer is stirring
  speed: f32,      // pointer speed on the ground, units per second
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

fn n1(x: f32) -> f32 {
  let i = floor(x);
  let f = fract(x);
  let a = fract(sin(i * 127.1) * 43758.5453);
  let b = fract(sin((i + 1.0) * 127.1) * 43758.5453);
  return mix(a, b, f * f * (3.0 - 2.0 * f));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = vec2f(uv.x * sim.aspect, 1.0 - uv.y);
  let g0 = ground(p, sim.horizon, sim.aspect);
  if (g0.z < 0.5) { return vec4f(0.0, 0.0, 0.0, 1.0); }
  let w = g0.xy;
  let t = sim.time;
  let u = w.x;
  let s = shoreS(w.x, w.y);

  // The swash carries the glow up the sand and drags it back.
  let e = edge(u, t, sim.surf);
  let ePrev = edge(u, t - 0.03, sim.surf);
  let swash = (e - ePrev) / 0.03;
  let water = smoothstep(e - 0.03, e + 0.05, s);
  var v = vec2f(0.0, swash * (1.0 - smoothstep(-0.2, 2.5, s)) * water);
  // The pointer drags a little water along with it.
  let dHand = segDist(w, sim.a, sim.b);
  let reach = 0.045 + 0.012 * w.y;
  v += (sim.b - sim.a) / max(sim.dt, 1e-3) * 0.35 * exp(-dHand * dHand / (reach * reach * 4.0)) * sim.touch * water;
  let back = toScreen(w.x - v.x * sim.dt, w.y - v.y * sim.dt, 0.0, sim.horizon, sim.aspect);
  let prev = textureSampleLevel(state, samp, vec2f(back.x / sim.aspect, 1.0 - back.y), 0.0);
  let here = textureSampleLevel(state, samp, uv, 0.0);

  // Surf glow (r) flashes and fades fast so breakers stay lines; the
  // pointer's trail (b) lingers longer so you can see what you drew.
  var g = prev.r * exp(-sim.dt / (sim.linger * mix(0.35, 0.9, water)));
  var h = prev.b * exp(-sim.dt / (sim.linger * mix(0.8, 2.0, water)));

  // Whitewater behind a breaking crest and at the swash's leading edge sets
  // the plankton off, in clumps along the wave.
  for (var i = 0; i < WAVES; i++) {
    let f = wave(i, u, t, sim.surf);
    if (f.y > 0.001) {
      let back = s - f.x;
      let width = 0.08 + 0.05 * clamp(f.x, 0.0, 6.0);
      // Most of the light trails seaward of the front, where the foam is.
      let z = select(back / width, back / (width * 3.0), back > 0.0);
      let clump = 0.45 + 0.55 * smoothstep(0.2, 0.8, n1(u * 1.3 + f32(i) * 13.0 + t * 0.2) * 0.6 + n1(u * 3.7 - f32(i) * 7.0) * 0.4);
      g += f.y * clump * exp(-z * z) * sim.dt * 16.0 * sim.glow;
    }
  }

  // The pointer stirs the water, and presses the glow out of wet sand.
  let medium = max(water, 0.8 * smoothstep(0.15, 0.6, here.g));
  let stir = 0.45 + min(sim.speed / reach * 0.1, 3.0) * 0.9;
  let r = reach * (1.0 + 0.3 * min(sim.speed / reach * 0.05, 1.5));
  h += exp(-dHand * dHand / (r * r)) * sim.touch * medium * stir * sim.dt * 11.0 * sim.glow;

  let wetNow = max(here.g * exp(-sim.dt / 7.0), water);
  return vec4f(min(g, 3.0), wetNow, min(h, 3.0), 1.0);
}
