// Calibre: a mechanical watch movement seen through the caseback, close up.
// Perlage on the plate, Geneva stripes and polished bevels on the bridges,
// gilt wheels, blued screws and rubies. The pointer is a small lamp, so every
// finish lights up as it passes; the balance swings and the train ticks.
import { hash21, filmic } from "../../shaders/common.wgsl";

struct Params {
  res: vec2f,
  lamp: vec2f,     // lamp position over the movement, in movement units
  view: vec2f,     // where the movement's centre sits on screen
  time: f32,
  aspect: f32,
  balance: f32,    // balance wheel angle
  smear: f32,      // how far the balance turns during one frame
  esc: f32,        // escape wheel angle
  lever: f32,      // pallet lever angle
  ratchet: f32,    // ratchet wheel angle (winding)
  power: f32,      // lamp brightness
  scale: f32,      // movement units to screen-height units
  _p0: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

const TAU = 6.2831853;
// Arbors, in screen-height units around the screen's centre, y up. Each wheel
// sits one wheel radius plus one pinion radius from the next.
const BR = vec2f(-0.32, 0.22);
const CE = vec2f(-0.06, 0.174);
const TW = vec2f(0.073, 0.062);
const FW = vec2f(0.159, 0.165);
const EW = vec2f(0.221, 0.058);
const LV = vec2f(0.297, 0.0096);
const BAL = vec2f(0.44, -0.082);
const LDIR = vec2f(0.843, -0.538);
// The round main plate the whole movement is built on.
const PC = vec2f(0.02, 0.11);
const PR = 0.68;

var<private> PX: f32;
var<private> LAMP: vec3f;

fn rot2(a: f32) -> mat2x2f {
  let c = cos(a);
  let s = sin(a);
  return mat2x2f(c, s, -s, c);
}

fn capsule(p: vec2f, a: vec2f, b: vec2f, r: f32) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

fn smin(a: f32, b: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

fn cover(d: f32) -> f32 {
  return clamp(0.5 - d / PX, 0.0, 1.0);
}

// ---------------------------------------------------------------- shapes

/// A gilt wheel: N teeth on radius R, with spokes and a hub.
fn gear(q: vec2f, R: f32, N: f32, rot: f32, spokes: f32, hub: f32) -> f32 {
  let r = length(q);
  let a = atan2(q.y, q.x) - rot;
  let sec = TAU / N;
  let at = a - sec * round(a / sec);
  let tx = r * cos(at);
  let ty = r * sin(at);
  let h = 0.0068;
  let base = R - h;
  let pitch = R * sec;
  let u = clamp((tx - base) / h, 0.0, 1.0);
  let hw = pitch * mix(0.27, 0.12, u * u);
  let tooth = max(abs(ty) - hw, tx - R);
  var d = min(r - base, tooth);
  let ss = TAU / spokes;
  let asp = a - ss * round(a / ss);
  let rimIn = base - 0.012;
  let rr = 0.004;
  let sw = 0.005 + R * 0.025;
  let win = max(max(hub + rr - r, r - (rimIn - rr)), sw + rr - abs(r * sin(asp))) - rr;
  d = max(d, -win);
  return d;
}

/// The escape wheel: fifteen leaning club teeth on a thin rim, five spokes.
fn escape(q: vec2f, rot: f32) -> f32 {
  let R = 0.065;
  let r = length(q);
  let a = atan2(q.y, q.x) - rot;
  let sec = TAU / 15.0;
  let at = a - sec * round(a / sec);
  let tx = r * cos(at);
  let ty = r * sin(at);
  let base = R - 0.017;
  let u = clamp((tx - base) / 0.017, 0.0, 1.0);
  let yy = ty + (tx - base) * 0.6;
  let hw = mix(0.0028, 0.0046, u * u);
  let tooth = max(abs(yy) - hw, max(tx - R, base - 0.004 - tx));
  let rim = abs(r - (base - 0.003)) - 0.0042;
  let ss = TAU / 5.0;
  let asp = a - ss * round(a / ss);
  let spoke = max(abs(r * sin(asp)) - 0.0028, r - base);
  return min(min(min(tooth, rim), spoke), r - 0.011);
}

/// The pallet lever, in its own frame: x toward the balance.
fn leverShape(p: vec2f) -> vec2f {
  let lq = rot2(-params.lever) * (p - LV);
  let P = vec2f(-LDIR.y, LDIR.x);
  let x = dot(lq, LDIR);
  let y = dot(lq, P);
  let q = vec2f(x, y);
  var d = capsule(q, vec2f(-0.015, 0.0), vec2f(0.132, 0.0), 0.0034);
  d = min(d, length(q) - 0.0085);
  d = min(d, capsule(q, vec2f(0.0, 0.0), vec2f(-0.036, 0.04), 0.0032));
  d = min(d, capsule(q, vec2f(0.0, 0.0), vec2f(-0.036, -0.04), 0.0032));
  d = min(d, capsule(q, vec2f(0.128, 0.0068), vec2f(0.15, 0.0068), 0.0024));
  d = min(d, capsule(q, vec2f(0.128, -0.0068), vec2f(0.15, -0.0068), 0.0024));
  // The two pallet stones, red, at the escape wheel's teeth.
  let s1 = abs(rot2(-0.5) * (q - vec2f(-0.043, 0.045))) - vec2f(0.0055, 0.0028);
  let s2 = abs(rot2(0.5) * (q - vec2f(-0.043, -0.045))) - vec2f(0.0055, 0.0028);
  let stone = min(length(max(s1, vec2f(0.0))) + min(max(s1.x, s1.y), 0.0), length(max(s2, vec2f(0.0))) + min(max(s2.x, s2.y), 0.0));
  return vec2f(min(d, stone), stone);
}

fn barrelBridge(p: vec2f) -> f32 {
  return smin(length(p - BR) - 0.205, capsule(p, BR, BR + vec2f(-0.5, 0.39), 0.105), 0.05);
}

fn trainBridge(p: vec2f) -> f32 {
  var d = capsule(p, CE, TW, 0.042);
  d = smin(d, capsule(p, TW, FW, 0.04), 0.08);
  d = smin(d, capsule(p, FW, EW, 0.038), 0.08);
  d = smin(d, capsule(p, FW, vec2f(0.33, 1.0), 0.05), 0.08);
  d = smin(d, capsule(p, CE, vec2f(-0.02, 1.0), 0.048), 0.08);
  // The small pallet bridge over the lever's pivot.
  d = min(d, capsule(p, LV, LV + vec2f(0.06, 0.13), 0.021));
  return d;
}

fn inPlate(p: vec2f) -> f32 {
  return length(p - PC) - (PR - 0.016);
}

fn bridges(p: vec2f) -> f32 {
  return max(min(barrelBridge(p), trainBridge(p)), inPlate(p));
}

fn cock(p: vec2f) -> f32 {
  return max(smin(length(p - BAL) - 0.046, capsule(p, BAL, BAL + vec2f(0.66, 0.18), 0.03), 0.03), inPlate(p));
}

fn ratchetShape(q: vec2f, rot: f32) -> f32 {
  let r = length(q);
  let a = atan2(q.y, q.x) - rot;
  let N = 54.0;
  let f = fract(a * N / TAU);
  let R = 0.158;
  let h = 0.0065;
  var d = r - (R - h * f);
  // The steep face of each tooth: measure across it, not radially.
  if (r > R - h && r < R) {
    let s = TAU / N * r;
    if (d > 0.0) {
      d = min(d, (1.0 - f) * s);
    } else {
      d = -min(-d, f * s);
    }
  }
  return d;
}

/// Balance rim, arms and rim screws, smeared over the turn of one frame.
/// Returns (coverage, sd of the still parts).
fn balanceCover(q: vec2f) -> vec2f {
  let r = length(q);
  let rim = abs(r - 0.158) - 0.009;
  let still = min(rim, r - 0.013);
  var moving = 0.0;
  for (var i = 0; i < 4; i++) {
    let ang = params.balance + params.smear * ((f32(i) + 0.5) / 4.0 - 0.5);
    let a = atan2(q.y, q.x) - ang;
    let s3 = TAU / 3.0;
    let a3 = a - s3 * round(a / s3);
    let arm = max(abs(r * sin(a3)) - 0.0042, r - 0.152);
    let s12 = TAU / 12.0;
    let a12 = a - s12 * round(a / s12) + s12 * 0.5;
    let a12w = a12 - s12 * round(a12 / s12);
    let screw = length(vec2f(r * cos(a12w), r * sin(a12w)) - vec2f(0.169, 0.0)) - 0.0056;
    moving += cover(min(arm, screw));
  }
  return vec2f(max(cover(still), moving / 4.0), still);
}

fn hairspring(q: vec2f) -> f32 {
  let r = length(q);
  let r0 = 0.03;
  let r1 = 0.118;
  let turns = 11.0;
  // It winds and unwinds with the balance: turns a little and breathes.
  let k = (r1 - r0) / (turns * TAU) * (1.0 - 0.012 * params.balance);
  let a = atan2(q.y, q.x) - params.balance * 0.5;
  let am = a - TAU * floor(a / TAU);
  let n = clamp(round((r - r0 - k * am) / (k * TAU)), 0.0, turns - 1.0);
  return abs(r - r0 - k * (am + TAU * n)) - 0.0011;
}

// ---------------------------------------------------------------- light

fn lobe(T: vec3f, n: vec3f, l: vec3f, e: f32) -> f32 {
  let hv = normalize(l + vec3f(0.0, 0.0, 1.0));
  let Tn = normalize(T - n * dot(T, n) + vec3f(1e-5, 0.0, 0.0));
  let th = dot(Tn, hv);
  let s = sqrt(max(1.0 - th * th, 0.0));
  let nl = max(dot(n, l), 0.0);
  return nl * 0.16 + (pow(s, e * 0.1) * 0.3 + pow(s, e) * 1.5) * smoothstep(0.0, 0.25, nl);
}

/// Brushed metal: the highlight runs across the grain.
fn brushed(base: vec3f, T2: vec2f, n: vec3f, p: vec2f, h: f32, e: f32) -> vec3f {
  let T = vec3f(T2, 0.0);
  let lv = LAMP - vec3f(p, h);
  let dl = length(lv);
  let l = lv / dl;
  let att = params.power * 0.36 / (0.18 + dl * dl);
  let k = normalize(vec3f(-0.5, 0.6, 0.62));
  return base * (0.06 + lobe(T, n, l, e) * att + lobe(T, n, k, e) * 0.34);
}

/// Mirror polish: a sharp glint from the lamp and a soft studio reflection.
fn polished(base: vec3f, n: vec3f, p: vec2f, h: f32, e: f32) -> vec3f {
  let v = vec3f(0.0, 0.0, 1.0);
  let lv = LAMP - vec3f(p, h);
  let dl = length(lv);
  let l = lv / dl;
  let att = params.power * 0.36 / (0.18 + dl * dl);
  let hv = normalize(l + v);
  let k = normalize(vec3f(-0.5, 0.6, 0.62));
  let hk = normalize(k + v);
  let R = reflect(-v, n);
  let env = 0.05 + 0.4 * smoothstep(0.2, 0.95, dot(R, k)) + 0.12 * smoothstep(0.0, 1.0, R.z);
  let spec = pow(max(dot(n, hv), 0.0), e) * 3.0 * att + pow(max(dot(n, hk), 0.0), e) * 0.6;
  return base * (env + spec + max(dot(n, l), 0.0) * 0.08 * att);
}

// ---------------------------------------------------------------- finishes

/// Perlage: overlapping spots of circular graining, each laid over the last.
fn plate(p: vec2f) -> vec3f {
  let s = 0.046;
  let rad = s * 0.8;
  let cell = floor(p / s);
  var best = -1e9;
  var bc = vec2f(0.0);
  var bh = 0.0;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let c = cell + vec2f(f32(i), f32(j));
      let jit = vec2f(hash21(c), hash21(c + 17.0)) - 0.5;
      let ctr = (c + 0.5 + jit * 0.16) * s;
      let ord = c.y * 4096.0 + c.x;
      if (length(p - ctr) < rad && ord > best) {
        best = ord;
        bc = ctr;
        bh = hash21(c + 5.0);
      }
    }
  }
  let q = p - bc;
  let r = length(q);
  let rn = r / rad;
  let T = vec2f(-q.y, q.x) / max(r, 1e-5);
  let n = normalize(vec3f(-q / rad * 0.12, 1.0));
  let grain = 0.95 + 0.05 * sin(r * 1500.0 + bh * 6.0);
  let seam = smoothstep(0.9, 1.0, rn);
  let base = vec3f(0.3, 0.3, 0.315) * grain * (1.0 - 0.12 * seam);
  // Kept quieter than the bridges: perlage is the backdrop, not the subject.
  return mix(base * 0.3, brushed(base, T, n, p, 0.0, 140.0), 0.55);
}

/// Côtes de Genève: wide bands, each brushed in shallow arcs and slightly crowned.
fn geneva(p: vec2f, h: f32, base: vec3f) -> vec3f {
  let D = normalize(vec2f(1.0, -0.32));
  let P = vec2f(-D.y, D.x);
  let w = 0.042;
  let c = dot(p, P) / w;
  let f = fract(c) - 0.5;
  let T = rot2(f * 1.1) * D;
  let n = normalize(vec3f(P * f * 0.8, 1.0));
  let seam = smoothstep(0.42, 0.5, abs(f));
  let grain = 0.95 + 0.05 * sin(dot(p, T) * 2600.0 + floor(c) * 3.0);
  return brushed(base * grain * (1.0 - 0.35 * seam), T, n, p, h, 120.0);
}

/// A bridge: Geneva stripes on top, a polished bevel along every edge.
fn bridgeShade(p: vec2f, d: f32, g: vec2f, h: f32) -> vec3f {
  let top = geneva(p, h, vec3f(0.74, 0.75, 0.78));
  let bev = smoothstep(-0.0062, -0.0048, d);
  if (bev <= 0.0) {
    return top;
  }
  let n = normalize(vec3f(g * 0.85, 0.55));
  let edge = polished(vec3f(0.9, 0.91, 0.94), n, p, h, 160.0);
  // A fine dark line where the bevel meets the stripes, and at the outer edge.
  let lines = 1.0 - 0.5 * exp(-pow((d + 0.0055) / 0.0007, 2.0));
  return mix(top, edge, bev) * lines;
}

fn jewel(col: vec3f, p: vec2f, c: vec2f, h: f32) -> vec3f {
  let q = p - c;
  let r = length(q);
  if (r > 0.02) {
    return col;
  }
  // A polished sink around a domed ruby with a pivot hole.
  let sinkN = normalize(vec3f(-q / max(r, 1e-5) * 0.8, 1.0));
  var out = mix(col, polished(vec3f(0.85, 0.86, 0.9), sinkN, p, h, 200.0), cover(r - 0.0148));
  let z = sqrt(max(1.0 - (r / 0.0098) * (r / 0.0098), 0.0));
  let n = normalize(vec3f(q / 0.0098, z * 1.4 + 0.1));
  let lv = normalize(LAMP - vec3f(p, h));
  let glow = vec3f(0.95, 0.06, 0.12) * (0.12 + 0.9 * pow(max(dot(-n.xy, lv.xy) * 0.5 + 0.5, 0.0), 3.0) * params.power);
  let ruby = glow * 0.6 + polished(vec3f(1.0, 0.75, 0.78), n, p, h + 0.004, 300.0) * 0.6;
  out = mix(out, ruby, cover(r - 0.0098));
  out = mix(out, vec3f(0.02, 0.0, 0.0), cover(r - 0.0018) * 0.9);
  return out;
}

fn screw(col: vec3f, p: vec2f, c: vec2f, h: f32, R: f32) -> vec3f {
  let q = p - c;
  let r = length(q);
  if (r > R + 0.004) {
    return col;
  }
  let z = sqrt(max(1.0 - (r / R) * (r / R), 0.0));
  let n = normalize(vec3f(q / R * 0.55, z + 0.3));
  let blue = vec3f(0.12, 0.24, 0.78);
  var head = polished(blue, n, p, h, 120.0) + blue * 0.05;
  // Polished chamfer round the head.
  let rim = smoothstep(R - 0.003, R - 0.0018, r);
  head = mix(head, polished(vec3f(0.6, 0.66, 0.85), normalize(vec3f(q / max(r, 1e-5) * 1.2, 0.6)), p, h, 160.0), rim);
  // The slot.
  let ang = hash21(c * 31.0) * 3.14159;
  let sq = rot2(-ang) * q;
  let slot = max(abs(sq.y) - 0.0016, abs(sq.x) - R * 0.82);
  head = mix(head, vec3f(0.01, 0.015, 0.04), cover(slot));
  // Contact shadow on the bridge round it.
  var out = col * (1.0 - 0.45 * smoothstep(0.004, 0.0, r - R));
  out = mix(out, head, cover(r - R));
  return out;
}

fn shadowAt(d: f32, dh: f32) -> f32 {
  let s = 0.002 + dh * 0.35;
  return 1.0 - 0.6 * smoothstep(s, -s, d);
}

fn contact(d: f32) -> f32 {
  return 1.0 - 0.35 * smoothstep(0.01, 0.0, d) * step(0.0, d);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let a = params.aspect;
  let ps = vec2f((uv.x - 0.5) * a, 0.5 - uv.y);
  let p = (ps - params.view) / params.scale + PC;
  PX = 1.0 / max(params.res.y * params.scale, 1.0);
  LAMP = vec3f(params.lamp, 0.42);
  let gold = vec3f(1.0, 0.74, 0.4);
  let steel = vec3f(0.78, 0.8, 0.84);

  // The direction from a point toward the lamp, for every shadow offset.
  let lc = normalize(LAMP - vec3f(p, 0.02));
  let o = lc.xy / max(lc.z, 0.3);

  // Outside the movement: black velvet, shaded by the plate's edge.
  let pd = length(p - PC) - PR;
  var col = vec3f(0.012, 0.011, 0.012) * (0.85 + 0.15 * hash21(floor(p * 900.0)));
  col *= 1.0 - 0.7 * smoothstep(0.06, 0.0, pd);
  var hc = 0.0;
  if (pd < PX) {
    var pc = plate(p);
    // The plate's turned edge: a polished chamfer catching the lamp.
    let bev = smoothstep(-0.011, -0.008, pd);
    if (bev > 0.0) {
      let nr = normalize(vec3f((p - PC) / length(p - PC) * 0.9, 0.5));
      pc = mix(pc, polished(vec3f(0.85, 0.86, 0.9), nr, p, 0.0, 140.0), bev);
      pc *= 1.0 - 0.5 * exp(-pow((pd + 0.0095) / 0.0008, 2.0));
    }
    col = mix(col, pc, cover(pd));
  }

  // The going train, from the barrel up to the escape wheel. Each is driven
  // by the one before it through a pinion of eight leaves.
  let r4 = -params.esc * 8.0 / 63.0;
  let r3 = -r4 * 8.0 / 69.0;
  let r2 = -r3 * 8.0 / 91.0;

  // Barrel.
  {
    let hi = 0.005;
    col *= shadowAt(gear(p + o * (hi - hc) - BR, 0.25, 143.0, 0.3, 4.0, 0.075), hi - hc);
    let d = gear(p - BR, 0.25, 143.0, 0.3, 4.0, 0.075);
    col *= contact(d);
    let cv = cover(d);
    if (cv > 0.0) {
      let q = p - BR;
      var c = brushed(gold * 0.9, vec2f(-q.y, q.x) / max(length(q), 1e-5), vec3f(0.0, 0.0, 1.0), p, hi, 90.0);
      c *= mix(0.5, 1.0, smoothstep(0.0, 0.0025, -d));
      col = mix(col, c, cv);
      hc = mix(hc, hi, cv);
    }
  }
  // Centre, third and fourth wheels.
  for (var w = 0; w < 3; w++) {
    var C = CE;
    var R = 0.16;
    var N = 91.0;
    var rot = r2;
    var hi = 0.008;
    var sp = 5.0;
    if (w == 1) {
      C = TW; R = 0.12; N = 69.0; rot = r3 + 0.2; hi = 0.01; sp = 4.0;
    } else if (w == 2) {
      C = FW; R = 0.11; N = 63.0; rot = r4; hi = 0.012; sp = 5.0;
    }
    col *= shadowAt(gear(p + o * (hi - hc) - C, R, N, rot, sp, 0.018), hi - hc);
    let d = gear(p - C, R, N, rot, sp, 0.018);
    col *= contact(d);
    let cv = cover(d);
    if (cv > 0.0) {
      let q = p - C;
      var c = brushed(gold, vec2f(-q.y, q.x) / max(length(q), 1e-5), vec3f(0.0, 0.0, 1.0), p, hi, 110.0);
      c *= mix(0.5, 1.0, smoothstep(0.0, 0.0025, -d));
      col = mix(col, c, cv);
      hc = mix(hc, hi, cv);
    }
  }
  // Escape wheel, polished steel.
  {
    let hi = 0.014;
    col *= shadowAt(escape(p + o * (hi - hc) - EW, params.esc), hi - hc);
    let d = escape(p - EW, params.esc);
    col *= contact(d);
    let cv = cover(d);
    if (cv > 0.0) {
      let q = p - EW;
      var c = brushed(steel, vec2f(-q.y, q.x) / max(length(q), 1e-5), vec3f(0.0, 0.0, 1.0), p, hi, 200.0) * 1.1;
      c *= mix(0.5, 1.0, smoothstep(0.0, 0.002, -d));
      col = mix(col, c, cv);
      hc = mix(hc, hi, cv);
    }
  }
  // Pallet lever.
  {
    let hi = 0.016;
    col *= shadowAt(leverShape(p + o * (hi - hc)).x, hi - hc);
    let ld = leverShape(p);
    col *= contact(ld.x);
    let cv = cover(ld.x);
    if (cv > 0.0) {
      var c = polished(steel, vec3f(0.0, 0.0, 1.0), p, hi, 140.0);
      c *= mix(0.45, 1.0, smoothstep(0.0, 0.0018, -ld.x));
      let ruby = vec3f(0.8, 0.05, 0.1) * (0.25 + 0.6 * params.power);
      c = mix(c, ruby, cover(ld.y));
      col = mix(col, c, cv);
      hc = mix(hc, hi, cv);
    }
  }
  // Balance wheel and hairspring.
  {
    let hi = 0.018;
    let bs = balanceCover(p + o * (hi - hc) - BAL);
    col *= 1.0 - 0.55 * bs.x;
    let bc = balanceCover(p - BAL);
    if (bc.x > 0.0) {
      let q = p - BAL;
      let c = brushed(gold * 1.05, vec2f(-q.y, q.x) / max(length(q), 1e-5), vec3f(0.0, 0.0, 1.0), p, hi, 60.0) * 0.8
        + polished(gold, vec3f(0.0, 0.0, 1.0), p, hi, 90.0) * 0.4;
      col = mix(col, c, bc.x);
      hc = mix(hc, hi, bc.x);
    }
    let hs = 0.02;
    col *= shadowAt(hairspring(p + o * (hs - hc) - BAL), hs - hc);
    let sd = hairspring(p - BAL);
    let sc = cover(sd);
    if (sc > 0.0) {
      let q = p - BAL;
      let nrm = normalize(vec3f(q / max(length(q), 1e-5) * 0.0, 1.0));
      let c = brushed(vec3f(0.2, 0.32, 0.85), vec2f(-q.y, q.x) / max(length(q), 1e-5), nrm, p, hs, 40.0) * 1.3;
      col = mix(col, c, sc);
    }
  }
  // Bridges, with the ratchet wheel on the barrel bridge.
  {
    let hi = 0.022;
    col *= shadowAt(bridges(p + o * (hi - hc)), hi - hc);
    let d = bridges(p);
    col *= contact(d);
    let cv = cover(d);
    if (cv > 0.0) {
      let e = vec2f(0.0007, 0.0);
      let g = normalize(vec2f(bridges(p + e.xy) - bridges(p - e.xy), bridges(p + e.yx) - bridges(p - e.yx)) + 1e-7);
      col = mix(col, bridgeShade(p, d, g, hi), cv);
      hc = mix(hc, hi, cv);
    }
    let hr = 0.025;
    let qr = p - BR;
    col *= shadowAt(ratchetShape(qr + o * (hr - hc), params.ratchet), hr - hc);
    let rd = ratchetShape(qr, params.ratchet);
    let rc = cover(rd);
    if (rc > 0.0) {
      // Soleil: grained in rays from the centre, so the light lies in a ring.
      let rr = length(qr);
      var c = brushed(steel, qr / max(rr, 1e-5), vec3f(0.0, 0.0, 1.0), p, hr, 150.0);
      c *= mix(0.45, 1.0, smoothstep(0.0, 0.002, -rd));
      c *= 1.0 - 0.4 * exp(-pow((rr - 0.135) / 0.0012, 2.0));
      col = mix(col, c, rc);
      hc = mix(hc, hr, rc);
    }
    col = screw(col, p, BR, 0.027, 0.03);
    col = jewel(col, p, CE, hi);
    col = jewel(col, p, TW, hi);
    col = jewel(col, p, FW, hi);
    col = jewel(col, p, EW, hi);
    col = jewel(col, p, LV + vec2f(0.0, 0.0), hi);
    col = screw(col, p, BR + vec2f(-0.2, 0.155), hi, 0.016);
    col = screw(col, p, vec2f(0.0065, 0.118), hi, 0.015);
    col = screw(col, p, vec2f(0.205, 0.39), hi, 0.016);
    col = screw(col, p, LV + vec2f(0.05, 0.11), hi, 0.012);
  }
  // Balance cock.
  {
    let hi = 0.032;
    col *= shadowAt(cock(p + o * (hi - hc)), hi - hc);
    let d = cock(p);
    col *= contact(d);
    let cv = cover(d);
    if (cv > 0.0) {
      let e = vec2f(0.0007, 0.0);
      let g = normalize(vec2f(cock(p + e.xy) - cock(p - e.xy), cock(p + e.yx) - cock(p - e.yx)) + 1e-7);
      col = mix(col, bridgeShade(p, d, g, hi), cv);
    }
    col = jewel(col, p, BAL, hi);
    col = screw(col, p, BAL + vec2f(0.19, 0.052), hi, 0.015);
  }

  // A soft falloff to the corners, as in a macro photograph.
  let vg = length(uv - 0.5);
  col *= 1.0 - 0.45 * smoothstep(0.35, 0.85, vg);
  col = filmic(col * 1.3);
  col += (hash21(uv * params.res + fract(params.time) * 17.0) - 0.5) / 255.0;
  return vec4f(col, 1.0);
}
