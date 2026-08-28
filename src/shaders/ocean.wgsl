// Deep Water: a sum-of-sines sea solved per pixel by Newton iteration against
// the ray, then shaded against a procedural sky.
import { fbmSimplex2d } from "@vgpu/wgsl-std/noise/simplex";
import { centered, filmic, dither, rot2 } from "./common.wgsl";

struct Params {
  res: vec2f,
  mouse: vec2f,
  time: f32,
  swell: f32,
  wind: f32,
  sun: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

/// Wave height at a point on the water plane.
///
/// Six travelling sines with decreasing amplitude and increasing frequency. The
/// `exp(sin - 1)` shaping is what gives them sharp crests and flat troughs;
/// plain sines make a sea of identical rolling humps.
fn waveHeight(xz: vec2f, t: f32, swell: f32, wind: f32) -> f32 {
  var p = xz;
  var amp = 0.55 * swell;
  var freq = 0.42;
  var speed = 1.0;
  var h = 0.0;
  var norm = 0.0;
  for (var i = 0; i < 6; i++) {
    let dir = vec2f(cos(f32(i) * 2.399 + wind * 0.6), sin(f32(i) * 2.399 + wind * 0.6));
    let x = dot(p, dir) * freq + t * speed;
    let w = exp(sin(x) - 1.0);
    h += w * amp;
    norm += amp;
    // Drag the domain along the wave, which stops the octaves from lining up
    // into a visible grid.
    p += dir * w * amp * 0.6;
    amp *= 0.62;
    freq *= 1.85;
    speed *= 1.18;
  }
  // Fine chop rides on top of the swell.
  h += fbmSimplex2d(xz * 2.2 + vec2f(t * 0.3, 0.0), 3, 2.2, 0.5) * 0.045 * wind;
  return h / max(norm, 0.0001) * 0.9 * swell;
}

fn waveNormal(xz: vec2f, t: f32, swell: f32, wind: f32, e: f32) -> vec3f {
  let hx = waveHeight(xz + vec2f(e, 0.0), t, swell, wind) - waveHeight(xz - vec2f(e, 0.0), t, swell, wind);
  let hz = waveHeight(xz + vec2f(0.0, e), t, swell, wind) - waveHeight(xz - vec2f(0.0, e), t, swell, wind);
  return normalize(vec3f(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));
}

fn sky(rd: vec3f, sunDir: vec3f) -> vec3f {
  let up = clamp(rd.y, 0.0, 1.0);
  // Rayleigh-ish: deep blue overhead, warm and pale at the horizon.
  var c = mix(vec3f(0.62, 0.52, 0.44), vec3f(0.10, 0.24, 0.52), pow(up, 0.42));
  let sd = max(dot(rd, sunDir), 0.0);
  c += vec3f(1.0, 0.72, 0.42) * pow(sd, 8.0) * 0.55;          // glow around the sun
  c += vec3f(1.0, 0.94, 0.82) * pow(sd, 900.0) * 14.0;         // the disc
  // Cloud band near the horizon so the reflection has something to catch.
  let band = pow(max(1.0 - abs(rd.y - 0.10) * 5.0, 0.0), 2.0);
  c += vec3f(0.35, 0.30, 0.32) * band * 0.35;
  return c;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = centered(uv, params.res);
  let t = params.time;
  let m = (params.mouse - 0.5) * vec2f(1.0, -1.0);

  let sunEl = 0.03 + params.sun * 0.45;
  let sunDir = normalize(vec3f(0.55, sunEl, -0.82));

  let ro = vec3f(0.0, 1.35, t * 0.55);
  let yaw = m.x * 0.35;
  let dirXZ = rot2(yaw) * vec2f(0.0, -1.0);
  let fwd = normalize(vec3f(dirXZ.x, -0.16 + m.y * 0.12, dirXZ.y));
  let right = normalize(cross(vec3f(0.0, 1.0, 0.0), fwd));
  let upv = cross(fwd, right);
  let rd = normalize(fwd * 1.55 + right * p.x * 2.0 + upv * p.y * 2.0);

  var col: vec3f;

  if (rd.y > -0.006) {
    col = sky(rd, sunDir);
  } else {
    // Start on the flat plane, then Newton-iterate onto the surface. Five steps
    // converge everywhere a raymarcher would need fifty.
    var tt = -ro.y / rd.y;
    for (var i = 0; i < 5; i++) {
      let pos = ro + rd * tt;
      let h = waveHeight(pos.xz, t, params.swell, params.wind);
      tt += (pos.y - h) / max(-rd.y, 0.03);
    }
    let pos = ro + rd * tt;
    // Widen the normal sample with distance so the far sea does not alias into
    // static.
    let e = 0.012 + tt * 0.004;
    let n = waveNormal(pos.xz, t, params.swell, params.wind, e);

    let refl = reflect(rd, n);
    let f = pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
    let fres = 0.02 + 0.98 * f;

    let reflected = sky(vec3f(refl.x, abs(refl.y), refl.z), sunDir);
    // Subsurface: light scattering through a crest, brightest where the wave is
    // high and thin.
    let height = clamp(pos.y * 3.0 + 0.4, 0.0, 1.0);
    let sss = vec3f(0.06, 0.42, 0.38) * height * max(dot(rd, -sunDir) * 0.5 + 0.5, 0.0);
    let deep = vec3f(0.010, 0.045, 0.075);

    col = mix(deep + sss, reflected, fres);
    // Glitter: a tight specular lobe that breaks into sparkles on the chop.
    let near = exp(-tt * 0.045);
    col += vec3f(1.0, 0.92, 0.80) * pow(max(dot(refl, sunDir), 0.0), 220.0) * 3.2 * near;
    // Foam on the steepest crests.
    let steep = 1.0 - n.y;
    col += vec3f(0.85, 0.92, 0.95) * smoothstep(0.22, 0.55, steep * (0.6 + height)) * (0.35 + 0.65 * near);
    // Distance haze pulls the far water into the sky.
    col = mix(col, sky(vec3f(rd.x, 0.02, rd.z), sunDir), 1.0 - exp(-tt * 0.018));
  }

  col = filmic(col * 1.05);
  col *= 0.66 + 0.34 * smoothstep(1.35, 0.10, length((uv - 0.5) * vec2f(1.1, 1.0)));
  return vec4f(col + dither(uv, params.res), 1.0);
}
