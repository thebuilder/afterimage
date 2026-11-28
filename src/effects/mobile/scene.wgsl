// A hanging mobile in a white gallery: seven painted steel plates on a chain
// of balanced wire arms, turning slowly in the air. Two spotlights pick it
// out, a warm one high on the left and a weaker cool one on the right, so
// every plate and wire throws two shadows on the plaster wall behind, sharp
// where the piece is near the wall and softening as it turns away.
//
// Plates are flat shapes on vertical planes, wires are thin capsules, and
// both are drawn with coverage from their distance to the pixel, so edges
// stay clean without extra rays. The wall and floor look back at each light
// through the plates and wires for their shadows; a plate's penumbra is its
// edge distance where the shadow ray crosses it, widened by how far that
// crossing is from the wall over how far from the light.
import { hash21 } from "../../shaders/common.wgsl";

struct View {
  res: vec2f,
  aspect: f32,
  time: f32,
  eye: vec4f,               // camera position, focal length
  look: vec4f,              // camera target, wire count
  shift: vec4f,             // lens shift x, y, light level, unused
  plate: array<vec4f, 7>,   // centre xyz, facing angle (radians around y)
  shape: array<vec4f, 7>,   // half width, half height, bean warp, in-plane turn
  paint: array<vec4f, 7>,   // colour, gloss
  wire: array<vec4f, 64>,   // pairs: a.xyz, then b.xyz
}
@group(0) @binding(0) var<uniform> view: View;

const WALL = -1.15;
const FLOOR = -1.05;
const WR = 0.0032; // wire radius

// Two spotlights: position, radius of the lamp, aim point, cone (cos inner, cos outer).
const L1 = vec3f(-1.7, 2.7, 2.3);
const L1R = 0.018;
const L1AIM = vec3f(0.2, 0.25, -1.15);
const L1COL = vec3f(1.0, 0.86, 0.68) * 1.05;
const L2 = vec3f(1.6, 2.4, 3.0);
const L2R = 0.1;
const L2AIM = vec3f(0.35, 0.15, -1.15);
const L2COL = vec3f(0.7, 0.8, 1.0) * 0.28;

fn sq(x: f32) -> f32 { return x * x; }

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2f(1.0, 0.0)), u.x), mix(hash21(i + vec2f(0.0, 1.0)), hash21(i + vec2f(1.0, 1.0)), u.x), u.y);
}

fn plateN(i: i32) -> vec3f {
  let a = view.plate[i].w;
  return vec3f(-sin(a), 0.0, cos(a));
}

fn plateU(i: i32) -> vec3f {
  let a = view.plate[i].w;
  return vec3f(cos(a), 0.0, sin(a));
}

/// Signed distance to a plate's outline in its own plane: an ellipse bent
/// into a bean or a leaf, the shapes cut from sheet steel.
fn plateSd(i: i32, q0: vec2f) -> f32 {
  let s = view.shape[i];
  let c = cos(s.w);
  let n = sin(s.w);
  var q = vec2f(c * q0.x + n * q0.y, -n * q0.x + c * q0.y);
  // Bend: the shape's spine curves, so one long edge is hollow.
  q.y += s.z * (q.x * q.x / s.x - s.x * 0.35);
  // A pointed end on one side, like a leaf.
  let tip = 1.0 + 0.35 * smoothstep(0.0, 1.0, q.x / s.x) * abs(s.z) * 3.0;
  let ab = vec2f(s.x, s.y / tip);
  let k = length(q / ab);
  return (k - 1.0) * min(ab.x, ab.y) * mix(1.0, 0.7, smoothstep(1.0, 2.0, k));
}

/// Where a ray crosses plate i's plane: t, and the point in plate coordinates.
fn plateHit(ro: vec3f, rd: vec3f, i: i32) -> vec3f {
  let n = plateN(i);
  let d = dot(rd, n);
  if (abs(d) < 1e-4) { return vec3f(-1.0, 0.0, 0.0); }
  let c = view.plate[i].xyz;
  let t = dot(c - ro, n) / d;
  let p = ro + rd * t - c;
  return vec3f(t, dot(p, plateU(i)), p.y);
}

/// Closest approach of a ray to wire k: t along the ray, distance.
fn wireHit(ro: vec3f, rd: vec3f, k: i32) -> vec2f {
  let a = view.wire[k * 2].xyz;
  let b = view.wire[k * 2 + 1].xyz;
  let ba = b - a;
  let oa = ro - a;
  let bb = dot(ba, ba);
  let rb = dot(rd, ba);
  let den = bb - rb * rb;
  let s = clamp((dot(oa, ba) - rb * dot(rd, oa)) / max(den, 1e-8), 0.0, 1.0);
  let q = a + ba * s;
  let t = dot(q - ro, rd);
  return vec2f(t, length(ro + rd * t - q));
}

/// How much of a spotlight reaches p, past every plate and wire.
fn visible(p: vec3f, lp: vec3f, lr: f32) -> f32 {
  let toL = lp - p;
  let dl = length(toL);
  let l = toL / dl;
  var v = 1.0;
  for (var i = 0; i < 7; i++) {
    let h = plateHit(p, l, i);
    if (h.x <= 0.0 || h.x >= dl) { continue; }
    // The lamp's disc, seen from p through the plate's plane.
    let w = lr * h.x / (dl - h.x) + 0.0015;
    let d = plateSd(i, h.yz);
    v *= smoothstep(-w, w, d);
  }
  let n = i32(view.look.w);
  for (var k = 0; k < n; k++) {
    let h = wireHit(p, l, k);
    if (h.x <= 0.0 || h.x >= dl) { continue; }
    let w = lr * h.x / (dl - h.x) + 0.001;
    // A thin wire hides at most its own width of the lamp.
    let depth = clamp(WR / w, 0.0, 1.0);
    v *= 1.0 - depth * smoothstep(w + WR, 0.0, h.y);
  }
  return v;
}

fn spot(p: vec3f, n: vec3f, lp: vec3f, aim: vec3f, ci: f32, co: f32) -> f32 {
  let l = normalize(lp - p);
  let axis = normalize(aim - lp);
  let cone = smoothstep(co, ci, dot(-l, axis));
  return cone * max(dot(n, l), 0.0);
}

fn lightAt(p: vec3f, n: vec3f) -> vec3f {
  var c = vec3f(0.0);
  let s1 = spot(p, n, L1, L1AIM, 0.94, 0.78);
  if (s1 > 0.0) { c += L1COL * s1 * visible(p, L1, L1R); }
  let s2 = spot(p, n, L2, L2AIM, 0.9, 0.76);
  if (s2 > 0.0) { c += L2COL * s2 * visible(p, L2, L2R); }
  return c * view.shift.z;
}

fn plaster(p: vec2f) -> vec3f {
  let n = vnoise(p * 9.0) * 0.5 + vnoise(p * 37.0) * 0.3 + vnoise(p * 140.0) * 0.2;
  return vec3f(0.80, 0.785, 0.76) * (0.965 + 0.05 * n);
}

/// The room behind the piece: wall, floor, and the shadows on both.
fn room(ro: vec3f, rd: vec3f) -> vec3f {
  var t = (WALL - ro.z) / rd.z;
  var p = ro + rd * t;
  var n = vec3f(0.0, 0.0, 1.0);
  var alb = plaster(p.xy);
  if (p.y < FLOOR) {
    // Pale polished concrete.
    t = (FLOOR - ro.y) / rd.y;
    p = ro + rd * t;
    n = vec3f(0.0, 1.0, 0.0);
    let g = vnoise(p.xz * 6.0) * 0.6 + vnoise(p.xz * 40.0) * 0.4;
    alb = vec3f(0.56, 0.55, 0.53) * (0.92 + 0.12 * g);
  }
  // Light bounced round a white room, darker into the corner.
  let corner = smoothstep(0.0, 0.35, abs(p.y - FLOOR) + 0.02 * step(p.y, FLOOR) * 10.0 * abs(p.z - WALL));
  let amb = vec3f(0.085, 0.085, 0.09) * (0.55 + 0.45 * corner);
  var c = alb * (amb + lightAt(p, n));
  // The skirting line where the wall meets the floor.
  c *= 1.0 - 0.35 * exp(-abs(p.y - FLOOR) * 60.0) * step(FLOOR, p.y + 0.001);
  return c;
}

fn aces(x: vec3f) -> vec3f {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let ro = view.eye.xyz;
  let ww = normalize(view.look.xyz - ro);
  let uu = normalize(cross(ww, vec3f(0.0, 1.0, 0.0)));
  let vv = cross(uu, ww);
  let f = view.eye.w;
  let s = vec2f((uv.x - 0.5) * view.aspect, 0.5 - uv.y) + view.shift.xy;
  let rd = normalize(s.x * uu + s.y * vv + f * ww);
  let pxa = 1.0 / (view.res.y * f);
  // The rays one pixel across and one pixel down, to measure each plate's
  // outline in pixels wherever it is seen, square on or nearly edge on.
  let e = 1.0 / view.res.y;
  let rdx = normalize((s.x + e) * uu + s.y * vv + f * ww);
  let rdy = normalize(s.x * uu + (s.y - e) * vv + f * ww);

  var col = room(ro, rd);

  // Everything in front of the wall that this pixel touches, back to front.
  var ts: array<f32, 8>;
  var cs: array<vec4f, 8>;
  var m = 0;
  for (var i = 0; i < 7; i++) {
    let h = plateHit(ro, rd, i);
    if (h.x <= 0.0) { continue; }
    let d = plateSd(i, h.yz);
    let hx = plateHit(ro, rdx, i);
    let hy = plateHit(ro, rdy, i);
    var w = 1.0;
    if (hx.x > 0.0 && hy.x > 0.0) {
      w = max(abs(plateSd(i, hx.yz) - d) + abs(plateSd(i, hy.yz) - d), 1e-5);
    }
    let a = smoothstep(w * 0.7, -w * 0.7, d);
    if (a <= 0.0) { continue; }
    let p = ro + rd * h.x;
    var n = plateN(i);
    if (dot(n, rd) > 0.0) { n = -n; }
    // Sheet steel under brushed enamel: a soft sheen across the strokes.
    let pa = view.paint[i];
    let brush = vnoise(vec2f(h.y * 6.0, h.z * 180.0) + f32(i) * 7.0);
    let alb = pa.rgb * (0.94 + 0.08 * brush);
    var c = alb * (vec3f(0.11, 0.105, 0.1) + lightAt(p + n * 0.002, n));
    for (var k = 0; k < 2; k++) {
      let lp = select(L1, L2, k == 1);
      let lc = select(L1COL, L2COL, k == 1);
      let l = normalize(lp - p);
      let hv = normalize(l - rd);
      let sp = pow(max(dot(n, hv), 0.0), 24.0) * pa.w * max(dot(n, l), 0.0);
      c += lc * sp * 0.25 * view.shift.z;
    }
    // A hair of bright edge where the cut steel catches the lamp.
    c += vec3f(0.06) * smoothstep(-w * 2.0, 0.0, d) * a * max(dot(normalize(L1 - p), plateU(i)), 0.0);
    if (m < 8) {
      ts[m] = h.x;
      cs[m] = vec4f(c, a);
      m++;
    }
  }
  let nw = i32(view.look.w);
  for (var k = 0; k < nw; k++) {
    let h = wireHit(ro, rd, k);
    if (h.x <= 0.0) { continue; }
    let w = h.x * pxa;
    let a = clamp(2.0 * WR / w, 0.0, 1.0) * clamp(1.0 - (h.y - WR) / w, 0.0, 1.0);
    if (a <= 0.0) { continue; }
    let p = ro + rd * h.x;
    // Black steel wire, a thin highlight from the warm lamp.
    let c = vec3f(0.012) + L1COL * 0.03 * view.shift.z;
    if (m < 8) {
      ts[m] = h.x;
      cs[m] = vec4f(c, a * 0.95);
      m++;
    }
  }
  // Composite far to near.
  for (var j = 0; j < m; j++) {
    var far = j;
    for (var q = j + 1; q < m; q++) {
      if (ts[q] > ts[far]) { far = q; }
    }
    let tt = ts[j];
    ts[j] = ts[far];
    ts[far] = tt;
    let cc = cs[j];
    cs[j] = cs[far];
    cs[far] = cc;
    col = mix(col, cs[j].rgb, cs[j].a);
  }

  col = aces(col * 0.95);
  col = pow(col, vec3f(1.0 / 2.2));
  col *= 1.0 - 0.22 * smoothstep(0.45, 1.0, length((uv - 0.5) * vec2f(1.0, 1.1)) * 1.25);
  col += (hash21(uv * view.res) - 0.5) / 255.0;
  return vec4f(col, 1.0);
}
