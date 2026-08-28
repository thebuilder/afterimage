// Event Horizon: photons integrated through a Schwarzschild-like potential,
// with an accretion disk sampled where a ray crosses the equatorial plane.
import { centered, filmic, dither, hash21, rot2 } from "./common.wgsl";
import { fbmSimplex2d } from "@vgpu/wgsl-std/noise/simplex";

struct Params {
  res: vec2f,
  mouse: vec2f,
  time: f32,
  disk: f32,
  spin: f32,
  tilt: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

const STEPS: i32 = 180;
const RS: f32 = 1.0;          // horizon radius, in units where the sim is written
const DISK_IN: f32 = 2.6;
const DISK_OUT: f32 = 8.0;

/// Star field sampled by direction. Cheap, but it is what makes the lensing legible:
/// without a textured background the ring is just a shape.
fn starField(dir: vec3f) -> vec3f {
  var col = vec3f(0.0);
  // Three octaves of point stars at different densities.
  for (var i = 0; i < 3; i++) {
    let s = 30.0 * pow(2.0, f32(i));
    let cell = floor(dir * s);
    let h = hash21(cell.xy + cell.z * 71.0);
    if (h > 0.9965) {
      let f = fract(dir * s) - 0.5;
      let d = length(f);
      let mag = smoothstep(0.30, 0.0, d) * (0.4 + 0.6 * fract(h * 137.0));
      col += vec3f(mag) * mix(vec3f(0.65, 0.78, 1.0), vec3f(1.0, 0.88, 0.72), fract(h * 53.0));
    }
  }
  // Faint galactic band so the background is not uniformly black.
  let band = pow(max(1.0 - abs(dot(dir, normalize(vec3f(0.2, 0.85, 0.3)))) * 2.2, 0.0), 2.0);
  col += vec3f(0.05, 0.055, 0.085) * band;
  return col;
}

/// Disk emission at a point in the equatorial plane.
fn diskColor(pos: vec3f, t: f32) -> vec3f {
  let r = length(pos.xz);
  if (r < DISK_IN || r > DISK_OUT) { return vec3f(0.0); }

  let ang = atan2(pos.z, pos.x);
  // Keplerian shear: the inner disk laps the outer one, which is what makes the
  // turbulence stretch into filaments instead of rotating as a rigid texture.
  let omega = 2.4 / pow(r, 1.5);
  let swirl = ang + t * omega;
  let n = fbmSimplex2d(vec2f(cos(swirl) * r * 0.55, sin(swirl) * r * 0.55) + vec2f(r * 2.2, 0.0), 5, 2.2, 0.55);
  let clumps = 0.55 + 0.65 * smoothstep(-0.5, 0.8, n);

  // Radial falloff: brightest just outside the ISCO.
  let radial = smoothstep(DISK_IN, DISK_IN + 0.7, r) * (1.0 - smoothstep(DISK_OUT * 0.55, DISK_OUT, r));
  let temp = pow(clamp(DISK_IN / r, 0.0, 1.0), 1.35);

  // Blackbody-ish ramp: white-hot inside, orange at the rim.
  let hot = mix(vec3f(1.00, 0.42, 0.10), vec3f(1.00, 0.93, 0.82), smoothstep(0.25, 0.95, temp));
  return hot * radial * clumps * (0.35 + temp * 2.4);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = centered(uv, params.res);
  let t = params.time;
  let m = (params.mouse - 0.5);

  // Camera sits just above the disk plane; the shallow angle is what lets the far
  // side of the disk bend up over the hole.
  let yaw = t * 0.045 * params.spin + m.x * 1.2;
  let pitch = 0.03 + params.tilt * 0.34 + m.y * 0.28;
  let dist = 15.5;
  let ro = vec3f(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch)) * dist;

  let fwd = normalize(-ro);
  let right = normalize(cross(vec3f(0.0, 1.0, 0.0), fwd));
  let upv = cross(fwd, right);
  var rd = normalize(fwd * 2.4 + right * p.x * 2.0 + upv * p.y * 2.0);

  var pos = ro;
  var col = vec3f(0.0);
  var captured = false;

  // Conserved specific angular momentum of the photon. The deflection term
  // -1.5 h² r̂ / r⁵ is the standard weak-field correction that produces the
  // photon ring at r = 1.5 rs.
  let h2 = dot(cross(pos, rd), cross(pos, rd));

  for (var i = 0; i < STEPS; i++) {
    let r = length(pos);
    if (r < RS) { captured = true; break; }
    if (r > 40.0 && dot(pos, rd) > 0.0) { break; }

    // Step size grows with distance: fine detail only matters near the hole.
    let dt = clamp(r * 0.055, 0.02, 0.55);
    let prevY = pos.y;
    let accel = -1.5 * h2 * pos / pow(r, 5.0);
    rd = normalize(rd + accel * dt);
    pos += rd * dt;

    // Equatorial plane crossing: interpolate to the exact crossing point so the
    // disk has a clean edge instead of a stair-stepped one.
    if (prevY * pos.y < 0.0) {
      let f = prevY / (prevY - pos.y);
      let hitP = mix(pos - rd * dt, pos, f);
      let e = diskColor(hitP, t);
      // Relativistic beaming: the side rotating toward the camera is brighter.
      let vel = normalize(vec3f(-hitP.z, 0.0, hitP.x));
      let beam = 1.0 + 1.5 * dot(vel, -rd) / max(sqrt(length(hitP.xz)), 1.0) * 3.0;
      col += e * clamp(beam, 0.15, 4.0);
    }
  }

  if (!captured) {
    col += starField(rd) * 0.9;
  }

  col *= params.disk;
  col = filmic(col * 1.15);
  col *= 0.62 + 0.38 * smoothstep(1.35, 0.10, length((uv - 0.5) * vec2f(1.1, 1.0)));
  return vec4f(col + dither(uv, params.res), 1.0);
}
