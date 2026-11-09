// Draw the sheet: liquid crystal film over a black backing. Cool, it is black;
// as it warms it passes through the spectrum, rust to gold to green to blue
// to violet, and past its range it goes dark again.
import { simplex2d } from "@vgpu/wgsl-std/noise/simplex";
import { hash21 } from "../../shaders/common.wgsl";

struct View {
  texel: vec2f,
  res: vec2f,
  time: f32,
  aspect: f32,
  _p0: f32,
  _p1: f32,
}
@group(0) @binding(0) var state: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> view: View;

/// The film's colour at heat t: the play of colour of a real thermochromic sheet.
fn crystal(t: f32) -> vec3f {
  let k = array<vec3f, 9>(
    vec3f(0.0, 0.0, 0.0),
    vec3f(0.30, 0.03, 0.02), // rust
    vec3f(0.85, 0.22, 0.03), // copper
    vec3f(0.95, 0.70, 0.10), // gold
    vec3f(0.20, 0.80, 0.25), // green
    vec3f(0.05, 0.75, 0.70), // turquoise
    vec3f(0.08, 0.32, 0.95), // blue
    vec3f(0.36, 0.12, 0.78), // violet
    vec3f(0.05, 0.02, 0.12), // spent: dark again
  );
  let x = clamp((t - 0.03) / 1.28, 0.0, 1.0) * 8.0;
  let i = min(u32(floor(x)), 7u);
  let f = smoothstep(0.0, 1.0, x - f32(i));
  return mix(k[i], k[i + 1u], f);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let asp = vec2f(view.aspect, 1.0);
  let p = uv * asp;
  // The film is not perfectly even: its response varies in faint, still
  // mottles, so the bands of colour are not ruled lines.
  let warp = vec2f(simplex2d(p * 9.0), simplex2d(p * 9.0 + 31.0));
  let t = textureSampleLevel(state, samp, uv + warp * 0.0012, 0.0).r;
  let mottle = 0.9 + 0.1 * simplex2d(p * 14.0);
  var col = crystal(t * (0.99 + 0.02 * simplex2d(p * 16.0))) * mottle;

  // A satin sheet catches a broad soft light from above.
  let sheen = smoothstep(1.1, -0.2, uv.y) * 0.022 + 0.008;
  col += vec3f(0.82, 0.86, 0.95) * sheen * (0.8 + 0.2 * simplex2d(p * 2.0));
  // Fine pressed texture of the film, felt more than seen.
  col *= 0.96 + 0.06 * hash21(floor(uv * view.res / 2.0));

  col *= 1.0 - 0.4 * dot(uv - 0.5, uv - 0.5);
  col += (hash21(uv * view.res) - 0.5) / 255.0;
  return vec4f(pow(max(col, vec3f(0.0)), vec3f(0.95)), 1.0);
}
