// Ridgeline: a ridged-noise heightfield raymarched with a coarse march and a
// bisection refine, shaded by slope and drowned in aerial perspective.
import { fbmSimplex2d, simplex2d } from "@vgpu/wgsl-std/noise/simplex";
import { centered, filmic, dither, rot2 } from "./common.wgsl";

struct Params {
  res: vec2f,
  mouse: vec2f,
  time: f32,
  altitude: f32,
  ruggedness: f32,
  haze: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

const STEPS: i32 = 110;
const FAR: f32 = 90.0;

/// Ridged multifractal. Folding each octave with `1 - abs(n)` turns the smooth
/// hills of plain fbm into creases, which is what reads as an eroded ridge.
fn height(xz: vec2f, rugged: f32) -> f32 {
  var p = xz * 0.028;
  var amp = 1.0;
  var sum = 0.0;
  var norm = 0.0;
  var prev = 1.0;
  for (var i = 0; i < 6; i++) {
    var n = simplex2d(p);
    n = 1.0 - abs(n);
    n = pow(n, 1.45);
    // Weighting each octave by the last one keeps detail on the ridges and off
    // the valley floors, the way erosion actually leaves it.
    sum += n * amp * prev;
    prev = mix(1.0, n, rugged * 0.75);
    norm += amp;
    amp *= 0.5;
    p = rot2(0.7) * p * 2.06;
  }
  return (sum / max(norm, 0.0001)) * 11.0 - 3.4;
}

fn normalAt(xz: vec2f, rugged: f32, e: f32) -> vec3f {
  let hx = height(xz + vec2f(e, 0.0), rugged) - height(xz - vec2f(e, 0.0), rugged);
  let hz = height(xz + vec2f(0.0, e), rugged) - height(xz - vec2f(0.0, e), rugged);
  return normalize(vec3f(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));
}

fn sky(rd: vec3f, sunDir: vec3f) -> vec3f {
  let up = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
  var c = mix(vec3f(0.52, 0.34, 0.30), vec3f(0.10, 0.16, 0.36), pow(up, 0.55));
  let sd = max(dot(rd, sunDir), 0.0);
  c += vec3f(1.0, 0.52, 0.26) * pow(sd, 5.0) * 0.75;
  c += vec3f(1.0, 0.86, 0.66) * pow(sd, 900.0) * 12.0;
  // Thin cloud deck catching the low sun.
  let deck = pow(max(1.0 - abs(rd.y - 0.22) * 3.2, 0.0), 2.0);
  let plane = rd.xz / max(abs(rd.y), 0.06);
  c += vec3f(0.55, 0.30, 0.26) * deck * fbmSimplex2d(plane * 0.55, 3, 2.0, 0.5) * 0.30;
  return c;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = centered(uv, params.res);
  let t = params.time;
  let m = (params.mouse - 0.5) * vec2f(1.0, -1.0);

  let sunDir = normalize(vec3f(0.80, 0.16, -0.58));
  let rugged = params.ruggedness;

  let ro = vec3f(t * 1.6, 4.5 + params.altitude * 6.0, 0.0);
  let yaw = m.x * 0.35;
  let dirXZ = rot2(yaw) * vec2f(0.0, -1.0);
  let fwd = normalize(vec3f(dirXZ.x, -0.055 + m.y * 0.12, dirXZ.y));
  let right = normalize(cross(vec3f(0.0, 1.0, 0.0), fwd));
  let upv = cross(fwd, right);
  let rd = normalize(fwd * 1.5 + right * p.x * 2.0 + upv * p.y * 2.0);

  // Coarse march with a growing step, then bisect the bracketing interval. A
  // constant step fine enough for the near ground would never reach the horizon.
  var tt = 0.6;
  var hit = false;
  var prevT = tt;
  for (var i = 0; i < STEPS; i++) {
    let pos = ro + rd * tt;
    if (pos.y < height(pos.xz, rugged)) { hit = true; break; }
    prevT = tt;
    tt += 0.16 + tt * 0.055;
    if (tt > FAR) { break; }
  }

  var col: vec3f;
  if (!hit) {
    col = sky(rd, sunDir);
  } else {
    var lo = prevT;
    var hi = tt;
    for (var i = 0; i < 9; i++) {
      let mid = (lo + hi) * 0.5;
      let pos = ro + rd * mid;
      if (pos.y < height(pos.xz, rugged)) { hi = mid; } else { lo = mid; }
    }
    tt = hi;
    let pos = ro + rd * tt;
    // Match the normal footprint to the pixel footprint, or the far ridges boil.
    let e = 0.05 + tt * 0.02;
    let n = normalAt(pos.xz, rugged, e);

    let slope = clamp(n.y, 0.0, 1.0);
    let rock = vec3f(0.14, 0.11, 0.10);
    let scree = vec3f(0.30, 0.24, 0.19);
    let grass = vec3f(0.10, 0.15, 0.09);
    let snow = vec3f(0.86, 0.90, 0.96);

    var albedo = mix(rock, scree, smoothstep(0.45, 0.85, slope));
    albedo = mix(albedo, grass, smoothstep(0.72, 0.95, slope) * smoothstep(2.4, 0.6, pos.y));
    // Snow settles on flat ground above the line, and never on a cliff face.
    let snowLine = smoothstep(3.2, 5.0, pos.y) * smoothstep(0.60, 0.88, slope);
    albedo = mix(albedo, snow, snowLine);

    let dif = max(dot(n, sunDir), 0.0);
    let bounce = max(dot(n, vec3f(-sunDir.x, 0.0, -sunDir.z)), 0.0) * 0.25;
    let ambient = 0.30 + 0.30 * n.y;

    col = albedo * (vec3f(1.35, 0.92, 0.66) * dif + vec3f(0.22, 0.30, 0.52) * ambient + vec3f(0.30, 0.20, 0.14) * bounce);
    // Rim where a ridge line cuts the sun.
    col += vec3f(1.0, 0.62, 0.34) * pow(1.0 - max(dot(n, -rd), 0.0), 4.0) * dif * 0.5;

    // Aerial perspective: distant terrain takes the sky's colour, more of it
    // toward the sun.
    let fog = 1.0 - exp(-tt * 0.020 * params.haze);
    let fogCol = mix(sky(vec3f(rd.x, 0.05, rd.z), sunDir), vec3f(1.0, 0.62, 0.36), pow(max(dot(rd, sunDir), 0.0), 4.0) * 0.55);
    col = mix(col, fogCol, fog);
  }

  col = filmic(col * 1.1);
  col *= 0.66 + 0.34 * smoothstep(1.35, 0.10, length((uv - 0.5) * vec2f(1.1, 1.0)));
  return vec4f(col + dither(uv, params.res), 1.0);
}
