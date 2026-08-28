// Shade the dye field. Colour comes from concentration, relief from its gradient.
import { filmic, dither, palette } from "../../shaders/common.wgsl";

struct Present {
  texel: vec2f,
  time: f32,
  glow: f32,
}
@group(0) @binding(0) var state: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> present: Present;

fn dyeAt(uv: vec2f) -> f32 {
  return textureSampleLevel(state, samp, uv, 0.0).b;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let t = present.texel;
  let s = textureSampleLevel(state, samp, uv, 0.0);
  let dye = s.b;
  let speed = length(s.rg);

  let dx = dyeAt(uv + vec2f(t.x, 0.0)) - dyeAt(uv - vec2f(t.x, 0.0));
  let dy = dyeAt(uv + vec2f(0.0, t.y)) - dyeAt(uv - vec2f(0.0, t.y));
  let n = normalize(vec3f(-dx * 24.0, -dy * 24.0, 1.0));
  let light = normalize(vec3f(0.42, 0.58, 0.70));

  // Hue tracks concentration, so the thin leading edge and the dense core read
  // as different pigments the way real ink in water does.
  let tint = palette(0.56 + dye * 0.28 + speed * 0.06,
    vec3f(0.48, 0.40, 0.52),
    vec3f(0.45, 0.38, 0.42),
    vec3f(1.0, 1.0, 1.0),
    vec3f(0.02, 0.20, 0.52));

  var col = vec3f(0.006, 0.010, 0.020);
  let mass = smoothstep(0.010, 0.90, dye);
  col += tint * mass * 1.15;
  col += tint * max(dot(n, light), 0.0) * mass * 0.55;
  // Fast-moving dye picks up a hot edge.
  col += vec3f(1.0, 0.52, 0.68) * smoothstep(0.35, 1.4, speed) * mass * 0.55;
  // The filament edge, where concentration changes fastest.
  col += vec3f(0.70, 0.95, 1.0) * length(vec2f(dx, dy)) * 5.5 * present.glow;

  col = filmic(col * 1.25);
  col *= 0.62 + 0.38 * smoothstep(1.30, 0.10, length((uv - 0.5) * vec2f(1.1, 1.0)));
  return vec4f(col + dither(uv, 1.0 / present.texel), 1.0);
}
