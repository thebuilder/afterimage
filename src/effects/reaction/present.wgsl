// Shade the chemical field as a lit surface: B becomes a height map, and the
// normal comes from its gradient.
import { filmic, dither } from "../../shaders/common.wgsl";

struct Present {
  texel: vec2f,
  intensity: f32,
  time: f32,
}
@group(0) @binding(0) var state: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> present: Present;

fn heightAt(uv: vec2f) -> f32 {
  return textureSampleLevel(state, samp, uv, 0.0).g;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let t = present.texel;
  let h = heightAt(uv);
  let hx = heightAt(uv + vec2f(t.x, 0.0)) - heightAt(uv - vec2f(t.x, 0.0));
  let hy = heightAt(uv + vec2f(0.0, t.y)) - heightAt(uv - vec2f(0.0, t.y));

  // Gradient scaled by the texel size so the relief holds up at any resolution.
  let n = normalize(vec3f(-hx * 90.0, -hy * 90.0, 1.0));
  let view = vec3f(0.0, 0.0, 1.0);
  let light = normalize(vec3f(0.42, 0.62, 0.66));

  let dif = max(dot(n, light), 0.0);
  let spec = pow(max(dot(reflect(-light, n), view), 0.0), 48.0);
  let fres = pow(1.0 - max(dot(n, view), 0.0), 3.0);

  // Membrane colour. B settles into a narrow band once the pattern locks, so
  // driving hue from B alone gives one flat colour across the whole frame. The
  // hue follows the feed/kill gradient instead, the same axis the simulation
  // varies along, so the regimes read as regions. That leaves B to do what it
  // is good at, which is separating substrate from growth.
  let regime = clamp(uv.x * 0.72 + (1.0 - uv.y) * 0.28, 0.0, 1.0);
  let teal = vec3f(0.04, 0.62, 0.70);
  let coral = vec3f(1.00, 0.46, 0.30);
  let amber = vec3f(1.00, 0.78, 0.32);
  var growth = mix(teal, coral, smoothstep(0.20, 0.78, regime));
  growth = mix(growth, amber, smoothstep(0.80, 1.0, regime) * 0.55);

  let substrate = vec3f(0.014, 0.038, 0.052);
  var col = mix(substrate, growth, smoothstep(0.04, 0.24, h));

  col *= 0.30 + 0.88 * dif;
  // The specular is tinted by the surface rather than white: an untinted
  // highlight on a pattern this dense bleaches the hue out of the whole image.
  col += mix(growth, vec3f(1.0), 0.35) * spec * 0.60;
  col += vec3f(0.20, 0.70, 0.85) * fres * 0.30;
  // Thin bright rim exactly at the growth front.
  col += mix(growth, vec3f(0.85, 1.0, 0.95), 0.5) * smoothstep(0.22, 0.27, h) * (1.0 - smoothstep(0.27, 0.33, h)) * 0.75;

  col = filmic(col * (0.72 + 0.45 * present.intensity));
  col *= 0.62 + 0.38 * smoothstep(1.30, 0.10, length((uv - 0.5) * vec2f(1.1, 1.0)));
  return vec4f(col + dither(uv, 1.0 / present.texel), 1.0);
}
