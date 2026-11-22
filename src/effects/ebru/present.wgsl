// The tray as seen: the marbled surface with a faint sheen of light on the
// size, darker toward its edges, the stylus hovering over it, and the strip
// of paper that skims the tray clean between patterns.
import { ground, thash } from "./tray.wgsl";

struct View {
  res: vec2f,
  aspect: f32,
  time: f32,
  hint: vec4f,   // stylus: x, y, radius, how visible
  wipe: vec4f,   // skim: front x, active, 0, 0
}
@group(0) @binding(0) var tray: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> view: View;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let a = view.aspect;
  let p = vec2f(uv.x * a, 1.0 - uv.y);
  let px = 1.0 / view.res.y;
  var col = textureSampleLevel(tray, samp, uv, 0.0).rgb;

  // Skimming: behind the strip the tray is clean, the strip itself is a band
  // of grey paper that has taken up some paint, and paint gathers ahead of it.
  if (view.wipe.y > 0.5) {
    let f = view.wipe.x;
    let x = p.x - f;
    let ahead = smoothstep(0.05, 0.0, x) * step(0.0, x);
    col *= 1.0 - 0.35 * ahead;
    let strip = smoothstep(-0.03 - px, -0.03, x) * smoothstep(px, 0.0, x);
    let paper = vec3f(0.62, 0.6, 0.56) * (0.9 + 0.1 * thash(floor(p * 300.0)));
    col = select(col, ground(p), x < -0.03);
    col = mix(col, paper * (0.75 + 0.25 * smoothstep(-0.03, 0.0, x)), strip);
  }

  // Light on the size: a broad soft reflection from the upper right.
  let lightUv = (p - vec2f(a * 0.82, 1.05)) * vec2f(0.8, 1.3);
  col += vec3f(0.05, 0.055, 0.06) * exp(-dot(lightUv, lightUv) * 2.2);
  // The tray darkens toward its rim, and the lower left stays quiet.
  col *= 1.0 - 0.38 * smoothstep(0.35, 0.95, length(uv - 0.5) * 1.25);
  col *= 1.0 - 0.18 * exp(-dot(p * vec2f(1.1, 1.6), p * vec2f(1.1, 1.6)) * 2.0);

  // The stylus over the surface: its shadow and a fine ring of light.
  let h = view.hint;
  if (h.w > 0.001) {
    let sh = length(p - h.xy - vec2f(0.006, -0.009));
    col *= 1.0 - 0.35 * h.w * smoothstep(h.z * 1.6, h.z * 0.4, sh);
    let d = length(p - h.xy);
    let ring = smoothstep(px * 1.6, 0.0, abs(d - h.z)) * h.w;
    col = mix(col, vec3f(0.95, 0.92, 0.85), ring * 0.55);
    col += vec3f(0.9, 0.85, 0.75) * smoothstep(px * 2.5, 0.0, d) * h.w * 0.6;
  }

  // A static dither keeps the dark gradients from banding.
  col += (thash(uv * view.res) - 0.5) / 255.0;
  return vec4f(col, 1.0);
}
