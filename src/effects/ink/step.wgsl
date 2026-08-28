// One fluid step. rg holds velocity, b holds dye.
//
// This is semi-Lagrangian advection plus vorticity confinement, with no
// pressure projection. Skipping the Jacobi solve costs incompressibility, and
// what that actually looks like is dye that spreads a little too eagerly. It
// buys a single pass per step instead of twenty.
import { simplex2d } from "@vgpu/wgsl-std/noise/simplex";

struct Sim {
  texel: vec2f,
  mouse: vec2f,
  mouseVel: vec2f,
  dt: f32,
  time: f32,
  swirl: f32,
  dissipation: f32,
  dye: f32,
  pointer: f32,
  aspect: f32,
  _pad: f32,
}
@group(0) @binding(0) var state: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> sim: Sim;

fn velAt(uv: vec2f) -> vec2f {
  return textureSampleLevel(state, samp, clamp(uv, vec2f(0.0), vec2f(1.0)), 0.0).rg;
}

/// Curl of the velocity field. One scalar per texel, positive where the fluid
/// turns anticlockwise.
fn curl(uv: vec2f) -> f32 {
  let t = sim.texel;
  let l = velAt(uv - vec2f(t.x, 0.0));
  let r = velAt(uv + vec2f(t.x, 0.0));
  let d = velAt(uv - vec2f(0.0, t.y));
  let u = velAt(uv + vec2f(0.0, t.y));
  return (r.y - l.y) - (u.x - d.x);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let t = sim.texel;
  let here = textureSampleLevel(state, samp, uv, 0.0);
  var vel = here.rg;

  // Semi-Lagrangian: look back along the velocity to find what arrives here.
  // Tracing backwards is unconditionally stable; pushing forwards is not.
  let back = uv - vel * sim.dt * t * 260.0;
  let sampled = textureSampleLevel(state, samp, clamp(back, vec2f(0.0), vec2f(1.0)), 0.0);
  vel = sampled.rg;
  var dye = sampled.b;

  // Vorticity confinement: push velocity toward the nearest vortex core, which
  // puts back the small eddies advection keeps smearing away.
  let c = curl(uv);
  let cl = abs(curl(uv - vec2f(t.x, 0.0)));
  let cr = abs(curl(uv + vec2f(t.x, 0.0)));
  let cd = abs(curl(uv - vec2f(0.0, t.y)));
  let cu = abs(curl(uv + vec2f(0.0, t.y)));
  var grad = vec2f(cr - cl, cu - cd) * 0.5;
  let len = length(grad);
  if (len > 1e-5) {
    grad = grad / len;
    vel += vec2f(grad.y, -grad.x) * c * sim.swirl * sim.dt * 16.0;
  }

  // A standing convection field keeps the fluid alive with no pointer input.
  let n = vec2f(
    simplex2d(uv * 3.1 + vec2f(0.0, sim.time * 0.09)),
    simplex2d(uv * 3.1 + vec2f(5.7, sim.time * 0.11))
  );
  vel += n * sim.dt * 0.42;

  // The pointer drags fluid and injects dye.
  let d = length((uv - sim.mouse) * vec2f(sim.aspect, 1.0));
  let reach = exp(-d * d * 190.0);
  vel += sim.mouseVel * reach * 26.0 * sim.pointer;
  dye += reach * sim.dye * sim.dt * 22.0 * sim.pointer;

  // A pair of permanent sources so the frame is never empty.
  let sA = exp(-pow(length((uv - vec2f(0.26, 0.82)) * vec2f(sim.aspect, 1.0)) * 9.0, 2.0));
  let sB = exp(-pow(length((uv - vec2f(0.72, 0.84)) * vec2f(sim.aspect, 1.0)) * 9.0, 2.0));
  dye += (sA + sB) * sim.dye * sim.dt * 2.6;
  vel += vec2f(0.0, -1.0) * (sA + sB) * sim.dt * 2.4;

  // Buoyancy: dye is lighter than the medium it sits in.
  vel += vec2f(0.0, -1.0) * dye * sim.dt * 0.85;

  vel *= exp(-sim.dissipation * sim.dt * 1.6);
  dye *= exp(-sim.dissipation * sim.dt * 0.55);

  // Free-slip walls: a fluid that leaves the frame never comes back, and the
  // dye drains out with it.
  let wall = smoothstep(0.0, 0.02, uv.x) * smoothstep(1.0, 0.98, uv.x)
           * smoothstep(0.0, 0.02, uv.y) * smoothstep(1.0, 0.98, uv.y);
  vel *= wall;

  return vec4f(clamp(vel, vec2f(-8.0), vec2f(8.0)), clamp(dye, 0.0, 1.6), 1.0);
}
