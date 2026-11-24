// The street and the lens, shared by the still pass and the picture pass.
//
// The camera stands on a balcony fourteen metres up, looking down a long
// avenue. Everything is in metres in camera space: x across, y up from the
// road, z away. A point projects to the screen as centre + F * (x, y - CAM_H) / z,
// so along any straight row of lights the screen position is linear in 1 / z,
// which is also the light's distance in diopters. That is what makes the
// gather cheap: for a pixel, the lights of a row that can reach it lie in a
// small range of 1 / z around the pixel's own projection onto the row.
import { hash21 } from "../../shaders/common.wgsl";

export const F = 1.25;
export const H0 = 0.56;
export const CAM_H = 14.0;
/** Facades, kerbs and lamp rows, in metres from the camera. */
export const X_LEFT = -11.0;
export const X_RIGHT = 21.0;
export const KERB_L = -4.0;
export const KERB_R = 14.0;
export const Z_END = 700.0;
/** Blocks: a cross street at the start of every block. */
export const BLOCK = 92.0;
export const GAP = 17.0;
export const PARAPET_Y = 0.17;
export const D_PARAPET = 1.3;
export const D_SKYLINE = 0.0009;

export struct Lens {
  centre: vec2f,   // the vanishing point on screen
  focus: f32,      // diopters
  A: f32,          // disc radius per diopter, screen heights
  px: f32,         // one pixel, screen heights
  time: f32,
}

export fn coc(l: Lens, d: f32) -> f32 {
  return l.A * abs(d - l.focus);
}

export fn project(l: Lens, w: vec3f) -> vec2f {
  return l.centre + F * vec2f(w.x, w.y - CAM_H) / w.z;
}

/// Buildings stand fifteen metres wide, five to a block.
export const SEG = 15.0;
/// Window columns per building, and the storey height above the shops.
export const COLS = 4.0;
export const STOREY = 3.4;
export const SHOP_H = 4.5;

/// The stretch of street the depth z falls in: a whole cross street, or one
/// building's frontage. Returns its near and far ends.
export fn segment(z: f32) -> vec2f {
  let b = floor(z / BLOCK);
  let inBlock = z - b * BLOCK;
  if (inBlock < GAP) { return vec2f(b * BLOCK, b * BLOCK + GAP); }
  let s = min(floor((inBlock - GAP) / SEG), 4.0);
  let z0 = b * BLOCK + GAP + s * SEG;
  return vec2f(z0, z0 + SEG);
}

/// The building on this side whose frontage holds depth z: its height (0 for
/// none), how far its facade is set back from the building line, its
/// material (0 brick, 1 pale stone, 2 glass curtain wall, 3 concrete) and a
/// seed.
export fn building(side: f32, z: f32) -> vec4f {
  if (z < 8.0 || z > Z_END) { return vec4f(0.0); }
  let b = z / BLOCK;
  let inBlock = fract(b) * BLOCK;
  if (inBlock < GAP) { return vec4f(0.0); }
  let seg = min(floor((inBlock - GAP) / SEG), 4.0);
  let id = vec2f(floor(b) * 7.0 + seg, side * 13.0 + 5.0);
  let h = hash21(id);
  let tower = step(0.86, hash21(vec2f(floor(b) * 3.0 + seg, side * 29.0)));
  let height = 16.0 + 30.0 * h * h + tower * 45.0;
  var sb = floor(hash21(id + 3.1) * 3.0 + 1.0) * 0.8 * step(0.55, hash21(id + 5.7));
  var mat = floor(hash21(id + 9.3) * 3.99);
  if (mat == 2.0 && tower < 0.5 && h < 0.5) { mat = 0.0; }
  if (tower > 0.5) { mat = 2.0; sb = 2.4; }
  return vec4f(height, sb, mat, hash21(id + 1.7));
}

export fn buildingHeight(side: f32, z: f32) -> f32 {
  return building(side, z).x;
}

/// The building line on each side, as a distance from the camera's axis.
export fn lineOf(s: i32) -> f32 {
  return select(X_RIGHT, -X_LEFT, s == 0);
}

/// Follows the ray through pixel offset q (from the vanishing point) past the
/// frontages on one side until it meets a building. Returns the depth z, the
/// face (0 the facade, 1 a side wall facing the camera, where the nearer
/// neighbour is lower or set further back), the distance from the axis, and
/// the height. z is negative when the ray reaches the road or the sky first.
export fn traceSide(q: vec2f, s: i32) -> vec4f {
  let xs = select(1.0, -1.0, s == 0);
  let W = lineOf(s);
  let a = q.x * xs / F;
  if (a <= 1e-5) { return vec4f(-1.0); }
  let sy = q.y / F;
  var z = max(W / a, 8.0);
  for (var i = 0; i < 28; i++) {
    if (z > Z_END) { break; }
    let y0 = CAM_H + sy * z;
    if (y0 < 0.0 || (sy > 0.0 && y0 > 92.0)) { break; }
    let sg = segment(z);
    let bd = building(f32(s), sg.x + 1.0);
    if (bd.x > 0.0) {
      let zf = (W + bd.y) / a;
      let ze = max(z, zf);
      if (ze < sg.y) {
        let y = CAM_H + sy * ze;
        if (y < 0.0) { break; }
        if (y < bd.x) {
          return vec4f(ze, select(0.0, 1.0, zf < z - 1e-4), a * ze, y);
        }
      }
    }
    z = sg.y + 1e-3;
  }
  return vec4f(-1.0);
}

/// Whether a point on a set-back facade is hidden from the camera by the
/// nearer buildings on its side that stand further forward.
export fn hiddenOnSide(s: i32, xa: f32, y: f32, z: f32) -> bool {
  let W = lineOf(s);
  let a = xa / z;
  let sy = (y - CAM_H) / z;
  var zb = segment(z).x;
  for (var i = 0; i < 3; i++) {
    let sg = segment(zb - 0.5);
    let bd = building(f32(s), sg.x + 1.0);
    if (bd.x > 0.0) {
      let ze = max(sg.x, (W + bd.y) / a);
      if (ze < sg.y && CAM_H + sy * ze < bd.x) { return true; }
    }
    zb = sg.x;
  }
  return false;
}

/// Lamp light on the road at (x, z).
export fn pools(x: f32, z: f32) -> f32 {
  let k = round((z - 14.0) / 32.0);
  let zk = 14.0 + k * 32.0;
  let dz = z - zk;
  let l = exp(-(dz * dz + (x - (KERB_L - 0.8)) * (x - (KERB_L - 0.8))) / 70.0)
        + exp(-(dz * dz + (x - (KERB_R + 0.8)) * (x - (KERB_R + 0.8))) / 70.0);
  return l;
}

/// Box-filtered periodic pulse: the share of [u - w/2, u + w/2] (in periods)
/// where fract(u) lies between lo and hi. Stays clean however fine the
/// pattern gets on screen, which is what keeps far facades from striping.
export fn pulse(u: f32, lo: f32, hi: f32, w: f32) -> f32 {
  let ww = max(w, 1e-4);
  let a = u - 0.5 * ww;
  let b = u + 0.5 * ww;
  let ia = floor(a) * (hi - lo) + clamp(fract(a), lo, hi) - lo;
  let ib = floor(b) * (hi - lo) + clamp(fract(b), lo, hi) - lo;
  return clamp((ib - ia) / ww, 0.0, 1.0);
}

/// The light a point light spreads over the pixel at offset o, in screen
/// heights. `stretch` draws it longer vertically, for wet road reflections.
export fn bokeh(l: Lens, o0: vec2f, at: vec2f, r0: f32, front: f32, stretch: f32) -> f32 {
  let o = vec2f(o0.x, o0.y / stretch);
  let px = l.px;
  let re = max(r0, 0.7 * px);
  let a = abs(o);
  let hexd = max(a.x * 0.866 + a.y * 0.5, a.y) * 1.04;
  let m = mix(length(o), hexd, 0.3 * smoothstep(px * 2.0, px * 6.0, re));
  var cov = clamp((re - m) / px + 0.5, 0.0, 1.0);
  let off = (at - l.centre) * 0.55 * re;
  cov *= clamp((re * 1.04 - length(o + off)) / px + 0.5, 0.0, 1.0);
  if (cov <= 0.0) { return 0.0; }
  let k = m / re;
  let rim = smoothstep(0.62, 1.0, k);
  let profile = 0.85 + 0.4 * rim + 0.025 * sin(k * 26.0);
  return cov * profile / (3.1416 * pow(max(re, 0.0035), 1.3) * stretch);
}

/// A point light at a depth: its disc, and a glow while it is near focus.
export fn pointLight(l: Lens, p: vec2f, at: vec2f, d: f32, e: f32, col: vec3f, size: f32, stretch: f32, maxR: f32) -> vec3f {
  let r = min(max(coc(l, d), size), maxR);
  let o = p - at;
  let sharp = 1.0 - smoothstep(size, size + 0.008, r);
  var c = bokeh(l, o, at, r, d - l.focus, stretch) * mix(1.0, 0.35, sharp);
  let og = vec2f(o.x, o.y / stretch);
  c += sharp * exp(-length(og) / (0.003 + size * 1.2)) * 10.0 / stretch;
  // Fringes: magenta in front of focus, green behind, on wide discs only.
  let fr = select(vec3f(0.94, 1.04, 0.95), vec3f(1.04, 0.92, 1.05), d > l.focus);
  return c * e * 0.024 * mix(vec3f(1.0), fr, smoothstep(0.004, 0.02, r)) * col;
}

/// A lit window or shopfront: a small rectangle blurred by its disc.
export fn areaLight(l: Lens, p: vec2f, at: vec2f, half0: vec2f, d: f32, e: f32, col: vec3f, maxR: f32) -> vec3f {
  let r = min(coc(l, d), maxR);
  let half = max(half0, vec2f(l.px * 0.5));
  let q = abs(p - at) - half;
  let sd = length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0);
  let cov = clamp((r - sd) / l.px + 0.5, 0.0, 1.0);
  if (cov <= 0.0) { return vec3f(0.0); }
  let area = 4.0 * half.x * half.y;
  let spread = area / (area + 4.0 * (half.x + half.y) * r + 3.1416 * r * r);
  let rim = smoothstep(-0.35 * r, 0.0, sd - r) * r / (r + half.x + half.y + 1e-5);
  return col * e * cov * spread * (1.0 + 0.5 * rim);
}

/// A row of point lights at x, y, every `spacing` metres from z0 to z1, as
/// seen by pixel p. Rows that move pass a phase. Returns the light gathered.
export fn rowRange(l: Lens, p: vec2f, x: f32, y: f32, reachExtra: f32) -> vec3f {
  // The row on screen is centre + t * dir, t = 1 / z.
  let dir = F * vec2f(x, y - CAM_H);
  let q = p - l.centre;
  let t = clamp(dot(q, dir) / dot(dir, dir), 1.0 / Z_END, 1.0 / 8.0);
  let reach = coc(l, t) + reachExtra;
  let dt = reach / length(dir) * 1.15;
  // Returns t, and the z range that can reach the pixel.
  return vec3f(t, 1.0 / (t + dt), 1.0 / max(t - dt, 1.0 / Z_END));
}

/// Whether the pixel sees the wet road, which mirrors the lights above it.
/// How much of the street the balcony parapet leaves visible, its edge
/// softened by its own disc.
export fn aboveParapet(l: Lens, p: vec2f) -> f32 {
  let r = max(coc(l, D_PARAPET), l.px);
  return smoothstep(PARAPET_Y - r, PARAPET_Y + r, p.y);
}

export fn onRoad(l: Lens, p: vec2f) -> bool {
  let q = p - l.centre;
  if (q.y >= 0.0 || p.y < PARAPET_Y) { return false; }
  return traceSide(q, 0).x < 0.0 && traceSide(q, 1).x < 0.0;
}
