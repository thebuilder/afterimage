// The bowl: a deep glossy glaze, crazed with fine lines, broken by main
// fractures. Where gold has run into a fracture it stands as a raised bead
// that reflects the studio light and the lamp you hold; fresh gold is still
// molten and glows. Elsewhere the fracture is an open dark groove.
import { hash21, filmic } from "../../shaders/common.wgsl";
import { fracture, crazing } from "./cracks.wgsl";

struct View {
  res: vec2f,
  lamp: vec3f,     // pointer lamp: x, y in screen heights, strength
  time: f32,
  aspect: f32,
  shine: f32,
}
@group(0) @binding(0) var state: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> view: View;

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2f(1.0, 0.0)), w.x),
             mix(hash21(i + vec2f(0.0, 1.0)), hash21(i + vec2f(1.0, 1.0)), w.x), w.y);
}

/// The studio: one big softbox up and to the left, a dim warm bounce low on
/// the right, darkness elsewhere. dir is a reflected direction, z up.
fn studio(dir: vec3f) -> vec3f {
  let a = dir.xy / max(dir.z, 0.05);
  // A long strip light, seen as a curved band of gloss across the bowl.
  let ax = normalize(vec2f(0.8, 0.45));
  let c = a - vec2f(0.32, -0.18);
  let along = dot(c, ax);
  let across = dot(c, vec2f(-ax.y, ax.x));
  let core = exp(-across * across / 0.00012);
  let strip = (core * 0.7 + smoothstep(0.03, 0.01, abs(across)) * 0.3) * exp(-along * along * 7.0);
  let soft = exp(-dot(c, c) * 6.0) * 0.12;
  let bounce = exp(-length(a - vec2f(-0.5, 0.45)) * 2.5);
  return vec3f(1.0, 0.97, 0.92) * (strip * 1.3 + soft) + vec3f(0.5, 0.32, 0.18) * bounce * 0.25 + vec3f(0.02, 0.025, 0.035);
}

/// The most gold in this pixel's texel or its neighbours: the gold lives on
/// thin lines, so a plain filtered read would halve it.
fn goldNear(p: vec2f) -> vec2f {
  let size = vec2i(textureDimensions(state));
  let ip = vec2i(vec2f(p.x / view.aspect, 1.0 - p.y) * vec2f(size));
  var best = vec2f(0.0);
  for (var j = -2; j <= 2; j++) {
    for (var i = -2; i <= 2; i++) {
      let c = textureLoad(state, clamp(ip + vec2i(i, j), vec2i(0), size - 1), 0);
      best = max(best, vec2f(c.r, c.b));
    }
  }
  return best;
}

fn gdirFor(p: vec2f, d: f32, px: f32) -> vec2f {
  let e = 0.6 * px;
  return normalize(vec2f(fracture(p + vec2f(e, 0.0)) - d, fracture(p + vec2f(0.0, e)) - d) + 1e-6);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = view.aspect;
  let p = vec2f(uv.x * aspect, 1.0 - uv.y);
  let px = 1.0 / max(view.res.y, 1.0);
  let t = view.time;

  // The bowl's curve, and a slow ripple in the glaze.
  let bowl = (p - vec2f(0.6 * aspect, 0.52)) * 0.38;
  let rip = vec2f(vnoise(p * 6.0) - 0.5, vnoise(p * 6.0 + 9.0) - 0.5) * 0.025;
  let nGlaze = normalize(vec3f(-bowl + rip, 1.0));

  // Glaze: near-black tenmoku, breaking to deep blue-green where it ran thin.
  let pool = vnoise(p * 2.2) * 0.6 + vnoise(p * 5.0 + 3.0) * 0.3 + vnoise(p * 13.0) * 0.1;
  var base = mix(vec3f(0.012, 0.014, 0.02), vec3f(0.03, 0.06, 0.07), smoothstep(0.45, 0.85, pool));
  // Iron specks: small round spots, not noise blocks.
  let sc = p * 55.0;
  let sh = hash21(floor(sc));
  let sd = length(fract(sc) - 0.5 - (vec2f(hash21(floor(sc) + 3.3), hash21(floor(sc) + 7.1)) - 0.5) * 0.5);
  base = mix(base, vec3f(0.09, 0.05, 0.03), smoothstep(0.12, 0.05, sd) * step(0.86, sh) * 0.7);
  // Crazing: faint, and only where the glaze pooled thin.
  let craze = crazing(p);
  base += vec3f(0.012, 0.016, 0.018) * smoothstep(1.0 * px, 0.2 * px, craze) * smoothstep(0.5, 0.8, pool);

  // Gloss: the softbox reflected in the glaze, plus the lamp's small spot.
  let view_dir = vec3f(0.0, 0.0, 1.0);
  let rg = reflect(-view_dir, nGlaze);
  var col = base + studio(rg) * 0.12 * view.shine;
  let toLamp = vec3f(view.lamp.xy - p, 0.22);
  let hL = normalize(normalize(toLamp) + view_dir);
  col += vec3f(1.0, 0.86, 0.66) * pow(max(dot(nGlaze, hL), 0.0), 6000.0) * 0.8 * view.lamp.z;
  col += vec3f(1.0, 0.8, 0.55) * 0.012 * view.lamp.z / (1.0 + dot(toLamp.xy, toLamp.xy) * 40.0);

  // The fracture: an open groove, or a raised gold bead where gold has run.
  let d = fracture(p);
  let W = 0.0034;
  if (d < W * 3.0) {
    let g = goldNear(p);
    let gold = smoothstep(0.0, 0.06, g.x);
    let heat = g.y * gold;
    let gdir = gdirFor(p, d, px);
    // Groove: dark, with a faint lit lip on its upper side.
    let groove = smoothstep(0.0016, 0.0006, d);
    col = mix(col, col * 0.1, groove * (1.0 - gold));
    col += vec3f(0.03, 0.035, 0.04) * smoothstep(0.0024, 0.0015, d) * smoothstep(0.0009, 0.0016, d) * (1.0 - gold) * max(dot(gdir, vec2f(-0.6, 0.8)), 0.0);
    let x = clamp(d / W, 0.0, 1.0);
    let hgt = sqrt(max(1.0 - x * x, 0.0));
    let slope = x / max(hgt, 0.12);
    let nGold = normalize(vec3f(-gdir * slope * 0.9 - bowl, 1.0));
    let rgo = reflect(-view_dir, nGold);
    let tint = vec3f(1.0, 0.78, 0.42);
    var metal = tint * (studio(rgo) * 1.1 * view.shine + vec3f(0.22, 0.17, 0.1) * (0.6 + 0.4 * dot(nGold.xy, vec2f(-0.6, 0.6))));
    metal += tint * vec3f(1.0, 0.9, 0.75) * pow(max(dot(nGold, hL), 0.0), 70.0) * 2.0 * view.lamp.z;
    metal *= 0.55 + 0.45 * hgt;
    // Fresh gold is still molten.
    let hot = smoothstep(0.25, 1.0, heat);
    metal = metal * (1.0 - 0.4 * hot) + vec3f(1.0, 0.32, 0.05) * hot * (0.25 + 0.6 * hgt);
    metal += vec3f(1.0, 0.65, 0.3) * pow(heat, 5.0) * hgt * 0.3;
    let cover = smoothstep(W + px, W - px, d) * gold;
    col = mix(col, metal, cover);
    // A little warm light spills onto the glaze around hot gold.
    col += vec3f(1.0, 0.4, 0.1) * heat * 0.35 * exp(-d / 0.006) * (1.0 - cover);
  }

  let vg = length(uv - vec2f(0.55, 0.5));
  col *= 1.0 - 0.45 * vg * vg;
  col = filmic(col * 1.5);
  col += (hash21(uv * view.res + t) - 0.5) / 255.0;
  return vec4f(col, 1.0);
}
