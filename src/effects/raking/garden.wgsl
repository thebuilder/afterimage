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
const STONE = vec3f(0.44, 0.43, 0.41);
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

/// Polynomial smooth minimum, so the rings of neighbouring stones merge into
/// one shape instead of meeting at a seam.
fn smin(a: f32, b: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

/// A raked ridge: rounded crest, flatter trough, from a phase in rake widths.
fn ridgeOf(phase: f32) -> f32 {
  let c = 0.5 + 0.5 * cos(phase * TAU);
  return c * c * (3.0 - 2.0 * c);
}

fn garden(p: vec2f) -> Garden {
  let hw = 0.5 * params.res.x / max(params.res.y, 1.0);
  let wide = smoothstep(0.8, 1.4, 2.0 * hw);
  let s = 0.026 * params.rake;
  let warp = simplex2d(p * vec2f(1.6, 2.4) + 3.0);
  // Hand-raked: the depth of the cut wanders a little along the rows.
  let amp = 0.0027 * params.depth * (0.88 + 0.12 * warp);

  var g = Garden(0.0, 0.0, 0.0, 0.0);
  var hs = 0.0;
  var field = 1e3;
  for (var i = 0; i < 3; i++) {
    let st = stoneAt(i, hw);
    let q = (p - st.xy) * vec2f(1.0, 1.18);
    // Stones are not circles: a slow wobble in their outline.
    let a = atan2(q.y, q.x);
    let d = length(q) * (1.0 + 0.09 * sin(a * 3.0 + f32(i) * 2.1) + 0.05 * sin(a * 5.0 + f32(i)));
    let r = st.z;
    let k = clamp(1.0 - (d * d) / (r * r), 0.0, 1.0);
    if (k > 0.0) {
      // Weathered faces: low lumps across the dome.
      let lumps = 1.0 + 0.05 * sin(q.x * 70.0 + f32(i)) * sin(q.y * 64.0 - f32(i) * 2.0);
      hs = max(hs, 0.8 * r * sqrt(k) * lumps);
    }
    g.stone = max(g.stone, smoothstep(r * 1.005, r * 0.97, d));
    g.moss = max(g.moss, smoothstep(r * 1.14, r * 1.02, d) * smoothstep(r * 0.94, r * 1.0, d));
    // Distance out from the stone's edge, merged smoothly with the others.
    field = smin(field, d - r, 0.05);
  }

  // The rake circles each stone a whole number of times, so the outermost
  // ring sits exactly on the border of its zone.
  let rings = floor(mix(4.0, 6.0, wide));
  let zone = rings * s;
  let ring = ridgeOf(field / s) * (1.0 - smoothstep(zone + 0.25 * s, zone + 0.55 * s, field));
  // The straight rows stop short of that border, as the rake lifts before
  // the last ring, so the two patterns never cut across each other.
  let rows = ridgeOf((p.y + 0.014 * warp) / s) * smoothstep(zone + 0.45 * s, zone + 1.1 * s, field);
  g.ridge = ring + rows;
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
  // Gravel grain: every few pixels a grain tilts its own way, so the surface
  // glitters faintly instead of reading as smooth plastic.
  let gc = floor(p * params.res.y * 0.55);
  let tilt = vec2f(hash21(gc), hash21(gc + 31.7)) - 0.5;
  var n = normalize(vec3f(-(hx - g.h) / e + tilt.x * 0.22 * (1.0 - g.stone), -(hy - g.h) / e + tilt.y * 0.22 * (1.0 - g.stone), 1.0));
  // Rock is rough at every scale: pits, chips and a gritty crystalline grain
  // bend the normal so light breaks up across the stone instead of sliding.
  var rough = 0.0;
  if (g.stone > 0.0) {
    let rq = p * 90.0;
    let b1 = vec2f(simplex2d(rq), simplex2d(rq + 17.3));
    let b2 = vec2f(simplex2d(rq * 3.1 + 5.0), simplex2d(rq * 3.1 + 41.0));
    rough = simplex2d(p * 34.0 + 9.0);
    n = normalize(n + vec3f(b1 * 0.2 + b2 * 0.12 + tilt * 0.2, 0.0) * g.stone);
  }

  // Soft shadow: march toward the sun over the height field.
  let horiz = max(length(L.xy), 1e-3);
  let dir = L.xy / horiz;
  let slope = L.z / horiz;
  var shadow = 1.0;
  var t = 0.0012;
  for (var i = 0; i < 16; i++) {
    let ray = g.h + t * slope + 0.0004;
    let dh = ray - heightAt(p + dir * t);
    shadow = min(shadow, clamp(6.0 * dh / t + 0.5, 0.0, 1.0));
    if (shadow < 0.01 || ray > 0.07) { break; }
    t = t * 1.33 + 0.0008;
  }

  let diffuse = max(dot(n, L), 0.0) * shadow;
  // Sky fill from above, cooler than the sun, and less of it in the troughs.
  let cavity = mix(0.86, 1.0, clamp(g.ridge, 0.0, 1.0)) * mix(1.0, 0.9, g.moss);
  let sky = vec3f(0.78, 0.8, 0.84) * (0.5 + 0.25 * n.z) * cavity;

  // Gravel grain, and a few darker pebbles.
  let grain = hash21(floor(p * params.res.y * 0.9));
  var albedo = SAND * (0.93 + 0.1 * grain);
  albedo = mix(albedo, MOSS * (0.8 + 0.4 * grain), g.moss * 0.85);
  // Weathered granite: broad mottling, a salt-and-pepper grain, and pale
  // patches of lichen on the upper faces.
  let speck = 0.8 + 0.12 * simplex2d(p * 14.0) + 0.22 * (grain - 0.5) + 0.08 * rough;
  let lichen = smoothstep(0.35, 0.75, simplex2d(p * 22.0 + 3.0)) * 0.35;
  let rock = mix(STONE * speck, vec3f(0.62, 0.62, 0.55), lichen);
  albedo = mix(albedo, rock, g.stone);

  // A high sun is stronger, but exposure follows it, the way an eye or a
  // camera would, so noon reads as a pale field rather than a white-out.
  let exposure = mix(1.3, 0.62, smoothstep(0.25, 1.1, params.sun.w));
  var col = albedo * (params.sun.rgb * diffuse * exposure + sky * 0.55);

  col *= 1.0 - 0.28 * dot(uv - 0.5, uv - 0.5);
  col += (hash21(uv * params.res) - 0.5) / 255.0;
  return vec4f(pow(col, vec3f(0.92)), 1.0);
}
