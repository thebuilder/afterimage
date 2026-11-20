// The sheet as seen: warm washi with fibres, sumi ink from pale grey wash to
// deep black, wet ink a touch darker and glossier, a vermilion seal, and a
// faint shadow of the brush tip under the pointer.
import { fibres, phash, pnoise } from "./paper.wgsl";
import { hash21 } from "../../shaders/common.wgsl";

struct View {
  res: vec2f,
  aspect: f32,
  time: f32,
  hint: vec4f,     // brush tip: x, y, radius, visibility
  seal: vec4f,     // seal centre x, y, half size, visibility
  ink: f32,
  _p0: f32,
  _p1: f32,
  _p2: f32,
}
@group(0) @binding(0) var state: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> view: View;

fn sealMark(q: vec2f) -> f32 {
  // A carved square seal: a border and a few cut strokes, all a little worn.
  let a = abs(q);
  let box = max(a.x, a.y);
  var ink = step(box, 1.0);
  let border = step(0.8, box) * step(box, 0.88);
  ink *= 1.0 - border;
  // Cut strokes on a coarse grid.
  let g = floor((q + 1.0) * 2.5);
  let f = fract((q + 1.0) * 2.5) - 0.5;
  let hv = phash(g + 3.0);
  var cut = 0.0;
  if (box < 0.78) {
    let horiz = abs(f.y) < 0.11 && hv > 0.35;
    let vert = abs(f.x) < 0.11 && hv < 0.6;
    cut = select(0.0, 1.0, horiz || vert);
  }
  ink *= 1.0 - cut;
  // Worn: speckled where the paste did not take.
  ink *= step(0.18, pnoise(q * 22.0) * 0.7 + phash(floor(q * 60.0)) * 0.3);
  return ink;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let a = view.aspect;
  let p = vec2f(uv.x * a, 1.0 - uv.y);
  let s = textureSampleLevel(state, samp, uv, 0.0);

  // Paper: warm, with fibres, grain and a soft fall of light.
  let fib = fibres(p);
  let grain = pnoise(p * 420.0) * 0.6 + pnoise(p * 90.0) * 0.4;
  var paper = vec3f(0.95, 0.92, 0.85) * (0.965 + 0.05 * grain) + vec3f(0.035, 0.03, 0.02) * fib;
  paper *= 0.9 + 0.1 * smoothstep(1.4, 0.2, length(p - vec2f(a * 0.35, 0.95)));

  // Ink: pale washes read grey-blue, heavy ink near black.
  let P = (s.g + s.r * 0.9) * view.ink;
  let dark = 1.0 - exp(-P * 1.9);
  let wash = vec3f(0.42, 0.43, 0.47);
  let deep = vec3f(0.035, 0.035, 0.045);
  let inkCol = mix(wash, deep, smoothstep(0.15, 0.85, dark));
  var col = mix(paper, inkCol, smoothstep(0.0, 1.0, dark * 1.08));
  // Fibres show through thin ink.
  col += vec3f(0.03) * fib * (1.0 - dark) * dark * 2.0;
  // Wet ink: darker, with a faint sheen.
  let wet = smoothstep(0.05, 0.5, s.b);
  col *= 1.0 - 0.06 * wet;
  col += vec3f(0.05) * wet * dark * smoothstep(0.4, 0.9, pnoise(p * 30.0 + view.time * 0.2));

  // The seal.
  if (view.seal.w > 0.0) {
    let q = (p - view.seal.xy) / view.seal.z;
    if (max(abs(q.x), abs(q.y)) < 1.1) {
      let m = sealMark(q) * view.seal.w;
      let red = vec3f(0.78, 0.16, 0.1) * (0.92 + 0.08 * grain);
      col = mix(col, col * red * 1.15, m * 0.9);
    }
  }

  // The brush tip's shadow while the pointer hovers.
  if (view.hint.w > 0.0) {
    let d = length(p - view.hint.xy);
    col *= 1.0 - 0.1 * view.hint.w * smoothstep(view.hint.z * 1.6, view.hint.z * 0.4, d);
  }

  col = pow(col, vec3f(1.04));
  col += (hash21(uv * view.res + fract(view.time) * 17.0) - 0.5) / 255.0;
  return vec4f(col, 1.0);
}
