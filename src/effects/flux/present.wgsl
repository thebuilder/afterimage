// Composite: a cheap two-radius bloom over the trail buffer, then tonemap.
import { filmic, dither } from "../../shaders/common.wgsl";

struct Present {
  texel: vec2f,
  intensity: f32,
  time: f32,
}
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> present: Present;

fn blur(uv: vec2f, r: f32) -> vec3f {
  var acc = vec3f(0.0);
  // Eight taps on a ring plus the centre. Not separable, but at two radii it is
  // still one pass and it is enough to sell a glow.
  let o = present.texel * r;
  acc += textureSampleLevel(src, samp, uv, 0.0).rgb * 1.4;
  for (var i = 0; i < 8; i++) {
    let a = f32(i) * 0.7853981634;
    acc += textureSampleLevel(src, samp, uv + vec2f(cos(a), sin(a)) * o, 0.0).rgb;
  }
  return acc / 9.4;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let base = textureSampleLevel(src, samp, uv, 0.0).rgb;
  let glow = blur(uv, 3.0) * 0.45 + blur(uv, 11.0) * 0.55;

  var col = base * 1.15 + glow * 0.65;
  // A deep blue floor keeps the empty regions from being pure black.
  col += vec3f(0.006, 0.010, 0.026);
  col = filmic(col * (0.9 + 0.5 * present.intensity));
  col *= 0.62 + 0.38 * smoothstep(1.30, 0.10, length((uv - 0.5) * vec2f(1.1, 1.0)));
  return vec4f(col + dither(uv, 1.0 / present.texel), 1.0);
}
