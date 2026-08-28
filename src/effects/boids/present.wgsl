// Composite: the flock buffer over a cold gradient, with a soft bloom.
import { filmic, dither } from "../../shaders/common.wgsl";

struct Present {
  texel: vec2f,
  glow: f32,
  time: f32,
}
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> present: Present;

fn ring(uv: vec2f, r: f32) -> vec3f {
  var acc = vec3f(0.0);
  let o = present.texel * r;
  for (var i = 0; i < 8; i++) {
    let a = f32(i) * 0.7853981634;
    acc += textureSampleLevel(src, samp, uv + vec2f(cos(a), sin(a)) * o, 0.0).rgb;
  }
  return acc / 8.0;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let base = textureSampleLevel(src, samp, uv, 0.0).rgb;
  let glow = ring(uv, 4.0) * 0.6 + ring(uv, 13.0) * 0.5;

  // Dusk gradient behind the flock.
  var col = mix(vec3f(0.020, 0.030, 0.062), vec3f(0.055, 0.045, 0.075), uv.y);
  col += vec3f(0.10, 0.09, 0.14) * pow(max(1.0 - length(uv - vec2f(0.5, 0.22)) * 1.2, 0.0), 3.0);

  col += base * 1.25 + glow * present.glow * 0.8;

  col = filmic(col * 1.15);
  col *= 0.64 + 0.36 * smoothstep(1.30, 0.10, length((uv - 0.5) * vec2f(1.1, 1.0)));
  return vec4f(col + dither(uv, 1.0 / present.texel), 1.0);
}
