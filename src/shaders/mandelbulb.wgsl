// Fractal Monolith: a power-8 Mandelbulb, raymarched with soft shadows,
// ambient occlusion and orbit-trap colour.
import { centered, filmic, dither, rot2 } from "./common.wgsl";

struct Params {
  res: vec2f,
  mouse: vec2f,
  time: f32,
  power: f32,
  glow: f32,
  spin: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

const STEPS: i32 = 160;
const ITER: i32 = 10;

/// Distance estimator. Returns (distance, orbit trap) so the shading can colour
/// by how close the orbit came to the origin. That is the cheapest way to get
/// structure into an otherwise monochrome surface.
fn bulb(pos: vec3f, power: f32) -> vec2f {
  var z = pos;
  var dr = 1.0;
  var r = 0.0;
  var trap = 1e9;

  for (var i = 0; i < ITER; i++) {
    r = length(z);
    if (r > 2.2) { break; }
    trap = min(trap, r);

    // Spherical coordinates, raised to `power`, back to Cartesian.
    let theta = acos(clamp(z.z / r, -1.0, 1.0));
    let phi = atan2(z.y, z.x);
    dr = pow(r, power - 1.0) * power * dr + 1.0;

    let zr = pow(r, power);
    let st = sin(theta * power);
    z = zr * vec3f(st * cos(phi * power), st * sin(phi * power), cos(theta * power)) + pos;
  }
  return vec2f(0.5 * log(max(r, 1e-6)) * r / dr, trap);
}

fn map(p: vec3f, power: f32) -> f32 {
  return bulb(p, power).x;
}

fn normalAt(p: vec3f, power: f32) -> vec3f {
  let e = vec2f(1.0, -1.0) * 0.0006;
  return normalize(
    e.xyy * map(p + e.xyy, power) +
    e.yyx * map(p + e.yyx, power) +
    e.yxy * map(p + e.yxy, power) +
    e.xxx * map(p + e.xxx, power)
  );
}

/// Soft shadow by marching toward the light and tracking the closest approach.
fn shadow(ro: vec3f, rd: vec3f, power: f32) -> f32 {
  var res = 1.0;
  var t = 0.02;
  for (var i = 0; i < 28; i++) {
    let h = map(ro + rd * t, power);
    if (h < 0.0007) { return 0.0; }
    res = min(res, 12.0 * h / t);
    t += clamp(h, 0.01, 0.2);
    if (t > 3.0) { break; }
  }
  return clamp(res, 0.0, 1.0);
}

fn ao(p: vec3f, n: vec3f, power: f32) -> f32 {
  var occ = 0.0;
  var sca = 1.0;
  for (var i = 0; i < 5; i++) {
    let h = 0.012 + 0.10 * f32(i) / 4.0;
    occ += (h - map(p + n * h, power)) * sca;
    sca *= 0.72;
  }
  return clamp(1.0 - 2.4 * occ, 0.0, 1.0);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = centered(uv, params.res);
  let t = params.time;
  let m = (params.mouse - 0.5);

  // The exponent breathes between 6 and 10: the fractal reorganises itself
  // continuously instead of just spinning.
  let power = params.power + 1.6 * sin(t * 0.11);

  let yaw = t * 0.10 * params.spin + m.x * 2.2;
  let pitch = 0.25 + m.y * 0.9;
  var ro = vec3f(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch)) * 2.45;

  let fwd = normalize(-ro);
  let right = normalize(cross(vec3f(0.0, 1.0, 0.0), fwd));
  let upv = cross(fwd, right);
  let rd = normalize(fwd * 1.9 + right * p.x * 2.0 + upv * p.y * 2.0);

  var dist = 0.0;
  var hit = false;
  var trap = 0.0;
  for (var i = 0; i < STEPS; i++) {
    let pos = ro + rd * dist;
    let s = bulb(pos, power);
    // Cone-proportional epsilon. A fixed threshold either speckles at the
    // silhouette or eats detail near the camera; this one tracks the pixel footprint.
    if (s.x < 0.00035 * dist) { hit = true; trap = s.y; break; }
    dist += s.x * 0.85;
    if (dist > 6.0) { break; }
  }

  // Background: a cold studio gradient plus a faint glow behind the object.
  let bgT = smoothstep(-0.55, 0.55, p.y);
  var col = mix(vec3f(0.020, 0.026, 0.040), vec3f(0.004, 0.006, 0.012), bgT);
  col += vec3f(0.10, 0.16, 0.30) * pow(max(1.0 - length(p) * 1.1, 0.0), 3.0);

  if (hit) {
    let pos = ro + rd * dist;
    let n = normalAt(pos, power);
    let lightDir = normalize(vec3f(0.65, 0.75, 0.35));

    let dif = max(dot(n, lightDir), 0.0);
    let sh = shadow(pos + n * 0.004, lightDir, power);
    let occ = ao(pos, n, power);
    let fres = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
    let spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 42.0);

    // Orbit trap drives hue: cold blue where the orbit stayed near the origin,
    // warm sand on the exposed lobes.
    let k = clamp(trap * 3.4 - 0.62, 0.0, 1.0);
    let base = mix(vec3f(0.22, 0.34, 0.62), vec3f(1.00, 0.76, 0.44), smoothstep(0.15, 0.85, k));

    col = base * (0.10 + 0.95 * dif * sh) * occ;
    col += vec3f(0.10, 0.20, 0.42) * occ * 0.55;               // sky bounce
    col += vec3f(0.35, 0.72, 1.00) * fres * 0.9 * params.glow;              // rim
    col += vec3f(1.0, 0.94, 0.86) * spec * sh * 1.4;
    col *= 1.0 - smoothstep(2.0, 5.5, dist) * 0.55;            // depth cue
  }

  col = filmic(col * (0.9 + 0.5 * params.glow));
  col *= 0.60 + 0.40 * smoothstep(1.30, 0.10, length((uv - 0.5) * vec2f(1.1, 1.0)));
  return vec4f(col + dither(uv, params.res), 1.0);
}
