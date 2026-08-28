// Prism: a Voronoi fracture lit as cut glass, each shard refracting its own way.
import { voronoi2d } from "@vgpu/wgsl-std/noise";
import { simplex2d } from "@vgpu/wgsl-std/noise/simplex";
import { centered, filmic, dither, hash21, rot2 } from "./common.wgsl";

struct Params {
  res: vec2f,
  mouse: vec2f,
  time: f32,
  shards: f32,
  refraction: f32,
  chroma: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

/// What a shard refracts. No scene exists behind the glass, so one is invented:
/// a slow nebula gradient that the offsets have something to bite into.
fn backdrop(p: vec2f, t: f32) -> vec3f {
  let n = simplex2d(p * 1.1 + vec2f(t * 0.06, -t * 0.04));
  let m = simplex2d(p * 2.3 - vec2f(t * 0.05, 0.0));
  var c = mix(vec3f(0.03, 0.06, 0.14), vec3f(0.30, 0.12, 0.42), n * 0.5 + 0.5);
  c = mix(c, vec3f(0.02, 0.42, 0.48), smoothstep(0.15, 0.9, m) * 0.6);
  c += vec3f(0.55, 0.30, 0.12) * pow(max(1.0 - length(p - vec2f(0.6, 0.35)) * 0.8, 0.0), 3.0);
  return c;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = centered(uv, params.res);
  let t = params.time;
  let m = (params.mouse - 0.5) * vec2f(1.0, -1.0);

  // The lattice drifts and rotates, so shards slide past each other instead of
  // sitting in a fixed mosaic.
  let q = rot2(t * 0.03) * p * params.shards + vec2f(t * 0.05, t * 0.03);
  let v = voronoi2d(q);

  // Per-shard identity: one hash gives it a facet angle and a thickness.
  let id = hash21(vec2f(v.cell));
  let facet = rot2(id * 6.2831853);
  let thickness = 0.55 + id * 0.9;

  // Refraction offset. A flat facet bends everything behind it the same way,
  // which is why the offset is constant across a shard rather than per pixel.
  let bend = facet * vec2f(1.0, 0.0) * params.refraction * thickness;
  let toward = m * 0.35;

  // Chromatic split: each channel refracts by a slightly different amount.
  let sep = params.chroma * 0.06 * thickness;
  let r = backdrop(p + bend * (1.0 + sep) + toward, t).r;
  let g = backdrop(p + bend + toward, t).g;
  let b = backdrop(p + bend * (1.0 - sep) + toward, t).b;
  var col = vec3f(r, g, b);

  // Facet shading: brighten by how the shard is angled to a fixed key light.
  let n2 = normalize(vec3f(facet * vec2f(0.6, 0.0), 1.0));
  col *= 0.30 + 0.95 * max(dot(n2, normalize(vec3f(0.4, 0.6, 0.7))), 0.0);

  // Edges. `f1` is the distance to the nearest centre, which says nothing about
  // where the border is; the gap `f2 - f1` goes to zero exactly on it.
  let edge = v.f2 - v.f1;
  let w = max(fwidth(edge), 0.0035) * 1.6;
  let seam = 1.0 - smoothstep(0.0, w * 1.6, edge);
  col += vec3f(0.75, 0.95, 1.0) * seam * 1.1;
  // A thin caustic just inside the seam, where a real bevel would focus light.
  col += vec3f(1.0, 0.86, 0.62) * smoothstep(w * 1.6, w * 4.0, edge) * (1.0 - smoothstep(w * 4.0, w * 9.0, edge)) * 0.35;

  col = filmic(col * 1.05);
  col *= 0.62 + 0.38 * smoothstep(1.30, 0.10, length((uv - 0.5) * vec2f(1.1, 1.0)));
  return vec4f(col + dither(uv, params.res), 1.0);
}
