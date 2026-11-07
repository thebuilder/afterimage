// Ferro: a pool of black ferrofluid on a white plinth. Where the magnet's
// field is strong enough, the surface breaks into a lattice of spikes, the
// way real ferrofluid does; the pool drags after the magnet and stretches.
import { hash21 } from "../../shaders/common.wgsl";

struct Params {
  res: vec2f,
  magnet: vec2f,
  pool: vec2f,
  time: f32,
  field: f32,
  spikes: f32,
  pull: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

const FLOOR = vec3f(0.915, 0.905, 0.885);

fn smin(a: f32, b: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

fn wrap(p: vec2f, r: vec2f) -> vec2f {
  return p - r * floor(p / r);
}

/// Centre of the hexagonal cell holding p, on a lattice of unit spacing.
fn hexCentre(p: vec2f) -> vec2f {
  let r = vec2f(1.0, 1.7320508);
  let h = r * 0.5;
  let a = wrap(p, r) - h;
  let b = wrap(p - h, r) - h;
  return select(p - b, p - a, dot(a, a) < dot(b, b));
}

/// Tapered capsule from a (radius ra) to b (radius rb).
fn taper(p: vec2f, a: vec2f, b: vec2f, ra: f32, rb: f32) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}

/// Signed distance to the edge of the fluid: negative inside.
fn fluid(p: vec2f) -> f32 {
  let m = params.magnet;
  let c = params.pool;
  // A slow breathing wobble, so the edge never looks cut from paper.
  let a = atan2(p.y - c.y, p.x - c.x);
  let wob = 0.006 * sin(a * 3.0 + params.time * 0.7) + 0.004 * sin(a * 5.0 - params.time * 0.5);
  let body = length(p - c) - 0.25 - wob;
  // The fluid reaches for the magnet: a tapering arm from the pool to it.
  let arm = taper(p, c, m, 0.16, 0.11);
  return smin(body, arm, 0.09);
}

/// Field strength of the magnet below the plinth.
fn fieldAt(p: vec2f) -> f32 {
  let d = p - params.magnet;
  return params.field * exp(-dot(d, d) / 0.04);
}

/// Height of the fluid surface, 0 on the plinth.
fn height(p: vec2f) -> f32 {
  let f = fluid(p);
  if (f > 0.0) { return 0.0; }
  // A rounded meniscus at the edge, then a low dome.
  // The meniscus only depends on distance near the edge, and the dome is a
  // smooth bump round the pool's centre, so no crease from the distance field
  // ever shows in the reflections.
  let x = clamp(-f / 0.07, 0.0, 1.0);
  let dc = p - params.pool;
  let base = 0.022 * (1.0 - (1.0 - x) * (1.0 - x)) + 0.03 * x * exp(-dot(dc, dc) / 0.05);
  // Spikes stand on a hexagonal lattice. Each grows only where the field at
  // its foot passes the critical strength, which is how real ferrofluid
  // decides between a smooth surface and spikes.
  let cells = 24.0 * params.spikes;
  let q = p * cells;
  let c = hexCentre(q);
  let foot = c / cells;
  let jitter = (hash21(c + 7.0) - 0.5) * 0.15;
  let grow = smoothstep(0.22, 0.95, fieldAt(foot) + jitter * fieldAt(foot));
  let inside = smoothstep(0.0, -0.035, fluid(foot));
  let d = length(q - c) / 0.5;
  let cone = pow(clamp(1.0 - d, 0.0, 1.0), 2.2);
  // Under the strongest field the whole pool heaps up toward the magnet too.
  let heap = 0.05 * fieldAt(p) * smoothstep(0.0, -0.05, f);
  return base + heap + (0.05 + 0.08 * fieldAt(foot)) / params.spikes * grow * inside * cone;
}

/// What the glossy fluid reflects: a dark studio with one big softbox
/// ahead, and the bright white plinth and walls toward the horizon.
fn env(r: vec3f) -> vec3f {
  let horizon = smoothstep(0.5, -0.05, r.z);
  var c = mix(vec3f(0.015, 0.015, 0.02), vec3f(0.88, 0.87, 0.85), horizon);
  // The plinth itself, seen in reflection below the horizon, a little darker.
  c = mix(c, FLOOR * 0.8, smoothstep(0.0, -0.3, r.z));
  // The softbox hangs ahead of the camera, so the smooth top of the pool
  // carries one big soft window of light, broken up wherever spikes rise.
  let w = r.xy / max(r.z, 0.05) - vec2f(-0.15, 0.78);
  let box = smoothstep(0.6, 0.3, abs(w.x)) * smoothstep(0.34, 0.12, abs(w.y));
  c += vec3f(1.0, 0.98, 0.95) * box * 5.0 * step(0.0, r.z);
  // A tall strip light off to the left: the long white streak on every spike.
  let strip = smoothstep(-0.55, -0.7, r.x) * smoothstep(-0.95, -0.85, r.x) * smoothstep(-0.2, 0.15, r.z);
  c += vec3f(0.95, 0.97, 1.0) * strip * 1.3;
  return c;
}

const PITCH: f32 = 0.82; // how steeply the camera looks down, in radians
const TOP: f32 = 0.24; // nothing in the scene stands taller than this

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = params.res.x / max(params.res.y, 1.0);
  // Narrow screens pull the camera back, so the pool still fits across them.
  let zoom = clamp(aspect / 1.3, 0.55, 1.0);
  let s = vec2f((uv.x - 0.5) * aspect, 0.5 - uv.y) / zoom;
  let px = 1.0 / (params.res.y * zoom);
  let sa = sin(PITCH);
  let ca = cos(PITCH);
  let cot = ca / sa;

  // An orthographic camera tilted down at the plinth. Each pixel's ray meets
  // the floor at y0 and passes the top of the scene a little nearer the camera.
  let y0 = s.y / sa + 0.04;
  let ground = vec2f(s.x, y0);
  let rd = normalize(vec3f(0.0, ca, -sa));

  var col = FLOOR * (1.0 - 0.07 * smoothstep(0.2, 1.0, length(ground) / max(aspect, 1.0)));
  // Contact shadow from a light high above and behind.
  let sh = fluid(ground + vec2f(0.0, -0.05));
  col *= 1.0 - 0.3 * smoothstep(0.08, -0.04, sh);

  // Only march where the ray can meet fluid at all.
  let near = vec2f(s.x, y0 - TOP * cot);
  if (min(fluid(ground), fluid(near)) < 0.12) {
    // Step down from the top of the scene until the ray is under the surface,
    // then refine the crossing by bisection.
    var zHi = TOP;
    var zLo = -1.0;
    let steps = 64;
    for (var i = 1; i <= steps; i++) {
      let z = TOP * (1.0 - f32(i) / f32(steps));
      let q = vec2f(s.x, y0 - z * cot);
      if (height(q) >= z) {
        zLo = z;
        break;
      }
      zHi = z;
    }
    if (zLo >= 0.0) {
      for (var j = 0; j < 5; j++) {
        let z = 0.5 * (zHi + zLo);
        if (height(vec2f(s.x, y0 - z * cot)) >= z) { zLo = z; } else { zHi = z; }
      }
      let z = 0.5 * (zHi + zLo);
      let q = vec2f(s.x, y0 - z * cot);
      if (fluid(q) < 0.0) {
        let e = 1.5 * px;
        let h = height(q);
        let hx = height(q + vec2f(e, 0.0));
        let hy = height(q + vec2f(0.0, e));
        let n = normalize(vec3f(-(hx - h) / e, -(hy - h) / e, 1.0));
        let r = reflect(rd, n);
        let fres = 0.1 + 0.9 * pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 2.5);
        col = vec3f(0.006, 0.006, 0.008) + env(r) * fres;
      }
    }
  }

  col += (hash21(uv * params.res) - 0.5) / 255.0;
  return vec4f(pow(col, vec3f(0.95)), 1.0);
}
