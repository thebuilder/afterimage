// The night shore: dark sand, a black sea under a hidden moon, surf rolling
// in, and blue light from the plankton wherever the water is disturbed. The
// glow comes from the sim as a smooth field; the picture turns it into a haze
// plus thousands of single sparks, so it reads as living points, not paint.
import { hash21, filmic, vignette } from "../../shaders/common.wgsl";
import { WAVES, ARRIVE, shore, edge, front, cycle } from "./shore.wgsl";

struct View {
  res: vec2f,
  sea: vec2f,
  origin: vec2f,
  moon: vec2f,
  time: f32,
  aspect: f32,
  surf: f32,
  glow: f32,
}
@group(0) @binding(0) var state: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> view: View;

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2f(1.0, 0.0)), w.x),
             mix(hash21(i + vec2f(0.0, 1.0)), hash21(i + vec2f(1.0, 1.0)), w.x), w.y);
}

/// Points of light: each cell of a fine grid holds one plankton that lights
/// once the glow there passes its own threshold, and twinkles.
fn sparks(p: vec2f, g: f32, t: f32, cellPx: f32, seed: f32, ang: f32) -> f32 {
  // Each layer's grid is turned, so no rows or columns line up.
  let r = mat2x2f(cos(ang), sin(ang), -sin(ang), cos(ang));
  let q = r * p * view.res.y / cellPx;
  let c = floor(q);
  let h = hash21(c + seed);
  let h2 = hash21(c + seed + 17.3);
  let jit = fract(vec2f(h, h2) * 7.31) * 0.7 + 0.15;
  let d = length(fract(q) - jit);
  let lit = smoothstep(h * 0.9 + 0.08, h * 0.9 + 0.5, g);
  let tw = 0.55 + 0.45 * sin(t * (5.0 + 9.0 * h2) + h * 40.0);
  return lit * tw * exp(-d * d * 30.0) * 1.4;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = view.aspect;
  let p = vec2f(uv.x * aspect, 1.0 - uv.y);
  let px = 1.0 / max(view.res.y, 1.0);
  let t = view.time;
  let su = shore(p, view.sea, view.origin);
  let s = su.x;
  let u = su.y;
  let st = textureSampleLevel(state, samp, uv, 0.0);
  let g = st.r + st.b;
  let wet = st.g;

  let e = edge(u, t, view.surf);
  let depth = s - e;
  let water = smoothstep(-1.5 * px, 1.5 * px, depth);

  // Moonlight comes from above, off the top right.
  let toMoon = view.moon - p;
  let moonGlow = exp(-length(toMoon) * 1.6);

  // Sand: cool grain under the moon, ribbed by the tide, darker and glossy
  // where the sea has wet it.
  let grain = hash21(floor(p * view.res.y * 0.75)) - 0.5;
  let warp = vnoise(vec2f(u, s) * 6.0) * 2.5;
  let ribs = 0.5 + 0.5 * sin(s * 130.0 + u * 7.0 + warp * 5.0);
  let ripples = mix(0.5, ribs, 0.35 * vnoise(vec2f(u, s) * 4.0)) * (0.7 + 0.6 * vnoise(vec2f(u, s) * 22.0));
  var sand = vec3f(0.105, 0.098, 0.096) * (1.0 + grain * 0.25 + (ripples - 0.5) * 0.35);
  sand *= 0.75 + 0.6 * moonGlow;
  let wetness = smoothstep(0.05, 0.7, wet);
  let sheen = clamp(1.0 - abs(p.x - view.moon.x) / (0.5 + 0.5 * (view.moon.y - p.y)), 0.0, 1.0);
  let wetSand = vec3f(0.035, 0.042, 0.056) * (0.85 + 0.3 * ripples) + vec3f(0.07, 0.085, 0.11) * sheen * sheen;
  var col = mix(sand, wetSand, wetness);

  // Sea: black-blue, lighter in the swash where it is only a film over sand,
  // with a fine chop that catches the moon.
  let deep = smoothstep(0.0, 0.2, depth);
  var sea = mix(wetSand * 0.75 + vec3f(0.0, 0.008, 0.016), vec3f(0.012, 0.026, 0.052), deep);
  let chop = vnoise(vec2f(u * 34.0 + t * 0.15, s * 55.0 - t * 0.4)) * 0.6 + vnoise(vec2f(u * 90.0 - t * 0.3, s * 120.0 + t * 0.7)) * 0.4;
  sea += vec3f(0.02, 0.028, 0.042) * (chop - 0.4) * (0.4 + sheen) * deep;

  // Crests rolling in, white water where they break, and the lace of foam
  // they leave behind.
  var foam = 0.0;
  var lip = 0.0;
  let froth0 = vnoise(vec2f(u * 18.0, t * 0.7));
  let lace = abs(vnoise(vec2f(u * 28.0, s * 34.0) + vec2f(t * 0.05, 0.0) + warp) - 0.5);
  let laceLine = smoothstep(0.07, 0.0, lace);
  for (var i = 0; i < WAVES; i++) {
    let c = cycle(i, u, t, view.surf);
    let f = front(i, u, t, view.surf);
    let z = s - f.x;
    if (c.x < ARRIVE) {
      // The wave's face is a narrow lit line on its shore side.
      let w = 0.006 + 0.02 * smoothstep(0.0, 1.0, f.x);
      let face = exp(-max(-z, 0.0) / w) * exp(-max(z, 0.0) / (w * 3.0));
      sea += vec3f(0.03, 0.045, 0.07) * face * (1.0 - f.y);
      foam += f.y * exp(-z * z / (0.00012 + 0.0008 * f.x));
      // The breaking lip itself lights up: a crisp line, drawn here rather
      // than in the soft sim so it stays sharp.
      let lw = 0.003 + 0.008 * f.x;
      lip += f.y * f.y * exp(-z * z / (lw * lw)) * (0.6 + 0.4 * froth0);
      // Behind a breaking crest, lace that fades as it is left behind.
      foam += f.y * laceLine * 0.7 * step(0.0, z) * exp(-z / 0.07);
    } else {
      foam += f.y * exp(-z * z / 0.00006);
      lip += f.y * 0.8 * exp(-z * z / 0.000012) * (0.6 + 0.4 * froth0);
      foam += laceLine * 0.5 * f.y * smoothstep(-0.002, 0.02, z) * exp(-z / 0.05);
    }
  }
  let froth = vnoise(vec2f(u * 70.0, s * 140.0) + t * 0.6);
  sea += vec3f(0.22, 0.26, 0.32) * min(foam, 1.0) * (0.4 + 0.6 * froth) * (0.35 + 0.4 * sheen);
  col = mix(col, sea, water);

  // The plankton: a soft haze in the water, sparks on top of it.
  let blue = vec3f(0.06, 0.62, 1.0);
  let cyan = vec3f(0.35, 0.95, 1.0);
  let gl = g + lip * 1.6;
  let haze = pow(gl, 1.4) * (0.1 + 0.08 * water);
  let sp = sparks(p, gl, t, 3.4, 0.0, 0.61) + 0.8 * sparks(p, gl * 0.8, t, 5.3, 7.0, -0.93);
  col += blue * haze * view.glow;
  col += mix(blue, cyan, 0.5) * sp * min(gl + 0.2, 1.8) * 1.6 * view.glow;
  col += vec3f(0.6, 1.0, 1.0) * smoothstep(1.0, 2.6, gl) * 0.3 * view.glow;

  col *= vignette(uv, 0.35);
  col = filmic(col * 1.35);
  col += (hash21(uv * view.res + t) - 0.5) / 255.0;
  return vec4f(col, 1.0);
}
