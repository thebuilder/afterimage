// Letterlight: a slowly turning sculpture drawn only in letters. Every cell asks
// the scene one question, how much lamp light lands here, and answers with a
// letter whose ink matches. Silhouettes switch to strokes that follow the edge,
// and the wall behind carries the lamp's pool and the sculpture's typed shadow.
import { hash21, rot2 } from "./common.wgsl";

struct Params {
  res: vec2f,
  mouse: vec2f,
  time: f32,
  size: f32,
  lamp: f32,
  spin: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

// A 5x7 font, rows top to bottom, five bits per row with the leftmost pixel
// highest. x holds rows 0..3, y rows 4..6. The first fourteen are a ramp sorted
// by how much ink each letter lays down; the last four are edge strokes.
const FONT = array<vec2u, 18>(
  vec2u(0u, 12672u),       // .
  vec2u(12672u, 396u),     // :
  vec2u(143364u, 14468u),  // i
  vec2u(538624u, 14864u),  // c
  vec2u(135308u, 14468u),  // l
  vec2u(571392u, 14897u),  // o
  vec2u(47104u, 15919u),   // a
  vec2u(571392u, 14879u),  // e
  vec2u(588304u, 31281u),  // b
  vec2u(1001022u, 18004u), // R
  vec2u(710449u, 17971u),  // N
  vec2u(710513u, 17969u),  // M
  vec2u(1001022u, 31281u), // B
  vec2u(712238u, 15895u),  // @
  vec2u(135300u, 4228u),   // |
  vec2u(133153u, 16904u),  // /
  vec2u(1015808u, 0u),     // -
  vec2u(139792u, 1058u),   // backslash
);
const RAMP: f32 = 14.0;
const PAPER = vec3f(0.050, 0.046, 0.043);
const TYPE = vec3f(0.94, 0.90, 0.82);
const EMBER = vec3f(1.00, 0.45, 0.22);

fn bit(id: u32, x: i32, y: i32) -> f32 {
  if (x < 0 || x > 4 || y < 0 || y > 6) { return 0.0; }
  let g = FONT[id];
  let row = u32(y);
  let word = select(g.y, g.x, row < 4u);
  let shift = (row % 4u) * 5u + u32(4 - x);
  return f32((word >> shift) & 1u);
}

/// Ink of one glyph at a cell-local position. The bitmap is read bilinearly and
/// thresholded, which rounds the pixel font into soft, inked letterforms.
fn glyph(id: u32, local: vec2f, aa: f32) -> f32 {
  let g = (local - vec2f(0.14, 0.10)) / vec2f(0.72, 0.80) * vec2f(5.0, 7.0) - 0.5;
  let i = vec2i(floor(g));
  let f = smoothstep(vec2f(0.0), vec2f(1.0), fract(g));
  let a = bit(id, i.x, i.y);
  let b = bit(id, i.x + 1, i.y);
  let c = bit(id, i.x, i.y + 1);
  let d = bit(id, i.x + 1, i.y + 1);
  let v = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  return smoothstep(0.42 - aa, 0.42 + aa, v);
}

/// The sculpture: a rounded square column, twisted a quarter turn along its height.
fn sdf(p0: vec3f, t: f32) -> f32 {
  var p = p0;
  let yz = rot2(-0.42) * p.yz;
  p = vec3f(p.x, yz.x, yz.y);
  let xz = rot2(t) * p.xz;
  p = vec3f(xz.x, p.y, xz.y);
  let tw = rot2(p.y * 2.3 + sin(t * 0.7) * 0.3) * p.xz;
  p = vec3f(tw.x, p.y, tw.y);
  let q = abs(p) - vec3f(0.24, 0.5, 0.24);
  let box = length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0) - 0.11;
  return box * 0.72;
}

fn normalAt(p: vec3f, t: f32) -> vec3f {
  let e = vec2f(0.002, -0.002);
  return normalize(
    e.xyy * sdf(p + e.xyy, t) + e.yyx * sdf(p + e.yyx, t) +
    e.yxy * sdf(p + e.yxy, t) + e.xxx * sdf(p + e.xxx, t)
  );
}

/// Where a ray enters and leaves the sphere that bounds the sculpture, or a
/// negative exit when it misses. Rays that miss never march at all.
const BOUND: f32 = 0.82;
fn bound(ro: vec3f, rd: vec3f) -> vec2f {
  let b = dot(ro, rd);
  let h = b * b - dot(ro, ro) + BOUND * BOUND;
  if (h < 0.0) { return vec2f(-1.0); }
  let r = sqrt(h);
  return vec2f(-b - r, -b + r);
}

/// Soft shadow from a wall point toward the lamp.
fn shadow(ro: vec3f, rd: vec3f, maxT: f32, t: f32) -> f32 {
  // A soft shadow still darkens just outside the form, so pad the bound.
  let b = dot(ro, rd);
  if (b * b - dot(ro, ro) + 1.2 * 1.2 < 0.0) { return 1.0; }
  var s = 1.0;
  var d = 0.05;
  for (var i = 0; i < 22; i++) {
    let h = sdf(ro + rd * d, t);
    s = min(s, 7.0 * h / d);
    d += clamp(h, 0.03, 0.25);
    if (s < 0.01 || d > maxT) { break; }
  }
  return clamp(s, 0.0, 1.0);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = params.res.x / max(params.res.y, 1.0);
  let p = vec2f((uv.x - 0.5) * aspect, 0.5 - uv.y);
  let m = vec2f((params.mouse.x - 0.5) * aspect, 0.5 - params.mouse.y);
  let t = params.time;

  // The type grid. Cells are taller than wide, like a monospaced face.
  let rows = max(params.size, 8.0);
  let cs = vec2f(0.6, 1.0) / rows;
  let cell = floor(p / cs);
  let pc = (cell + 0.5) * cs;
  var local = fract(p / cs);
  local.y = 1.0 - local.y;

  // The sculpture sits right of centre on wide screens, clear of the title.
  // On a tall phone the lens widens so the sculpture keeps its margins, and it
  // rises a little to leave the lower half to the title.
  let off = vec2f(clamp((aspect - 1.0) * 0.32, 0.0, 0.3), mix(0.1, -0.01, clamp(aspect, 0.0, 1.0)));
  let focal = 1.55 * clamp(aspect * 1.4, 0.6, 1.0);

  // Lamp: it drifts around the sculpture on its own, and follows the pointer
  // once the pointer leaves where it started.
  let wander = vec2f(cos(t * 0.21) * 1.5, 0.55 + sin(t * 0.33) * 0.75);
  let held = smoothstep(0.03, 0.14, length(m - vec2f(0.0, 0.05)));
  // The wall sits 4.3 units down the ray, so this puts the lamp's pool under the pointer.
  let lampXY = mix(wander, (m - off) * (4.3 / focal), held);
  let L = vec3f(lampXY, 1.5);
  let lampK = params.lamp;

  // One ray per cell, from the cell centre.
  let ro = vec3f(0.0, 0.0, 3.2);
  let rd = normalize(vec3f(pc - off, -focal));
  let turn = t * 0.22 * params.spin;

  let span = bound(ro, rd);
  var d = max(span.x, 0.0);
  var hit = false;
  if (span.y > 0.0) {
    for (var i = 0; i < 56; i++) {
      let h = sdf(ro + rd * d, turn);
      if (h < 0.0015) { hit = true; break; }
      d += h;
      if (d > span.y) { break; }
    }
  }

  // Ordered churn: each cell re-rolls its rounding now and then, so the type
  // keeps resetting itself like a page being re-composed.
  let h0 = hash21(cell);
  let churn = (hash21(cell + floor(t * 0.9 + h0 * 11.0) * 7.31) - 0.5) * 0.8;

  var id = 99u;
  var bright = 0.0;
  var tint = 0.0;
  if (hit) {
    let pos = ro + rd * d;
    let n = normalAt(pos, turn);
    let toL = L - pos;
    let ld = normalize(toL);
    let fall = 1.0 / (1.0 + 0.08 * dot(toL, toL));
    let diff = max(dot(n, ld), 0.0);
    let spec = pow(max(dot(reflect(-ld, n), -rd), 0.0), 24.0);
    let v = clamp((0.07 + diff * 1.05 * fall) * lampK + spec * 0.6 * lampK, 0.0, 1.2);
    let rim = 1.0 - abs(dot(n, rd));
    if (rim > 0.8 && diff * lampK > 0.06) {
      // Silhouette: a stroke along the contour, picked from the screen normal.
      let a = atan2(n.y, n.x);
      let k = u32(floor(fract(a / 3.14159265 + 0.125) * 4.0));
      id = 14u + k;
      bright = 0.45 + 0.5 * v;
    } else {
      let lvl = floor(v * RAMP + churn);
      if (lvl >= 0.0) {
        id = u32(min(lvl, RAMP - 1.0));
        bright = 0.32 + 0.68 * smoothstep(0.0, 1.0, v);
      }
    }
    tint = smoothstep(0.35, 0.9, spec * lampK);
  } else {
    // The wall behind: lit only where the lamp reaches it and the sculpture does not block it.
    let tw = (-1.1 - ro.z) / rd.z;
    let w = ro + rd * tw;
    let toL = L - w;
    let dist = length(toL);
    let lat = length(toL.xy);
    let pool = lampK * exp(-lat * lat * 0.9);
    let sh = shadow(w, toL / dist, dist, turn);
    let v = pool * mix(0.06, 1.0, sh);
    let lvl = floor(v * 3.8 + churn * 0.5 - 0.7);
    if (lvl >= 0.0) {
      id = u32(min(lvl, 3.0));
      bright = 0.16 + 0.34 * v;
    }
  }

  var col = PAPER;
  if (id != 99u) {
    // One font pixel spans this many screen pixels; soften the edge over one of them.
    let px = params.res.y / rows * 0.8 / 7.0;
    let ink = glyph(id, local, 0.6 / max(px, 1.0));
    let c = mix(TYPE, EMBER, tint);
    col = mix(col, c * min(bright, 1.0), ink);
  }
  return vec4f(col, 1.0);
}
