// Draw the land as a survey map on cream paper: hypsometric tints, hill
// shading, brown contour lines with every fifth one heavier, a dark coast,
// and blue water-lines that ring the shore out to sea. Height is a slowly
// drifting terrain plus whatever the pointer has raised.
import { hash21 } from "../../shaders/common.wgsl";

struct View {
  texel: vec2f,
  res: vec2f,
  slope: vec2f,  // which way the land rises across the screen
  time: f32,
  aspect: f32,
  interval: f32, // contour interval
  sea: f32,      // sea level
}
@group(0) @binding(0) var state: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> view: View;

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/// Terrain that changes slowly: each octave drifts its own way, so ridges
/// shift and coasts creep instead of the whole map sliding.
fn terrain(p: vec2f, t: f32) -> f32 {
  var sum = 0.0;
  var amp = 0.5;
  var q = p;
  let rot = mat2x2f(0.8, -0.6, 0.6, 0.8);
  for (var i = 0; i < 5; i++) {
    let drift = vec2f(cos(f32(i) * 2.1), sin(f32(i) * 2.1)) * t * (0.012 + 0.006 * f32(i));
    sum += amp * vnoise(q + drift + f32(i) * 17.3);
    q = rot * q * 2.03;
    amp *= 0.5;
  }
  return sum;
}

/// Cubic B-spline lookup from four bilinear taps, so contours of the raised
/// land are smooth curves rather than the kinked lines of a bilinear grid.
fn raised(uv: vec2f) -> f32 {
  let size = 1.0 / view.texel;
  let p = uv * size - 0.5;
  let i = floor(p);
  let f = p - i;
  let w0 = (1.0 - f) * (1.0 - f) * (1.0 - f) / 6.0;
  let w1 = (4.0 - 6.0 * f * f + 3.0 * f * f * f) / 6.0;
  let w2 = (1.0 + 3.0 * f + 3.0 * f * f - 3.0 * f * f * f) / 6.0;
  let w3 = f * f * f / 6.0;
  let g0 = w0 + w1;
  let g1 = w2 + w3;
  let h0 = (i - 0.5 + w1 / g0) * view.texel;
  let h1 = (i + 1.5 + w3 / g1) * view.texel;
  let a = textureSampleLevel(state, samp, vec2f(h0.x, h0.y), 0.0).r;
  let b = textureSampleLevel(state, samp, vec2f(h1.x, h0.y), 0.0).r;
  let c = textureSampleLevel(state, samp, vec2f(h0.x, h1.y), 0.0).r;
  let d = textureSampleLevel(state, samp, vec2f(h1.x, h1.y), 0.0).r;
  return mix(mix(d, c, g0.x), mix(b, a, g0.x), g0.y);
}

/// Antialiased line at every whole number of x, `width` pixels wide.
fn isoline(x: f32, fw: f32, width: f32) -> f32 {
  let d = abs(fract(x + 0.5) - 0.5) / max(fw, 1e-5);
  return 1.0 - smoothstep(width * 0.5 - 0.5, width * 0.5 + 0.5, d);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = view.aspect;
  let s = vec2f(uv.x * aspect, 1.0 - uv.y);

  // Height: drifting terrain, tilted so the land gathers away from the
  // headline, plus what the hand has raised.
  let base = terrain(s * 2.1, view.time) - 0.5;
  let tilt = dot(s - vec2f(0.5 * aspect, 0.5), view.slope);
  let h = base * 0.62 + tilt + raised(uv) - view.sea;

  // Everything that needs screen derivatives is taken here, at the top level.
  let lv = h / view.interval;
  let fw = fwidth(lv);
  let gx = dpdx(h);
  let gy = dpdy(h);
  let contour = isoline(lv, fw, 1.0);
  let index = isoline(lv / 5.0, fw / 5.0, 2.0);
  let coast = 1.0 - smoothstep(0.7, 1.7, abs(h) / max(fwidth(h), 1e-6));
  // Water-lines: rings parallel to the shore, packed close near land and
  // spreading out to sea, the way old charts draw it.
  let wl = sqrt(max(-h, 0.0)) / 0.055;
  let water = isoline(wl, fwidth(wl), 1.0);

  // Paper.
  let fibre = hash21(floor(uv * view.res * 0.5)) * 0.5 + 0.5 * hash21(floor(uv * view.res));
  let paper = vec3f(0.955, 0.93, 0.865) * (0.985 + 0.03 * fibre);
  var col = paper;

  let land = smoothstep(-0.0005, 0.0005, h);
  // Hypsometric tints, kept pale so the lines carry the map.
  let t1 = vec3f(0.84, 0.88, 0.74);
  let t2 = vec3f(0.92, 0.88, 0.72);
  let t3 = vec3f(0.89, 0.80, 0.66);
  let t4 = vec3f(0.95, 0.93, 0.89);
  var tint = mix(t1, t2, smoothstep(0.04, 0.14, h));
  tint = mix(tint, t3, smoothstep(0.16, 0.3, h));
  tint = mix(tint, t4, smoothstep(0.34, 0.46, h));
  // Hill shading, lit from the upper left as maps always are.
  let px = 1.0 / max(view.res.y, 1.0);
  let grad = vec2f(gx, -gy) / px;
  let shade = clamp(1.0 + dot(grad, vec2f(0.55, -0.55)) * 0.16, 0.76, 1.1);
  let landCol = paper * tint / vec3f(0.955, 0.93, 0.865) * shade;
  // The sea: pale blue, deepening a little offshore.
  let seaCol = mix(vec3f(0.80, 0.88, 0.90), vec3f(0.70, 0.81, 0.87), smoothstep(0.0, 0.25, -h)) * (0.985 + 0.03 * fibre);
  col = mix(seaCol, landCol, land);

  // Graticule, faint, every quarter of the screen height.
  let gr = s / 0.25;
  let grid = max(isoline(gr.x, fwidth(gr.x), 1.0), isoline(gr.y, fwidth(gr.y), 1.0));
  col = mix(col, vec3f(0.45, 0.55, 0.62), grid * 0.22);

  // Lines.
  let brown = vec3f(0.56, 0.34, 0.18);
  col = mix(col, brown, contour * 0.55 * land);
  col = mix(col, brown * 0.8, index * 0.75 * land);
  let fade = 1.0 - smoothstep(0.08, 0.32, -h);
  col = mix(col, vec3f(0.3, 0.5, 0.66), water * 0.55 * fade * (1.0 - land));
  col = mix(col, vec3f(0.16, 0.2, 0.27), coast);

  col += (hash21(uv * view.res + fract(view.time) * 13.0) - 0.5) / 255.0;
  return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0);
}
