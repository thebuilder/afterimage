// A Newton's cradle on a desk, ray traced. Five polished steel balls hang
// from a chrome frame on fine nylon lines, two to a ball in a V so they swing
// in one plane. The frame stands in a lacquered walnut base on a dark linen
// desk, under one large softbox overhead, a cool strip light behind on the
// left and a faint warm fill from the camera side.
//
// Every ball is a mirror, so each ray bounces up to four times: a ball shows
// the softbox, the strip, the walnut base, the desk and its neighbours, and
// the neighbours inside them. The walnut is lacquered, so it mirrors the balls
// faintly at a glancing angle. Diffuse surfaces take the softbox as an area
// light, with soft shadows from the balls and the frame.
import { hash21 } from "../../shaders/common.wgsl";

struct View {
  res: vec2f,
  aspect: f32,
  time: f32,
  eye: vec4f,             // camera position, focal length
  look: vec4f,            // camera target, unused
  shift: vec4f,           // lens shift x, y, key light level, unused
  ball: array<vec4f, 5>,  // centre xyz, swing angle
}
@group(0) @binding(0) var<uniform> view: View;

const RB = 0.1;          // ball radius
const LEN = 0.72;        // rail to ball centre
const TOP = 1.0;         // rail height
const ZR = 0.26;         // rails sit either side, at z = +-ZR
const XP = 0.62;         // posts at x = +-XP
const RF = 0.0125;       // frame rod radius
const RE = 0.016;        // eyelet radius
const RS = 0.0011;       // line radius
const BX = vec3f(0.8, 0.045, 0.4); // base half size
const BY = -0.045;       // base centre height
const DESK = -0.09;

// The key softbox: centre, half size in x and z, facing down.
const KEY_C = vec3f(0.25, 2.5, 0.45);
const KEY_H = vec2f(1.1, 0.8);
const KEY_COL = vec3f(1.0, 0.96, 0.9);

const MISS = 0u;
const M_BALL = 1u;
const M_FRAME = 2u;
const M_WOOD = 3u;
const M_DESK = 4u;

struct Hit {
  t: f32,
  n: vec3f,
  m: u32,
}

fn sq(x: f32) -> f32 { return x * x; }

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2f(1.0, 0.0)), u.x), mix(hash21(i + vec2f(0.0, 1.0)), hash21(i + vec2f(1.0, 1.0)), u.x), u.y);
}

fn iSphere(ro: vec3f, rd: vec3f, c: vec3f, r: f32) -> f32 {
  let oc = ro - c;
  let b = dot(oc, rd);
  let h = b * b - (dot(oc, oc) - r * r);
  if (h < 0.0) { return -1.0; }
  return -b - sqrt(h);
}

// iq's capsule intersection.
fn iCapsule(ro: vec3f, rd: vec3f, pa: vec3f, pb: vec3f, r: f32) -> f32 {
  let ba = pb - pa;
  let oa = ro - pa;
  let baba = dot(ba, ba);
  let bard = dot(ba, rd);
  let baoa = dot(ba, oa);
  let rdoa = dot(rd, oa);
  let oaoa = dot(oa, oa);
  let a = baba - bard * bard;
  let b = baba * rdoa - baoa * bard;
  let c = baba * oaoa - baoa * baoa - r * r * baba;
  let h = b * b - a * c;
  if (h >= 0.0) {
    let t = (-b - sqrt(h)) / a;
    let y = baoa + t * bard;
    if (y > 0.0 && y < baba) { return t; }
    let oc = select(ro - pb, oa, y <= 0.0);
    let b2 = dot(rd, oc);
    let c2 = dot(oc, oc) - r * r;
    let h2 = b2 * b2 - c2;
    if (h2 > 0.0) { return -b2 - sqrt(h2); }
  }
  return -1.0;
}

fn capNormal(p: vec3f, a: vec3f, b: vec3f) -> vec3f {
  let ba = b - a;
  let h = clamp(dot(p - a, ba) / dot(ba, ba), 0.0, 1.0);
  return normalize(p - (a + ba * h));
}

// iq's box intersection, returning t and the face normal.
fn iBox(ro: vec3f, rd: vec3f, c: vec3f, h: vec3f) -> vec4f {
  let m = 1.0 / rd;
  let n = m * (ro - c);
  let k = abs(m) * h;
  let t1 = -n - k;
  let t2 = -n + k;
  let tN = max(max(t1.x, t1.y), t1.z);
  let tF = min(min(t2.x, t2.y), t2.z);
  if (tN > tF || tF < 0.0) { return vec4f(-1.0); }
  let nor = -sign(rd) * step(t1.yzx, t1.xyz) * step(t1.zxy, t1.xyz);
  return vec4f(tN, nor);
}

fn framePart(i: i32) -> array<vec3f, 2> {
  // Four posts, then the two rails. The rods meet in rounded corners.
  let sx = select(-XP, XP, (i & 1) == 1);
  let sz = select(-ZR, ZR, (i & 2) == 2);
  if (i < 4) { return array<vec3f, 2>(vec3f(sx, 0.0, sz), vec3f(sx, TOP, sz)); }
  let z = select(-ZR, ZR, i == 5);
  return array<vec3f, 2>(vec3f(-XP, TOP, z), vec3f(XP, TOP, z));
}

fn eyelet(i: i32) -> vec3f {
  let b = view.ball[i];
  let up = vec3f(-sin(b.w), cos(b.w), 0.0);
  return b.xyz + up * (RB + RE * 0.35);
}

fn trace(ro: vec3f, rd: vec3f, tmax: f32) -> Hit {
  var h = Hit(tmax, vec3f(0.0), MISS);
  for (var i = 0; i < 5; i++) {
    let c = view.ball[i].xyz;
    let t = iSphere(ro, rd, c, RB);
    if (t > 0.0 && t < h.t) { h = Hit(t, normalize(ro + rd * t - c), M_BALL); }
    let e = eyelet(i);
    let te = iSphere(ro, rd, e, RE);
    if (te > 0.0 && te < h.t) { h = Hit(te, normalize(ro + rd * te - e), M_BALL); }
  }
  for (var i = 0; i < 6; i++) {
    let s = framePart(i);
    let t = iCapsule(ro, rd, s[0], s[1], RF);
    if (t > 1e-3 && t < h.t) { h = Hit(t, capNormal(ro + rd * t, s[0], s[1]), M_FRAME); }
  }
  let bx = iBox(ro, rd, vec3f(0.0, BY, 0.0), BX);
  if (bx.x > 0.0 && bx.x < h.t) { h = Hit(bx.x, bx.yzw, M_WOOD); }
  if (rd.y < 0.0) {
    let t = (DESK - ro.y) / rd.y;
    if (t > 0.0 && t < h.t) { h = Hit(t, vec3f(0.0, 1.0, 0.0), M_DESK); }
  }
  return h;
}

// The softbox is big, so shadows are soft: from a point, the light is a disc
// LR radians across, and an occluder a radians across, off its centre by o,
// covers part of it. For a rod the overlap is a strip; for a ball a disc.
const LR = 0.34;

fn cover(o: f32, a: f32) -> f32 {
  return clamp((min(o + a, LR) - max(o - a, -LR)) / (2.0 * LR), 0.0, 1.0);
}

fn sphShadow(p: vec3f, l: vec3f, c: vec3f, r: f32) -> f32 {
  let t = dot(c - p, l);
  if (t <= r * 0.5) { return 1.0; }
  let a = r / t;
  let o = length(c - p - l * t) / t;
  return 1.0 - cover(o, a) * min(1.0, a / LR);
}

fn rodShadow(p: vec3f, l: vec3f, a: vec3f, b: vec3f, r: f32) -> f32 {
  let ba = b - a;
  let pa = p - a;
  let bb = dot(ba, ba);
  let lb = dot(l, ba);
  let den = bb - lb * lb;
  let s = clamp((dot(pa, ba) * 1.0 - lb * dot(l, pa)) / max(den, 1e-6), 0.0, 1.0);
  let q = a + ba * s;
  let t = dot(q - p, l);
  if (t <= r) { return 1.0; }
  let o = length(q - p - l * t) / t;
  return 1.0 - cover(o, r / t);
}

fn shadow(p: vec3f, l: vec3f) -> f32 {
  var s = 1.0;
  for (var i = 0; i < 5; i++) {
    s *= sphShadow(p, l, view.ball[i].xyz, RB);
  }
  for (var i = 0; i < 6; i++) {
    let f = framePart(i);
    s *= rodShadow(p, l, f[0], f[1], RF);
  }
  return s;
}

// How much of the sky a sphere blocks from a point, after iq.
fn sphOcclusion(p: vec3f, n: vec3f, c: vec3f, r: f32) -> f32 {
  let d = c - p;
  let l = length(d);
  let nl = dot(n, d / l);
  let h = l / r;
  return max(0.0, nl) / (h * h);
}

fn ambientOcclusion(p: vec3f, n: vec3f) -> f32 {
  var o = 0.0;
  for (var i = 0; i < 5; i++) { o += sphOcclusion(p, n, view.ball[i].xyz, RB); }
  // The posts stand in the base: a little darker round each foot.
  for (var i = 0; i < 4; i++) {
    let f = framePart(i);
    let d = length(p.xz - f[0].xz);
    o += 0.6 * exp(-max(d - RF, 0.0) * 40.0) * smoothstep(0.08, 0.0, p.y);
  }
  return clamp(1.0 - o, 0.0, 1.0);
}

fn rect(p: vec2f, h: vec2f, soft: f32) -> f32 {
  let q = abs(p) - h;
  return smoothstep(soft, -soft, max(q.x, q.y));
}

// The studio as seen along rd from ro, past everything solid.
fn backdrop(rd: vec3f) -> vec3f {
  // A dark studio, with the spill of the softbox a faint pool on the wall
  // behind the cradle.
  let pool = exp(-sq(rd.y - 0.12) * 14.0) * exp(-sq(rd.x + 0.1) * 3.0) * smoothstep(0.2, -0.6, rd.z);
  return vec3f(0.006, 0.006, 0.007) + vec3f(0.012, 0.011, 0.010) * smoothstep(-0.05, 0.6, rd.y) + vec3f(0.05, 0.046, 0.042) * pool;
}

fn env(ro: vec3f, rd: vec3f) -> vec3f {
  // Black studio walls, a touch of grey from the light bouncing round.
  var c = backdrop(rd);
  // The softbox overhead, brighter at its middle, with its frame.
  if (rd.y > 0.0) {
    let t = (KEY_C.y - ro.y) / rd.y;
    let q = (ro + rd * t).xz - KEY_C.xz;
    let inside = rect(q, KEY_H, 0.08);
    let hot = 1.0 - 0.35 * length(q / KEY_H);
    c = mix(c, KEY_COL * 5.5 * hot, inside);
    // A diffuser seam across it, as a real softbox has.
    c *= 1.0 - 0.25 * inside * smoothstep(0.012, 0.0, abs(q.x + 0.2));
  }
  // A cool strip light behind, on the left, standing upright.
  if (rd.x < 0.0) {
    let t = (-2.0 - ro.x) / rd.x;
    let q = (ro + rd * t).yz - vec2f(1.0, -1.2);
    c = mix(c, vec3f(0.75, 0.85, 1.0) * 4.0, rect(q, vec2f(0.8, 0.16), 0.12));
  }
  // A large, dim warm fill from the camera side.
  if (rd.z > 0.0) {
    let t = (4.0 - ro.z) / rd.z;
    let q = (ro + rd * t).xy - vec2f(1.6, 1.1);
    c = mix(c, vec3f(1.0, 0.86, 0.7) * 0.45, rect(q, vec2f(1.3, 0.7), 0.4));
  }
  // A white card standing off to the right, bouncing the softbox back in.
  if (rd.x > 0.0) {
    let t = (2.4 - ro.x) / rd.x;
    let q = (ro + rd * t).yz - vec2f(0.7, 0.4);
    let card = rect(q, vec2f(0.75, 1.0), 0.25);
    c = mix(c, vec3f(1.0, 0.97, 0.93) * (0.55 + 0.35 * smoothstep(-0.7, 0.7, q.x)), card);
  }
  return c;
}

// Light from the key softbox on a diffuse point, treated as a small area light.
fn keyLight(p: vec3f, n: vec3f) -> vec3f {
  let d = KEY_C - p;
  let dist2 = dot(d, d);
  let l = d / sqrt(dist2);
  let area = 4.0 * KEY_H.x * KEY_H.y;
  let e = max(dot(n, l), 0.0) * l.y * area / (3.14159 * dist2 + area);
  if (e <= 0.0) { return vec3f(0.0); }
  return KEY_COL * e * 5.5 * shadow(p + n * 1e-3, l) * view.shift.z;
}

fn walnut(p: vec3f, n: vec3f) -> vec3f {
  // The grain runs along the base; on its ends you see across it.
  var u = p.z * 34.0;
  var v = p.x * 1.6;
  if (abs(n.z) > 0.5) { u = p.y * 26.0 + p.x * 0.3; }
  if (abs(n.x) > 0.5) { u = length(vec2f(p.z, p.y + 0.6)) * 60.0; v = p.z * 4.0; }
  let warp = vnoise(vec2f(v, u * 0.12)) * 5.0 + vnoise(vec2f(v * 4.0, u * 0.4)) * 1.5 + vnoise(vec2f(v * 0.5, u * 0.03)) * 6.0;
  let ring = fract(u + warp);
  let fig = smoothstep(0.0, 0.25, ring) * smoothstep(1.0, 0.55, ring);
  let pore = vnoise(vec2f(p.x * 90.0, u * 7.0));
  let dark = vec3f(0.050, 0.028, 0.017);
  let light = vec3f(0.15, 0.085, 0.048);
  var c = mix(dark, light, fig * 0.7 + 0.3 * vnoise(vec2f(v * 0.7, u * 0.05)));
  c *= 0.82 + 0.18 * smoothstep(0.25, 0.75, pore);
  return c;
}

fn linen(p: vec3f) -> vec3f {
  let w = p.xz * 520.0;
  let weave = 0.5 + 0.25 * sin(w.x) * sin(w.y + sin(w.x * 0.5) * 0.4);
  let slub = vnoise(p.xz * vec2f(30.0, 220.0)) * 0.5 + vnoise(p.xz * vec2f(240.0, 26.0)) * 0.5;
  let base = vec3f(0.090, 0.082, 0.074);
  return base * (0.82 + 0.18 * weave) * (0.85 + 0.3 * slub);
}

/// Tilts a box normal toward the edge it is near, a small bevel that catches
/// the light along the corners of the base.
fn bevel(p: vec3f, n: vec3f) -> vec3f {
  let q = p - vec3f(0.0, BY, 0.0);
  let e = BX - abs(q);
  let b = 0.007;
  var m = n;
  let s = sign(q);
  if (abs(n.y) > 0.5) {
    m += vec3f(s.x * smoothstep(b, 0.0, e.x), 0.0, s.z * smoothstep(b, 0.0, e.z));
  } else if (abs(n.z) > 0.5) {
    m += vec3f(s.x * smoothstep(b, 0.0, e.x), s.y * smoothstep(b, 0.0, e.y), 0.0);
  } else {
    m += vec3f(0.0, s.y * smoothstep(b, 0.0, e.y), s.z * smoothstep(b, 0.0, e.z));
  }
  return normalize(m);
}

fn fresnel(f0: vec3f, c: f32) -> vec3f {
  let k = pow(1.0 - clamp(c, 0.0, 1.0), 5.0);
  return f0 + (1.0 - f0) * k;
}

// The nylon lines, drawn over the first hit as hairlines: each one is two,
// from the ball's eyelet up to the rail either side.
fn lines(ro: vec3f, rd: vec3f, tmax: f32, col: vec3f, pxa: f32) -> vec3f {
  var c = col;
  for (var i = 0; i < 5; i++) {
    let e = eyelet(i) + vec3f(0.0, RE * 0.6, 0.0);
    let top = vec3f(view.ball[i].x - sin(view.ball[i].w) * LEN, TOP - RF * 0.6, 0.0);
    for (var j = 0; j < 2; j++) {
      let a = e;
      let b = vec3f(top.x, top.y, select(-ZR, ZR, j == 1));
      let ba = b - a;
      let oa = ro - a;
      let bb = dot(ba, ba);
      let rb = dot(rd, ba);
      let den = bb - rb * rb;
      let s = clamp((dot(oa, ba) - rb * dot(rd, oa)) / max(den, 1e-7), 0.0, 1.0);
      let q = a + ba * s;
      let t = dot(q - ro, rd);
      if (t <= 0.0 || t > tmax) { continue; }
      let d = length(ro + rd * t - q);
      let w = t * pxa;
      let cover = clamp(2.0 * RS / w, 0.0, 1.0) * clamp(1.0 - (d - RS) / w, 0.0, 1.0);
      if (cover <= 0.0) { continue; }
      // Clear nylon: it glows where the softbox lights it from behind and
      // along its length, otherwise it is nearly invisible.
      let dir = normalize(ba);
      let l = normalize(KEY_C - q);
      let glint = pow(1.0 - abs(dot(dir, normalize(l - rd))), 6.0);
      let lc = vec3f(0.03, 0.03, 0.032) + KEY_COL * (0.12 + 1.2 * glint) * view.shift.z;
      c = mix(c, lc, cover * 0.7);
    }
  }
  return c;
}

fn radiance(ro0: vec3f, rd0: vec3f, pxa: f32) -> vec3f {
  var ro = ro0;
  var rd = rd0;
  var thr = vec3f(1.0);
  var col = vec3f(0.0);
  for (var b = 0; b < 5; b++) {
    let h = trace(ro, rd, 40.0);
    if (h.m == MISS) {
      // The lights only show in the steel; straight on, the studio is dark.
      col += thr * select(backdrop(rd), env(ro, rd), b > 0);
      break;
    }
    let p = ro + rd * h.t;
    var n = h.n;
    if (h.m == M_BALL || h.m == M_FRAME) {
      // Polished steel and chrome: almost all mirror, a trace of diffuse.
      let f0 = select(vec3f(0.80, 0.79, 0.77), vec3f(0.72, 0.72, 0.73), h.m == M_FRAME);
      let c = -dot(rd, n);
      let f = fresnel(f0, c);
      col += thr * vec3f(0.006) * (1.0 - f);
      // A rod's rim turns thinner than a pixel; fade it rather than let it
      // sparkle.
      thr *= f * select(1.0, smoothstep(0.02, 0.25, c), h.m == M_FRAME);
      ro = p + n * 3e-3;
      rd = reflect(rd, n);
      continue;
    }
    if (h.m == M_WOOD) {
      n = bevel(p, n);
      let alb = walnut(p, h.n);
      let ao = ambientOcclusion(p, n);
      let c = max(-dot(rd, n), 0.0);
      let f = fresnel(vec3f(0.04), c);
      let lit = keyLight(p, n) + vec3f(0.05, 0.048, 0.046) * (0.4 + 0.6 * max(n.y, 0.0)) * ao;
      col += thr * alb * lit * (1.0 - f);
      // Lacquer: a clear coat that mirrors at a glancing angle, the grain
      // just breaking it up a little.
      if (b >= 3) { break; }
      thr *= f * 0.9;
      ro = p + n * 1e-3;
      rd = reflect(rd, n);
      continue;
    }
    // The desk: dark linen, matte.
    let alb = linen(p);
    let ao = ambientOcclusion(p, n);
    // Near the base the linen sits in its shade and bounce.
    let near = length(max(abs(p.xz) - BX.xz, vec2f(0.0)));
    let contact = 1.0 - 0.6 * exp(-near * 22.0);
    let lit = keyLight(p, n) + vec3f(0.035, 0.034, 0.033) * ao * contact;
    // The pool of light falls off into the dark of the studio.
    let fall = exp(-dot(p.xz, p.xz) * 0.09);
    col += thr * mix(backdrop(rd), alb * lit * contact, fall);
    break;
  }
  return col;
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
  let pxa = 1.0 / (view.res.y * f);
  var col = vec3f(0.0);
  // Two rays a pixel, on a diagonal, so the mirror edges stay clean.
  for (var k = 0; k < 2; k++) {
    let o = select(vec2f(-0.25, 0.25), vec2f(0.25, -0.25), k == 1) / view.res;
    let q = uv + o;
    let s = vec2f((q.x - 0.5) * view.aspect, 0.5 - q.y) + view.shift.xy;
    let rd = normalize(s.x * uu + s.y * vv + f * ww);
    let h = trace(ro, rd, 40.0);
    var c = radiance(ro, rd, pxa);
    c = lines(ro, rd, select(h.t, 40.0, h.m == MISS), c, pxa);
    col += c * 0.5;
  }
  col = aces(col * 1.25);
  col = pow(col, vec3f(1.0 / 2.2));
  col *= 1.0 - 0.28 * smoothstep(0.4, 1.0, length((uv - 0.5) * vec2f(1.0, 1.1)) * 1.25);
  col += (hash21(uv * view.res) - 0.5) / 255.0;
  return vec4f(col, 1.0);
}
