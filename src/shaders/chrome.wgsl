// Liquid Chrome: raymarched metaballs with a procedural studio environment.
import { centered, filmic, dither, smin, rot2 } from "./common.wgsl";

struct Params {
  res: vec2f,
  mouse: vec2f,
  time: f32,
  exposure: f32,
  melt: f32,
  spin: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

const STEPS: i32 = 88;
const MAX_DIST: f32 = 14.0;
const EPS: f32 = 0.0012;

fn map(pos: vec3f, t: f32, melt: f32, spin: f32) -> f32 {
  var p = pos;
  // The whole blob rotates slowly so highlights sweep across it.
  let xz = rot2(t * 0.16 * spin) * p.xz;
  p = vec3f(xz.x, p.y, xz.y);

  // Six orbiting spheres melted together. Different periods keep the motion
  // from ever repeating on a short loop.
  var d = 1e9;
  for (var i = 0; i < 6; i++) {
    let fi = f32(i);
    let a = t * (0.34 + fi * 0.055) + fi * 2.399;
    let b = t * (0.23 - fi * 0.021) + fi * 1.117;
    let r = 0.78 + 0.34 * sin(t * 0.4 + fi);
    let c = vec3f(cos(a) * r, sin(b) * r * 0.85, sin(a * 0.9 + fi) * r);
    d = smin(d, length(p - c) - (0.44 + 0.12 * sin(t * 0.7 + fi * 2.0)), 0.16 + melt * 0.55);
  }
  // A slow surface ripple gives the chrome something to catch light on.
  d += 0.022 * sin(p.x * 9.0 + t) * sin(p.y * 9.0 - t * 1.3) * sin(p.z * 9.0);
  return d;
}

fn normalAt(p: vec3f, t: f32, melt: f32, spin: f32) -> vec3f {
  let e = vec2f(1.0, -1.0) * 0.0018;
  return normalize(
    e.xyy * map(p + e.xyy, t, melt, spin) +
    e.yyx * map(p + e.yyx, t, melt, spin) +
    e.yxy * map(p + e.yxy, t, melt, spin) +
    e.xxx * map(p + e.xxx, t, melt, spin)
  );
}

/// Procedural studio: a warm key light, a cool fill, a hard horizon line.
/// Those are the three things a chrome surface needs to look like metal.
fn env(dir: vec3f) -> vec3f {
  let el = dir.y;
  let az = atan2(dir.z, dir.x);

  // Dome gradient: near-black floor, cool grey ceiling.
  var c = mix(vec3f(0.010, 0.012, 0.020), vec3f(0.14, 0.17, 0.24), smoothstep(-0.35, 0.85, el));

  // Three overhead strip lights with hard edges. Chrome only reads as chrome
  // when it has something crisp to reflect. A smooth gradient environment
  // renders the same geometry as plastic.
  let band = smoothstep(0.28, 0.34, el) * (1.0 - smoothstep(0.84, 0.90, el));
  let strips = smoothstep(0.45, 0.72, sin(az * 3.0 + 0.6));
  c += vec3f(3.4, 3.3, 3.1) * band * strips;

  // Warm key softbox, upper right.
  c += vec3f(2.6, 2.1, 1.5) * pow(max(dot(dir, normalize(vec3f(0.6, 0.6, -0.5))), 0.0), 14.0);
  // Cool kicker from behind-left.
  c += vec3f(0.16, 0.48, 1.05) * pow(max(dot(dir, normalize(vec3f(-0.8, 0.05, 0.5))), 0.0), 5.0) * 1.1;

  // Floor falls off hard, and a bright grazing line marks the horizon: that band
  // wrapping the body is what tells the eye the surface is a mirror.
  c *= 1.0 - 0.72 * smoothstep(0.0, -0.32, el);
  c += vec3f(0.75, 0.76, 0.84) * pow(smoothstep(0.10, 0.0, abs(el)), 3.0);
  return c;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = centered(uv, params.res);
  let t = params.time;
  let m = (params.mouse - 0.5) * vec2f(1.0, -1.0);

  let ro = vec3f(m.x * 1.2, 0.25 + m.y * 0.9, 3.7);
  let ta = vec3f(0.0, 0.0, 0.0);
  let fwd = normalize(ta - ro);
  let right = normalize(cross(vec3f(0.0, 1.0, 0.0), fwd));
  let upv = cross(fwd, right);
  let rd = normalize(fwd * 1.55 + right * p.x * 2.0 + upv * p.y * 2.0);

  var dist = 0.0;
  var hit = false;
  for (var i = 0; i < STEPS; i++) {
    let pos = ro + rd * dist;
    let d = map(pos, t, params.melt, params.spin);
    if (d < EPS) { hit = true; break; }
    dist += d * 0.85;
    if (dist > MAX_DIST) { break; }
  }

  // Background is drawn separately from the reflection environment. Reusing
  // `env` here puts the strip lights on screen as blown-out rectangles: a
  // softbox belongs in the mirror, not in the shot.
  var col = mix(vec3f(0.010, 0.012, 0.018), vec3f(0.055, 0.065, 0.092), smoothstep(-0.45, 0.9, rd.y));
  col += vec3f(0.075, 0.075, 0.085) * pow(smoothstep(0.34, 0.0, abs(rd.y)), 2.2);

  if (hit) {
    let pos = ro + rd * dist;
    let n = normalAt(pos, t, params.melt, params.spin);
    let refl = reflect(rd, n);

    // Schlick fresnel: chrome at grazing angles is a mirror, face-on it keeps its tint.
    let f = pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
    let fres = 0.06 + 0.94 * f;

    // Thin-film-ish tint so the metal is not neutral grey. Reads as oil-slick chrome.
    let iri = 0.5 + 0.5 * cos(vec3f(0.0, 2.1, 4.2) + dot(n, -rd) * 7.5 + t * 0.4);
    let tint = mix(vec3f(0.78, 0.82, 0.90), iri, 0.22);

    let reflected = env(refl) * tint;
    let diffuse = max(dot(n, normalize(vec3f(0.55, 0.72, -0.42))), 0.0);

    col = reflected * mix(0.85, 2.1, fres);
    col += vec3f(0.24, 0.30, 0.40) * diffuse * 0.30;
    // Sharp specular pop on top of the environment reflection.
    col += vec3f(1.0, 0.95, 0.88) * pow(max(dot(refl, normalize(vec3f(0.55, 0.72, -0.42))), 0.0), 90.0) * 2.2;
    col *= 1.0 - 0.20 * smoothstep(0.0, MAX_DIST, dist);
  }

  col = filmic(col * (0.85 + 0.45 * params.exposure));
  col *= 0.60 + 0.40 * smoothstep(1.25, 0.10, length((uv - 0.5) * vec2f(1.1, 1.0)));
  return vec4f(col + dither(uv, params.res), 1.0);
}
