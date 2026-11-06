// Raking Light: a raked gravel garden lit by a sun you hold. The relief is
// fixed; only the light moves. High light flattens it to a pale field, low
// raking light pulls every groove and stone shadow out of the surface.
import { simplex2d } from "@vgpu/wgsl-std/noise/simplex";
import { hash21 } from "../../shaders/common.wgsl";

struct Params {
  light: vec4f,
  sun: vec4f,
  res: vec2f,
  time: f32,
  rake: f32,
  depth: f32,
  drift: f32,
  _p0: f32,
  _p1: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

const TAU: f32 = 6.2831853;
const SAND = vec3f(0.95, 0.9, 0.82);
const STONE = vec3f(0.42, 0.41, 0.40);
const MOSS = vec3f(0.34, 0.36, 0.26);

struct Garden {
  h: f32,
  stone: f32,
  moss: f32,
  ridge: f32,
}

fn stoneAt(i: i32, hw: f32) -> vec3f {
  // x as a fraction of the half-width so the composition survives any aspect;
  // portrait screens get a taller, tighter arrangement with smaller stones.
  let wide = smoothstep(0.8, 1.4, 2.0 * hw);
  var land = vec3f(0.44 * hw, 0.31, 0.04);
  var tall = vec3f(-0.4 * hw, 0.38, 0.032);
  if (i == 0) {
    land = vec3f(0.12 * hw, 0.07, 0.092);
    tall = vec3f(0.18 * hw, 0.12, 0.066);
  } else if (i == 1) {
    land = vec3f(0.56 * hw, -0.18, 0.058);
    tall = vec3f(0.45 * hw, -0.16, 0.042);
  }
  return mix(tall, land, wide);
}

fn garden(p: vec2f) -> Garden {
  let hw = 0.5 * params.res.x / max(params.res.y, 1.0);
  let spacing = 0.026 * params.rake;
  let amp = 0.0027 * params.depth;
  let warp = simplex2d(p * vec2f(1.6, 2.4) + 3.0);

  // Straight rows, gently wandering, as a rake drawn across the whole garden.
  let straight = 0.5 + 0.5 * cos((p.y + 0.014 * warp) / spacing * TAU);

  var g = Garden(0.0, 0.0, 0.0, straight);
  var hs = 0.0;
  var nearest = 1e3;
  var ringW = 0.0;
  var ring = 0.0;
  for (var i = 0; i < 3; i++) {
    let s = stoneAt(i, hw);
    let q = (p - s.xy) * vec2f(1.0, 1.18);
    // Stones are not circles: a slow wobble in their outline.
    let a = atan2(q.y, q.x);
    let d = length(q) * (1.0 + 0.09 * sin(a * 3.0 + f32(i) * 2.1) + 0.05 * sin(a * 5.0 + f32(i)));
    let r = s.z;
    let k = clamp(1.0 - (d * d) / (r * r), 0.0, 1.0);
    hs = max(hs, 0.85 * r * sqrt(k));
    g.stone = max(g.stone, smoothstep(r * 1.005, r * 0.97, d));
    g.moss = max(g.moss, smoothstep(r * 1.14, r * 1.02, d) * smoothstep(r * 0.94, r * 1.0, d));
    // Concentric rings around each stone, out to a zone the rake went round.
    let zone = r * mix(2.0, 2.5, smoothstep(0.8, 1.4, 2.0 * hw)) + mix(0.02, 0.03, smoothstep(0.8, 1.4, 2.0 * hw));
    if (d < nearest) {
      nearest = d;
      ringW = smoothstep(zone + 0.006, zone - 0.006, d);
      ring = 0.5 + 0.5 * cos((d - r) / spacing * TAU);
    }
  }
  g.ridge = mix(straight, ring, ringW);
  g.h = max(amp * g.ridge, hs);
  return g;
}

fn heightAt(p: vec2f) -> f32 {
  return garden(p).h;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = params.res.x / max(params.res.y, 1.0);
  let p = vec2f((uv.x - 0.5) * aspect, 0.5 - uv.y);
  let L = normalize(params.light.xyz);

  let g = garden(p);
  let e = 1.25 / params.res.y;
  let hx = heightAt(p + vec2f(e, 0.0));
  let hy = heightAt(p + vec2f(0.0, e));
  let n = normalize(vec3f(-(hx - g.h) / e, -(hy - g.h) / e, 1.0));

  // Soft shadow: march toward the sun over the height field.
  let horiz = max(length(L.xy), 1e-3);
  let dir = L.xy / horiz;
  let slope = L.z / horiz;
  var shadow = 1.0;
  var t = 0.0012;
  for (var i = 0; i < 16; i++) {
    let ray = g.h + t * slope + 0.0004;
    let dh = ray - heightAt(p + dir * t);
    shadow = min(shadow, clamp(10.0 * dh / t + 0.5, 0.0, 1.0));
    if (shadow < 0.01 || ray > 0.07) { break; }
    t = t * 1.33 + 0.0008;
  }

  let diffuse = max(dot(n, L), 0.0) * shadow;
  // Sky fill from above, cooler than the sun, and less of it in the troughs.
  let cavity = mix(0.86, 1.0, g.ridge) * mix(1.0, 0.9, g.moss);
  let sky = vec3f(0.78, 0.8, 0.84) * (0.5 + 0.25 * n.z) * cavity;

  // Gravel grain, and a few darker pebbles.
  let grain = hash21(floor(p * params.res.y * 0.9));
  var albedo = SAND * (0.93 + 0.1 * grain);
  albedo = mix(albedo, MOSS * (0.8 + 0.4 * grain), g.moss * 0.85);
  // Weathered granite: broad mottling and a fine grain, no blotches.
  let speck = 0.82 + 0.12 * simplex2d(p * 14.0) + 0.1 * (grain - 0.5);
  albedo = mix(albedo, STONE * speck, g.stone);

  // A high sun is stronger, but exposure follows it, the way an eye or a
  // camera would, so noon reads as a pale field rather than a white-out.
  let exposure = mix(1.3, 0.62, smoothstep(0.25, 1.1, params.sun.w));
  var col = albedo * (params.sun.rgb * diffuse * exposure + sky * 0.55);
  // Wet-looking sheen on the stones when the light comes low across them.
  let hv = normalize(L + vec3f(0.0, 0.0, 1.0));
  col += params.sun.rgb * pow(max(dot(n, hv), 0.0), 30.0) * 0.35 * g.stone * shadow;

  col *= 1.0 - 0.28 * dot(uv - 0.5, uv - 0.5);
  col += (hash21(uv * params.res) - 0.5) / 255.0;
  return vec4f(pow(col, vec3f(0.92)), 1.0);
}
