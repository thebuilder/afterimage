// Folio: a stack of fine printed papers, full bleed. The top sheet's corner
// follows the pointer and the paper curls around a cylinder along the fold,
// showing its plain back, casting a soft shadow, and revealing the next sheet
// underneath. Sheets are foil-stamped and blind-embossed, so the light
// slides across them as they bend.
import { hash21, filmic } from "../../shaders/common.wgsl";

struct Params {
  res: vec2f,
  corner: vec2f,   // the corner being lifted, screen heights, y up
  pull: vec2f,     // where that corner has been pulled to
  time: f32,
  radius: f32,     // curl radius
  sheet: f32,      // which design is on top
  aspect: f32,
  foil: f32,       // how bright the foil and gloss are
  _p0: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

const PI: f32 = 3.14159265;
const SHEETS: i32 = 4;
var<private> PX: f32 = 0.001;

struct Mat {
  col: vec3f,
  h: f32,      // emboss height
  metal: f32,  // 0 paper .. 1 foil
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2f(1.0, 0.0)), u.x), mix(hash21(i + vec2f(0.0, 1.0)), hash21(i + vec2f(1.0, 1.0)), u.x), u.y);
}

/// Paper grain: short fibres, stretched along the sheet.
fn grain(q: vec2f) -> f32 {
  return vnoise(q * vec2f(260.0, 70.0)) * 0.5 + vnoise(q * vec2f(90.0, 400.0)) * 0.3 + vnoise(q * 30.0) * 0.2;
}

/// Seigaiha: rows of overlapping ripple fans. Returns the distance to the
/// nearest ring line, in units of ring spacing.
fn seigaiha(q: vec2f) -> f32 {
  let r = 0.105;
  let step_y = 0.45 * r;
  var dist = 1.0;
  let k0 = floor(q.y / step_y) + 3.0;
  // Lower rows overlap higher ones, so walk from the top row down and keep
  // the last circle that covers this point.
  for (var k = 0; k < 8; k++) {
    let row = k0 - f32(k);
    let cy = row * step_y;
    let off = select(0.0, r, (i32(row) & 1) == 1);
    let cx = round((q.x - off) / (2.0 * r)) * 2.0 * r + off;
    let dd = length(q - vec2f(cx, cy));
    if (dd < r) {
      dist = abs(fract(dd / (r / 4.0)) - 0.5);
      // The fan's outline is a line too.
      dist = min(dist, (r - dd) / (r / 4.0));
    }
  }
  return dist;
}

/// Shippo: a lattice of overlapping circles; distance to the nearest arc.
fn shippo(q: vec2f) -> f32 {
  let s = 0.16;
  let g = floor(q / s);
  var m = 1.0;
  for (var j = 0; j <= 1; j++) {
    for (var i = 0; i <= 1; i++) {
      let c = (g + vec2f(f32(i), f32(j))) * s;
      m = min(m, abs(length(q - c) - s * 0.7071));
    }
  }
  return m / s;
}

fn design(k: i32, q: vec2f, back: bool) -> Mat {
  let fib = grain(q);
  var m: Mat;
  m.metal = 0.0;
  m.h = fib * 0.15;
  if (k == 0) {
    // Indigo with gold seigaiha.
    m.col = vec3f(0.05, 0.08, 0.21) * (0.9 + 0.2 * fib);
    if (!back) {
      let d = seigaiha(q);
      let aa = PX / (0.105 / 4.0);
      let line = smoothstep(0.075 + aa, 0.075 - aa, d);
      m.metal = line;
      m.h += line * 0.6;
    }
  } else if (k == 1) {
    // Vermilion, blind-embossed shippo.
    m.col = vec3f(0.66, 0.12, 0.07) * (0.9 + 0.2 * fib);
    if (!back) {
      let d = shippo(q);
      m.h += smoothstep(0.035, 0.0, d) * 0.9;
    }
  } else if (k == 2) {
    // Cream washi with long fibres and scattered gold leaf.
    m.col = vec3f(0.86, 0.82, 0.72) * (0.92 + 0.12 * fib);
    let long = vnoise(q * vec2f(14.0, 3.0) + vnoise(q * 6.0) * 2.0);
    m.col *= 1.0 - 0.08 * smoothstep(0.62, 0.7, long) * smoothstep(0.78, 0.7, long);
    if (!back) {
      // Torn flakes of leaf: a few cells hold one, with a ragged edge.
      let g = q * 14.0;
      let cell = floor(g);
      let keep = step(0.72, hash21(cell + 3.7));
      let c = vec2f(hash21(cell), hash21(cell + 11.3)) * 0.5 + 0.25;
      let rel = fract(g) - c;
      let ang = atan2(rel.y, rel.x);
      let rad = 0.16 + 0.12 * hash21(cell + 5.1) + 0.05 * sin(ang * 3.0 + hash21(cell) * 6.0) + 0.04 * (vnoise(g * 9.0) - 0.5);
      let leaf = keep * smoothstep(rad + 0.01, rad - 0.01, length(rel)) * (0.75 + 0.25 * step(0.2, vnoise(g * 14.0)));
      m.metal = leaf;
      m.h += leaf * 0.3;
    }
  } else {
    // Black with a fine silver pinstripe.
    m.col = vec3f(0.025, 0.025, 0.028) * (0.9 + 0.2 * fib);
    if (!back) {
      let w = (q.x + q.y) * 24.0;
      let line = smoothstep(0.38, 0.45, abs(fract(w) - 0.5));
      m.metal = line * 0.85;
      m.h += line * 0.4;
    }
  }
  if (back) {
    // The reverse is the same paper, unprinted and a little paler.
    m.col = mix(m.col, vec3f(0.85, 0.82, 0.76), 0.12);
  }
  return m;
}

fn shade(k: i32, q: vec2f, back: bool, n: vec3f, px: f32) -> vec3f {
  let m = design(k, q, back);
  let e = px * 1.2;
  let hx = design(k, q + vec2f(e, 0.0), back).h - m.h;
  let hy = design(k, q + vec2f(0.0, e), back).h - m.h;
  let bump = vec2f(hx, hy) / e * 0.0025;
  let nn = normalize(n + vec3f(-bump, 0.0));
  let L = normalize(vec3f(-0.45, 0.55, 0.8));
  let V = vec3f(0.0, 0.0, 1.0);
  let H = normalize(L + V);
  let diff = max(dot(nn, L), 0.0);
  let paper = m.col * (0.22 + 0.95 * diff) + vec3f(1.0) * pow(max(dot(nn, H), 0.0), 18.0) * 0.03;
  let tint = select(vec3f(1.0, 0.78, 0.42), vec3f(0.85, 0.88, 0.92), k == 3);
  let R = reflect(-V, nn);
  let env = 0.38 + 0.62 * smoothstep(-0.25, 0.6, dot(R.xy, vec2f(-0.55, 0.65)));
  let metal = tint * (env * 0.8 + pow(max(dot(nn, H), 0.0), 60.0) * 2.2) * params.foil;
  return mix(paper, metal, m.metal);
}

fn inside(q: vec2f) -> f32 {
  return min(min(q.x, params.aspect - q.x), min(q.y, 1.0 - q.y));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let a = params.aspect;
  let p = vec2f(uv.x * a, 1.0 - uv.y);
  let px = 1.0 / max(params.res.y, 1.0);
  PX = px;
  let R = params.radius;
  let top = i32(params.sheet) % SHEETS;
  let under = (top + 1) % SHEETS;

  // The fold: d points from the pulled corner's new spot back toward where
  // it was; the curl starts on the line through L0, perpendicular to d.
  var dv = params.corner - params.pull;
  if (dot(dv, dv) < 1e-8) { dv = vec2f(1e-4, 1e-4); }
  let span = length(dv);
  let d = dv / span;
  let uc = (span + PI * R) * 0.5;
  let L0 = params.corner - d * uc;
  let s = dot(p - L0, d);

  // Layers from the top down: the folded-back flap, the top of the curl, the
  // underside of the curl, the flat top sheet, and the next sheet below.
  // Each is drawn with coverage from how far its source point is inside the
  // sheet, so every edge is antialiased.
  var col = vec3f(0.0);
  var left = 1.0;

  if (s <= 0.0) {
    let u = PI * R - s;
    let src = p + d * (u - s);
    let cov = clamp(inside(src) / px + 0.5, 0.0, 1.0);
    if (cov > 0.0) {
      var c = shade(top, src, true, vec3f(0.0, 0.0, 1.0), px);
      c *= 0.82 + 0.18 * smoothstep(0.0, 6.0 * px, inside(src));
      col += left * cov * c;
      left *= 1.0 - cov;
    }
  }
  if (left > 0.001 && s >= 0.0 && s <= R) {
    let edge = clamp((R - s) / px + 0.5, 0.0, 1.0);
    let a1 = asin(clamp(s / R, 0.0, 1.0));
    let t2 = PI - a1;
    let src2 = p + d * (R * t2 - s);
    let cov2 = clamp(inside(src2) / px + 0.5, 0.0, 1.0) * edge;
    if (cov2 > 0.0) {
      let n = vec3f(d * sin(t2), -cos(t2));
      col += left * cov2 * shade(top, src2, true, n, px);
      left *= 1.0 - cov2;
    }
    if (left > 0.001) {
      let src1 = p + d * (R * a1 - s);
      let cov1 = clamp(inside(src1) / px + 0.5, 0.0, 1.0) * edge;
      if (cov1 > 0.0) {
        let n = vec3f(-d * sin(a1), cos(a1));
        col += left * cov1 * shade(top, src1, false, n, px);
        left *= 1.0 - cov1;
      }
    }
  }

  // Shadow from the curled part onto whatever lies under it: test whether the
  // curl covers the point the light comes through, at a few heights.
  var shadow = 0.0;
  {
    let Lxy = vec2f(-0.45, 0.55) / 0.8;
    let q = p + Lxy * R * 1.3;
    let sq = dot(q - L0, d);
    let sc = min(sq, R);
    let u = select(PI * R - sc, R * (PI - asin(clamp(sc / R, 0.0, 1.0))), sc > 0.0);
    let src = q + d * (u - sc);
    shadow = smoothstep(-0.03, 0.05, inside(src)) * smoothstep(R + 0.06, R - 0.02, sq);
  }

  if (left > 0.001 && s < 0.0) {
    let cov = clamp(inside(p) / px + 0.5, 0.0, 1.0);
    var c = shade(top, p, false, vec3f(0.0, 0.0, 1.0), px);
    c *= 1.0 - 0.45 * shadow;
    col += left * cov * c;
    left *= 1.0 - cov;
  }
  if (left > 0.001) {
    var c = shade(under, p, false, vec3f(0.0, 0.0, 1.0), px);
    // Contact shadow along the curl, plus the cast shadow.
    let near = exp(-max(s - R, 0.0) / (0.02 + 0.5 * R));
    c *= 1.0 - 0.55 * max(shadow, near * 0.8);
    col += left * c;
  }

  // The key light is up and to the left; the far corner falls off.
  col *= 0.82 + 0.3 * smoothstep(1.4, 0.0, length(p - vec2f(0.0, 1.0)) / max(a, 1.0) * 1.2);
  let vg = length(uv - 0.5);
  col *= 1.0 - 0.25 * vg * vg;
  col = filmic(col * 1.25);
  col += (hash21(uv * params.res + params.time) - 0.5) / 255.0;
  return vec4f(col, 1.0);
}
