// Cumulus: a volumetric raymarch through a 3D noise field, lit by a second,
// shorter march toward the sun.
import { fbmSimplex3d } from "@vgpu/wgsl-std/noise/simplex";
import { centered, filmic, dither, rot2 } from "./common.wgsl";

struct Params {
  res: vec2f,
  mouse: vec2f,
  time: f32,
  coverage: f32,
  density: f32,
  sun: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

const SLAB_LO: f32 = 1.0;
const SLAB_HI: f32 = 5.0;
const STEPS: i32 = 46;
const LIGHT_STEPS: i32 = 4;

/// Density at a point. `coverage` subtracts a constant before the clamp, which
/// is what turns one noise field into anything from wisps to overcast.
fn cloud(p: vec3f, t: f32, coverage: f32) -> f32 {
  let q = p + vec3f(t * 0.16, 0.0, t * 0.05);
  var d = fbmSimplex3d(q * 0.34, 4, 2.10, 0.50);
  d = d * 0.5 + 0.5;
  // Fade to nothing at the top and bottom of the slab so clouds have a base and
  // a cap instead of being cut off by the march bounds.
  let hi = smoothstep(SLAB_HI, SLAB_HI - 1.6, p.y);
  let lo = smoothstep(SLAB_LO, SLAB_LO + 0.5, p.y);
  return clamp((d - (1.0 - coverage)) * 2.4, 0.0, 1.0) * hi * lo;
}

fn sky(rd: vec3f, sunDir: vec3f) -> vec3f {
  let up = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
  var c = mix(vec3f(0.32, 0.30, 0.34), vec3f(0.055, 0.13, 0.34), pow(up, 0.75));
  let sd = max(dot(rd, sunDir), 0.0);
  c += vec3f(1.0, 0.62, 0.34) * pow(sd, 6.0) * 0.45;
  c += vec3f(1.0, 0.90, 0.76) * pow(sd, 1200.0) * 20.0;
  return c;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = centered(uv, params.res);
  let t = params.time;
  let m = (params.mouse - 0.5) * vec2f(1.0, -1.0);

  let sunDir = normalize(vec3f(-0.62, 0.10 + params.sun * 0.55, -0.72));

  let ro = vec3f(t * 0.35, 0.0, 0.0);
  let yaw = m.x * 0.4 + 0.2;
  let dirXZ = rot2(yaw) * vec2f(0.0, -1.0);
  let fwd = normalize(vec3f(dirXZ.x, 0.60 + m.y * 0.28, dirXZ.y));
  let right = normalize(cross(vec3f(0.0, 1.0, 0.0), fwd));
  let upv = cross(fwd, right);
  let rd = normalize(fwd * 1.5 + right * p.x * 2.0 + upv * p.y * 2.0);

  var col = sky(rd, sunDir);

  if (rd.y > 0.015) {
    // Only march the section of the ray inside the slab. Marching from the
    // camera wastes most of the steps on empty air below the cloud base.
    let tIn = (SLAB_LO - ro.y) / rd.y;
    // A near-horizontal ray crosses an unbounded amount of slab and accumulates
    // an opaque wall. Capping the span is what keeps the horizon open.
    let tOut = min((SLAB_HI - ro.y) / rd.y, tIn + 26.0);
    let span = tOut - tIn;
    let dt = span / f32(STEPS);

    var transmittance = 1.0;
    var scattered = vec3f(0.0);
    // Offset the first sample by a per-pixel dither. Uniform starts put the
    // step pattern on screen as banding; a jitter turns it into fine grain.
    let jitter = fract(sin(dot(uv, vec2f(12.9898, 78.233))) * 43758.5453);

    for (var i = 0; i < STEPS; i++) {
      if (transmittance < 0.012) { break; }
      let pos = ro + rd * (tIn + (f32(i) + jitter) * dt);
      let d = cloud(pos, t, params.coverage) * params.density;
      if (d <= 0.001) { continue; }

      // Light march: how much sun survives to this sample.
      var shadow = 0.0;
      for (var j = 1; j <= LIGHT_STEPS; j++) {
        let lp = pos + sunDir * (f32(j) * 0.32);
        shadow += cloud(lp, t, params.coverage) * params.density;
      }
      let sunlight = exp(-shadow * 0.62);

      // Silver lining: forward scattering brightens the rim facing the sun.
      let phase = 0.55 + 0.45 * pow(max(dot(rd, sunDir), 0.0), 3.0);
      let lit = vec3f(1.00, 0.86, 0.70) * sunlight * phase * 1.9
              + vec3f(0.30, 0.42, 0.62) * 0.35;

      let absorb = exp(-d * dt * 4.2);
      scattered += transmittance * (1.0 - absorb) * lit;
      transmittance *= absorb;
    }

    // Cross-fade the volume back into clear sky near the horizon, so the branch
    // boundary is not a straight line across the frame.
    let horizonFade = smoothstep(0.015, 0.11, rd.y);
    col = mix(col, col * transmittance + scattered, horizonFade);
  }

  col = filmic(col * 1.0);
  col *= 0.68 + 0.32 * smoothstep(1.35, 0.10, length((uv - 0.5) * vec2f(1.1, 1.0)));
  return vec4f(col + dither(uv, params.res), 1.0);
}
