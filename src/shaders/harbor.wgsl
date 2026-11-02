// Lowlight Harbor: a pixel-art harbour at dusk. The lighthouse beam follows the
// pointer, the water mirrors everything above it, and every pixel is dithered
// onto a sixteen-colour palette that can be swapped by index.
import { hash11 } from "./common.wgsl";

struct Params {
  res: vec2f,
  mouse: vec2f,
  time: f32,
  palette: f32,
  rows: f32,
  beam: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

// Slot order is shared across palettes: 0-10 a dark-to-light ramp, 11-14 water, 15 lamp.
const DUSK = array<vec3f, 16>(
  vec3f(0.051, 0.043, 0.118),
  vec3f(0.106, 0.086, 0.212),
  vec3f(0.173, 0.129, 0.322),
  vec3f(0.267, 0.188, 0.431),
  vec3f(0.404, 0.251, 0.498),
  vec3f(0.573, 0.302, 0.525),
  vec3f(0.761, 0.357, 0.490),
  vec3f(0.910, 0.463, 0.435),
  vec3f(1.000, 0.627, 0.443),
  vec3f(1.000, 0.788, 0.541),
  vec3f(1.000, 0.945, 0.788),
  vec3f(0.094, 0.165, 0.290),
  vec3f(0.141, 0.275, 0.420),
  vec3f(0.239, 0.435, 0.561),
  vec3f(0.561, 0.714, 0.769),
  vec3f(1.000, 0.875, 0.478),
);
const FROST = array<vec3f, 16>(
  vec3f(0.027, 0.051, 0.078),
  vec3f(0.059, 0.114, 0.169),
  vec3f(0.090, 0.188, 0.290),
  vec3f(0.122, 0.290, 0.400),
  vec3f(0.184, 0.416, 0.502),
  vec3f(0.290, 0.549, 0.588),
  vec3f(0.435, 0.690, 0.659),
  vec3f(0.624, 0.816, 0.706),
  vec3f(0.788, 0.902, 0.753),
  vec3f(0.910, 0.957, 0.847),
  vec3f(1.000, 1.000, 1.000),
  vec3f(0.047, 0.102, 0.180),
  vec3f(0.075, 0.204, 0.329),
  vec3f(0.114, 0.353, 0.478),
  vec3f(0.561, 0.827, 0.878),
  vec3f(0.961, 0.969, 0.659),
);
const EMBER = array<vec3f, 16>(
  vec3f(0.071, 0.031, 0.024),
  vec3f(0.149, 0.063, 0.031),
  vec3f(0.239, 0.090, 0.043),
  vec3f(0.345, 0.125, 0.055),
  vec3f(0.478, 0.173, 0.063),
  vec3f(0.627, 0.227, 0.071),
  vec3f(0.776, 0.306, 0.078),
  vec3f(0.894, 0.416, 0.110),
  vec3f(0.973, 0.565, 0.173),
  vec3f(1.000, 0.753, 0.290),
  vec3f(1.000, 0.941, 0.690),
  vec3f(0.102, 0.055, 0.078),
  vec3f(0.180, 0.086, 0.125),
  vec3f(0.290, 0.141, 0.188),
  vec3f(0.722, 0.541, 0.439),
  vec3f(1.000, 0.949, 0.478),
);

const H: f32 = 0.34;

var<private> A: f32;
var<private> PU: f32;
var<private> LX: f32;
var<private> Y0: f32;
var<private> Y1: f32;
var<private> MOON: vec2f;
var<private> LAMP: vec2f;
var<private> AIM: vec2f;
var<private> T: f32;
var<private> PAR: f32;

fn h2(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }

fn n1(x: f32) -> f32 {
  let i = floor(x);
  var f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash11(i), hash11(i + 1.0), f);
}

fn fbm(x0: f32) -> f32 {
  var v = 0.0;
  var a = 0.5;
  var x = x0;
  for (var i = 0; i < 5; i++) {
    v += a * n1(x);
    x = x * 2.03 + 11.7;
    a *= 0.5;
  }
  return v;
}

fn layerH(i: i32, x: f32) -> f32 {
  if (i == 0) { return H + 0.05 + 0.30 * pow(fbm(x * 1.9 + 3.0), 1.4); }
  if (i == 1) { return H + 0.02 + 0.17 * fbm(x * 3.4 + 19.0); }
  return H - 0.002 + 0.08 * fbm(x * 6.5 + 41.0);
}

fn islandH(x: f32) -> f32 {
  let m = max(0.0, 1.0 - abs(x - LX) / 0.16);
  return H - 0.01 + 0.095 * pow(m, 1.3) + 0.012 * n1(x * 70.0) * m;
}

/// Everything above the waterline. The water calls this again at a mirrored point.
fn above(q: vec2f) -> vec3f {
  let t = clamp((q.y - H) / (1.0 - H), 0.0, 1.0);
  var col = mix(DUSK[8], DUSK[6], smoothstep(0.0, 0.18, t));
  col = mix(col, DUSK[4], smoothstep(0.12, 0.42, t));
  col = mix(col, DUSK[2], smoothstep(0.38, 0.75, t));
  col = mix(col, DUSK[1], smoothstep(0.7, 1.0, t));

  // Stars: one hash per art pixel, each on its own twinkle clock.
  let s = h2(floor(q / PU));
  if (s > 0.992) {
    let tw = 0.5 + 0.5 * sin(T * (1.5 + fract(s * 91.0) * 5.0) + s * 300.0);
    col = mix(col, DUSK[10], tw * smoothstep(H + 0.12, H + 0.5, q.y));
  }

  // Moon, with craters drawn as coarse 3x3-pixel blocks.
  let md = length(q - MOON);
  col += DUSK[9] * exp(-md * 7.0) * 0.22 + DUSK[10] * exp(-md * 22.0) * 0.25;
  if (md < 0.062) {
    var mc = DUSK[10];
    if (h2(floor((q - MOON) / (PU * 3.0)) + 7.0) > 0.78) { mc = DUSK[9]; }
    if (dot(q - MOON, normalize(vec2f(-1.0, -0.6))) > 0.042) { mc = DUSK[9]; }
    col = mc;
  }

  // A shooting star every seven seconds, from a hashed start and heading.
  let cyc = floor(T / 7.0);
  let age = T - cyc * 7.0;
  if (age < 1.4) {
    let st = vec2f(A * (0.3 + 0.6 * hash11(cyc * 3.1)), 0.8 + 0.15 * hash11(cyc * 5.7));
    let ang = select(-0.45 - 0.3 * hash11(cyc), 3.14159 + 0.45 + 0.3 * hash11(cyc), hash11(cyc * 9.3) < 0.5);
    let d = vec2f(cos(ang), sin(ang));
    let head = st + d * age * 0.75;
    let tail = head - d * min(age, 0.35) * 0.75;
    let pa = q - tail;
    let ba = head - tail;
    let hh = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
    if (length(pa - ba * hh) < PU * 0.95) {
      col = mix(col, DUSK[10], clamp(hh * (1.0 - age / 1.4) * 1.3, 0.0, 1.0));
    }
  }

  // Three ridgelines, far to near, rim-lit on the slopes that face the moon.
  for (var i = 0; i < 3; i++) {
    let fi = f32(i);
    let x = q.x + PAR * (0.015 + 0.035 * fi);
    let hy = layerH(i, x);
    if (q.y < hy) {
      var lc = DUSK[2];
      var rim = DUSK[4];
      var rimW = 1.5;
      var fogA = 0.15;
      if (i == 0) { lc = mix(DUSK[4], DUSK[5], 0.5); rim = DUSK[8]; rimW = 2.5; fogA = 0.55; }
      if (i == 1) { lc = DUSK[3]; rim = DUSK[5]; fogA = 0.35; }
      let e = PU * 1.5;
      let dh = (layerH(i, x + e) - layerH(i, x - e)) / (2.0 * e);
      let lit = dot(normalize(vec2f(-dh, 1.0)), normalize(MOON - q));
      if (hy - q.y < PU * rimW && lit > 0.55) { lc = rim; }
      if (i == 0 && q.y > H + 0.27) { lc = mix(lc, DUSK[9], 0.55); }
      let fog = (1.0 - smoothstep(H, H + 0.09 + 0.05 * (2.0 - fi), q.y)) * fogA;
      col = mix(lc, DUSK[7], fog);
    }
  }

  // The beam: a widening cone from the lamp toward the pointer, with dust in it.
  var bd = AIM - LAMP;
  bd = select(normalize(bd), vec2f(1.0, 0.0), length(bd) < 1e-3);
  let v = q - LAMP;
  let along = dot(v, bd);
  let perp = abs(v.x * bd.y - v.y * bd.x);
  let cone = along * 0.115 + 0.007;
  let fwd = step(0.0, along);
  let beam = smoothstep(cone, cone * 0.45, perp) * fwd * exp(-along * 0.85) * params.beam;
  let core = smoothstep(cone * 0.3, 0.0, perp) * fwd * exp(-along * 1.6) * params.beam;
  let mote = step(0.988, h2(floor((q + vec2f(T * 0.01, T * 0.004)) / PU))) * beam;
  col = mix(col, DUSK[15], clamp(beam * 0.6 + core * 0.5 + mote, 0.0, 1.0));
  col += DUSK[15] * exp(-length(v) * 34.0) * 0.9;

  // Island.
  if (q.y < islandH(q.x)) {
    var ic = DUSK[1];
    let e = PU * 1.5;
    let dh = (islandH(q.x + e) - islandH(q.x - e)) / (2.0 * e);
    if (islandH(q.x) - q.y < PU * 1.5 && dot(normalize(vec2f(-dh, 1.0)), normalize(MOON - q)) > 0.5) { ic = DUSK[3]; }
    col = ic;
  }

  // Lighthouse: striped tapering tower, gallery, lantern room, roof.
  let ax = q.x - LX;
  let side = sign(MOON.x - LX);
  if (q.y > Y0 - 0.01 && q.y < Y1) {
    let f = (q.y - Y0) / (Y1 - Y0);
    let hw = mix(0.017, 0.011, f);
    if (abs(ax) < hw) {
      let red = (floor((q.y - Y0) / 0.032) % 2.0) < 1.0;
      var tc = select(DUSK[9], DUSK[6], red);
      if (ax * side < -hw * 0.25) { tc = select(DUSK[5], DUSK[4], red); }
      if (abs(ax) < PU * 1.2 && (abs(f - 0.35) < 0.025 || abs(f - 0.68) < 0.025)) { tc = DUSK[15]; }
      col = tc;
    }
  }
  if (q.y >= Y1 && q.y < Y1 + 0.007 && abs(ax) < 0.017) { col = DUSK[1]; }
  if (q.y >= Y1 + 0.007 && q.y < Y1 + 0.033 && abs(ax) < 0.0105) {
    let fl = 0.85 + 0.15 * sin(T * 9.0) * sin(T * 3.7);
    col = mix(DUSK[9], DUSK[15], fl);
  }
  let ry = q.y - (Y1 + 0.033);
  if (ry >= 0.0 && ry < 0.02 && abs(ax) < 0.0135 * (1.0 - ry / 0.02) + PU * 0.5) {
    col = select(DUSK[4], DUSK[1], ax * side < 0.0);
  }
  return col;
}

fn ring(q: vec2f, c: vec2f, age: f32, strength: f32) -> f32 {
  // Squashed vertically: rings on water seen at a low angle.
  let r = length(vec2f(q.x - c.x, (q.y - c.y) * 3.2));
  let r0 = age * 0.15 * strength;
  let w = exp(-pow((r - r0) / 0.0075, 2.0)) + 0.6 * exp(-pow((r - r0 * 0.6) / 0.006, 2.0));
  return w * exp(-age * 0.75) * strength;
}

fn bayer2(a0: vec2f) -> f32 {
  let a = floor(a0);
  return fract(dot(a, vec2f(0.5, a.y * 0.75)));
}
fn bayer4(a: vec2f) -> f32 { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // One art pixel is `ps` screen pixels; every coordinate below is in art pixels.
  let ps = max(1.0, params.res.y / params.rows);
  let fragPx = vec2f(uv.x, 1.0 - uv.y) * params.res;
  let cell = floor(fragPx / ps);
  let R = floor(params.res / ps);
  A = R.x / R.y;
  PU = 1.0 / R.y;
  T = params.time;
  let q = (cell + 0.5) / R.y;

  LX = select(A * 0.4, A * 0.24, A < 1.0);
  Y0 = H + 0.085;
  Y1 = Y0 + 0.17;
  LAMP = vec2f(LX, Y1 + 0.02);

  let m = vec2f(params.mouse.x * A, 1.0 - params.mouse.y);
  PAR = params.mouse.x - 0.5;
  MOON = vec2f(A * 0.77 + sin(T * 0.04) * 0.015 - PAR * 0.008, 0.76);
  // The lamp aims at the pointer and keeps a slow sway so it never hangs still.
  AIM = m + vec2f(sin(T * 0.6), cos(T * 0.47)) * 0.04;

  var col: vec3f;
  if (q.y >= H) {
    col = above(q);
  } else {
    let d = H - q.y;
    let pr = d / H;
    let row = floor(q.y / PU);
    var off = (n1(row * 0.37 + T * 1.4) - 0.5) * 0.022 * (0.25 + pr * 1.6);
    var rb = 0.0;

    // Ambient rings where fish break the surface, four overlapping clocks.
    for (var i = 0; i < 4; i++) {
      let fi = f32(i);
      let period = 3.6 + fi * 0.7;
      let k = floor((T + fi * 1.3) / period);
      let age = T + fi * 1.3 - k * period;
      let c = vec2f(hash11(k * 7.1 + fi) * A, H * (0.15 + 0.7 * hash11(k * 3.3 + fi * 5.0)));
      let w = ring(q, c, age, 0.5);
      off += w * 0.012;
      rb += w;
    }
    // The pointer disturbs the water it hovers over.
    if (m.y < H) {
      for (var j = 0; j < 2; j++) {
        let age = fract(T * 0.8 + f32(j) * 0.5) * 2.5;
        let w = ring(q, m, age, 1.0);
        off += w * 0.012;
        rb += w;
      }
    }

    let rq = vec2f(q.x + off, H + d * 1.12 + PU * 0.5);
    col = above(rq) * vec3f(0.6, 0.64, 0.92);
    col = mix(col, DUSK[11], smoothstep(0.0, 1.0, pr) * 0.6);
    if (d < PU * 1.2) { col = mix(col, DUSK[8], 0.45); }

    // Moon glitter: a column of sparks that breaks up with distance.
    let gx = abs(q.x + off * 2.0 - MOON.x);
    let gw = 0.016 + pr * 0.06;
    let g = step(0.66, n1(q.x / PU * 0.9 + row * 7.3 + T * 3.5)) * smoothstep(gw, gw * 0.25, gx);
    if (g > 0.45) { col = select(DUSK[9], DUSK[10], h2(vec2f(row, floor(q.x / PU))) > 0.55); }
    col = mix(col, DUSK[14], clamp(rb * 0.35, 0.0, 0.6));

    // A boat crossing on the swell, lantern lit.
    let bx = (T * 0.014) % (A + 0.3) - 0.15 + PAR * 0.06;
    let by = H - 0.085 + floor(sin(T * 1.3) * 1.5) * PU;
    let yy = q.y - by;
    if (yy > 0.0 && yy < 0.011 && abs(q.x - bx) < 0.021 + yy * 1.3) { col = DUSK[0]; }
    if (yy > -PU * 1.5 && yy <= 0.0 && abs(q.x - bx) < 0.026) { col = mix(col, DUSK[0], 0.5); }
    if (abs(q.x - (bx - 0.003)) < PU * 0.6 && yy > 0.011 && yy < 0.06) { col = DUSK[0]; }
    let sy = (yy - 0.016) / 0.04;
    if (sy > 0.0 && sy < 1.0 && q.x > bx - 0.002 && q.x < bx - 0.002 + 0.028 * (1.0 - sy)) { col = DUSK[9] * 0.85; }
    col += DUSK[15] * exp(-length(q - vec2f(bx + 0.019, by + 0.016)) * 90.0) * 1.2;
  }

  col *= 1.0 - 0.35 * dot(uv - 0.5, uv - 0.5);

  // Ordered dither, then snap to the nearest Dusk slot and paint that slot from
  // the chosen palette. Swapping palettes recolours by index, like a sprite.
  let c = col + (bayer4(cell) - 0.5) * 0.07;
  var bdist = 1e9;
  var idx = 0;
  for (var i = 0; i < 16; i++) {
    let e = (c - DUSK[i]) * vec3f(0.9, 1.2, 0.7);
    let dd = dot(e, e);
    if (dd < bdist) { bdist = dd; idx = i; }
  }
  var dusk = DUSK;
  var frost = FROST;
  var ember = EMBER;
  let p = clamp(params.palette, 0.0, 2.0);
  var outc = mix(dusk[idx], frost[idx], clamp(p, 0.0, 1.0));
  outc = mix(outc, ember[idx], clamp(p - 1.0, 0.0, 1.0));
  return vec4f(outc, 1.0);
}
