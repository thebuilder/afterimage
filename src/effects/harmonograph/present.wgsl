// Show the sheet: cream laid paper, ink that darkens where lines cross and
// bleeds faintly into the fibres, and the pen itself riding on the paper.
import { simplex2d } from "@vgpu/wgsl-std/noise/simplex";
import { hash21 } from "../../shaders/common.wgsl";
import { penAt, Swing } from "./pen.wgsl";

struct View {
  swing: Swing,
  res: vec2f,
  tau: f32,
  lift: f32, // 0 on the paper, 1 lifted clear
}
@group(0) @binding(0) var sheet: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> view: View;

const PAPER = vec3f(0.952, 0.935, 0.895);
const INK = vec3f(0.07, 0.09, 0.2);

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = view.res.x / max(view.res.y, 1.0);
  let p = vec2f((uv.x - 0.5) * aspect, 0.5 - uv.y);
  let px = 1.0 / view.res.y;
  let tx = 1.0 / view.res;

  // Laid paper: faint chain lines, a little fibre, uneven tone.
  var paper = PAPER * (0.988 + 0.016 * simplex2d(p * 2.2));
  paper *= 1.0 - 0.006 * smoothstep(0.9, 1.0, abs(fract(p.x * 14.0) * 2.0 - 1.0));
  paper *= 0.992 + 0.016 * hash21(floor(uv * view.res / 1.5));

  let ink = textureSampleLevel(sheet, samp, uv, 0.0).r;
  let halo = 0.25 * (textureSampleLevel(sheet, samp, uv + vec2f(tx.x, 0.0) * 1.6, 0.0).r
    + textureSampleLevel(sheet, samp, uv - vec2f(tx.x, 0.0) * 1.6, 0.0).r
    + textureSampleLevel(sheet, samp, uv + vec2f(0.0, tx.y) * 1.6, 0.0).r
    + textureSampleLevel(sheet, samp, uv - vec2f(0.0, tx.y) * 1.6, 0.0).r);
  let dark = 1.0 - exp(-1.9 * ink) + 0.12 * (1.0 - exp(-1.5 * halo));
  var col = mix(paper, INK, clamp(dark, 0.0, 1.0));

  // The pen: a small steel nib holder seen from above, with its shadow.
  let pen = penAt(view.swing, view.tau);
  let lift = view.lift;
  let sh = length(p - pen - vec2f(0.004, -0.006) * (1.0 + 2.5 * lift));
  col *= 1.0 - 0.3 * smoothstep(0.012 + 0.01 * lift, 0.006, sh);
  let r = length(p - pen);
  let body = smoothstep(0.0085 + px, 0.0085 - px, r);
  let lit = clamp(dot(normalize(p - pen + vec2f(1e-5)), normalize(vec2f(-0.5, 0.7))), 0.0, 1.0);
  let steel = vec3f(0.18, 0.19, 0.21) + vec3f(0.55) * pow(lit, 6.0) * smoothstep(0.003, 0.008, r);
  col = mix(col, steel, body);
  col = mix(col, vec3f(0.06), smoothstep(0.0022 + px, 0.0022 - px, r));

  col *= 1.0 - 0.18 * dot(uv - 0.5, uv - 0.5);
  col += (hash21(uv * view.res) - 0.5) / 255.0;
  return vec4f(col, 1.0);
}
