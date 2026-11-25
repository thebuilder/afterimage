// A record deck seen from straight above under one warm lamp. A walnut
// plinth with a lacquered top, the aluminium platter rim, a black record with
// its grooves, track gaps, run-out and label, and the tonearm with its
// counterweight, tube and headshell, all lit by the lamp and casting soft
// shadows. The grooves are many tiny concentric ridges, so they reflect the
// lamp only where the light's half vector is square to them: a radial bow tie
// of light through the spindle, fringed with the rainbow the grooves make as
// a diffraction grating. Dust and fine scratches turn with the record and
// catch the lamp as they pass.
import { hash21 } from "../../shaders/common.wgsl";

struct View {
  res: vec2f,
  aspect: f32,
  time: f32,
  angle: f32,     // record rotation, radians
  lampOn: f32,
  _p0: f32,
  _p1: f32,
  lamp: vec4f,    // x, y, height, intensity
  rec: vec4f,     // centre x, y, record radius, needle radius
  arm: vec4f,     // pivot x, y, arm tube end x, y
  head: vec4f,    // needle x, y, headshell direction x, y
}
@group(0) @binding(0) var<uniform> view: View;

const LAMP_COL = vec3f(1.0, 0.9, 0.76);
const WINDOW = vec3f(-0.45, 0.55, 0.7);
const Z_PLINTH = 0.0;
const Z_RECORD = 0.045;
const Z_ARM = 0.1;

var<private> px: f32;

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2f(1.0, 0.0)), u.x), mix(hash21(i + vec2f(0.0, 1.0)), hash21(i + vec2f(1.0, 1.0)), u.x), u.y);
}

fn sq(x: f32) -> f32 { return x * x; }

fn bands(a: f32, c: vec3f, w: f32) -> vec3f {
  let d = (vec3f(a) - c) / w;
  return exp(-d * d);
}

/// Light off the grooves for a half vector at th from square to them: a white
/// core, and either side the colours the grooves split it into.
fn grooveLight(th: f32, w: f32) -> vec3f {
  let core = exp(-th * th / w) * 1.3 + exp(-th * th / (w * 10.0)) * 0.08;
  let a = abs(th);
  var rainbow = bands(a, vec3f(0.105, 0.085, 0.066), 0.012);
  rainbow += 0.4 * bands(a, vec3f(0.21, 0.17, 0.132), 0.018);
  return LAMP_COL * core + rainbow * 0.13;
}

fn rot(v: vec2f, a: f32) -> vec2f {
  let c = cos(a);
  let s = sin(a);
  return vec2f(c * v.x - s * v.y, s * v.x + c * v.y);
}

/// Coverage of a shape from its signed distance, one pixel wide.
fn cover(d: f32) -> f32 {
  return clamp(0.5 - d / px, 0.0, 1.0);
}

fn segDist(p: vec2f, a: vec2f, b: vec2f) -> vec2f {
  let ab = b - a;
  let h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-9), 0.0, 1.0);
  return vec2f(length(p - a - ab * h), h);
}

fn boxDist(p: vec2f, c: vec2f, dir: vec2f, ext: vec2f, rnd: f32) -> f32 {
  let o = p - c;
  let q = vec2f(dot(o, dir), dir.x * o.y - dir.y * o.x);
  let d = abs(q) - ext + rnd;
  return length(max(d, vec2f(0.0))) + min(max(d.x, d.y), 0.0) - rnd;
}

/// Light from the lamp reaching a point at height z with normal n: the
/// direction to the lamp, and the irradiance.
fn lampAt(p: vec2f, z: f32) -> vec4f {
  let d = vec3f(view.lamp.xy - p, view.lamp.z - z);
  let r2 = dot(d, d);
  let L = d * inverseSqrt(r2);
  return vec4f(L, view.lamp.w * 1.3 / (0.55 + r2));
}

/// Plastic or lacquer: diffuse plus a soft and a sharp specular lobe.
fn shade(base: vec3f, n: vec3f, p: vec2f, z: f32, gloss: f32, sharp: f32) -> vec3f {
  let l = lampAt(p, z);
  let L = l.xyz;
  let H = normalize(L + vec3f(0.0, 0.0, 1.0));
  let nl = max(dot(n, L), 0.0);
  let nh = max(dot(n, H), 0.0);
  let spec = gloss * (pow(nh, 40.0) * 0.25 + pow(nh, sharp) * 2.0);
  let fill = 0.08 + 0.1 * max(dot(n, normalize(WINDOW)), 0.0);
  return base * (fill + nl * l.w) + LAMP_COL * spec * l.w;
}

/// The tonearm and everything on it, as one distance for shadows.
fn armDist(p: vec2f) -> f32 {
  let R = view.rec.z;
  let P = view.arm.xy;
  let J = view.arm.zw;
  let N = view.head.xy;
  let hd = view.head.zw;
  let ad = normalize(J - P);
  var d = segDist(p, P, J).x - R * 0.021;
  d = min(d, segDist(p, P - ad * R * 0.2, P - ad * R * 0.36).x - R * 0.075);
  d = min(d, segDist(p, P, P - ad * R * 0.2).x - R * 0.024);
  d = min(d, boxDist(p, N - hd * R * 0.1, hd, vec2f(R * 0.105, R * 0.058), R * 0.018));
  return d;
}

/// How much of the lamp a surface at height z still sees past the arm.
fn armShadow(p: vec2f, z: f32) -> f32 {
  let dh = Z_ARM - z;
  let lz = view.lamp.z;
  let q = p + (p - view.lamp.xy) * (-dh / max(lz - Z_ARM, 0.05));
  let d = armDist(q);
  let soft = 0.004 + dh * 0.12;
  return 1.0 - 0.8 * smoothstep(soft, -soft, d);
}

/// Shadow of the platter and record on the plinth.
fn platterShadow(p: vec2f) -> f32 {
  let C = view.rec.xy;
  let q = p + (p - view.lamp.xy) * (-Z_RECORD / max(view.lamp.z - Z_RECORD, 0.05));
  let d = length(q - C) - view.rec.z * 1.035;
  return 1.0 - 0.5 * smoothstep(0.03, -0.03, d);
}

fn walnut(p: vec2f) -> vec3f {
  // Grain runs across the deck: stretched, warped bands with darker pores.
  let w = vec2f(p.x * 1.2 + vnoise(p * vec2f(1.5, 8.0)) * 0.6, p.y * 26.0 + vnoise(p * vec2f(0.8, 3.0)) * 5.0);
  let band = vnoise(vec2f(w.x * 0.6, w.y)) * 0.6 + vnoise(vec2f(w.x * 2.5, w.y * 2.7)) * 0.4;
  let pores = smoothstep(0.62, 0.8, vnoise(vec2f(p.x * 90.0, p.y * 700.0)));
  var c = mix(vec3f(0.075, 0.036, 0.018), vec3f(0.2, 0.105, 0.05), band);
  c = mix(c, vec3f(0.26, 0.14, 0.07), smoothstep(0.68, 0.9, vnoise(w * vec2f(0.3, 0.12))) * 0.6);
  return c * (1.0 - pores * 0.35);
}

/// A line of small print centred at c, width w and letter height h, in a
/// three by five dot font with random letters: reads as type at this size.
fn print(q: vec2f, c: vec2f, w: f32, h: f32, seed: f32) -> f32 {
  let o = q - c;
  if (abs(o.x) > w || abs(o.y) > h * 0.5) { return 0.0; }
  let gw = h * 0.72;
  let g = floor((o.x + w) / gw);
  let f = vec2f(fract((o.x + w) / gw), (o.y + h * 0.5) / h);
  if (hash21(vec2f(g, seed)) < 0.16) { return 0.0; }
  let cellx = floor(f.x * 4.0);
  if (cellx > 2.0) { return 0.0; }
  let celly = floor(f.y * 5.0);
  let bit = step(0.42, hash21(vec2f(g * 7.0 + cellx, seed * 13.0 + celly)));
  return bit * 0.85;
}

/// The record's surface at local position q (not rotated) and radius r.
fn record(p: vec2f, q: vec2f, r: f32) -> vec3f {
  let R = view.rec.z;
  let u = r / R;
  let rd = q / max(r, 1e-6);
  let T = vec2f(-rd.y, rd.x);
  let l = lampAt(p, Z_RECORD);
  let L = l.xyz;
  let H = normalize(L + vec3f(0.0, 0.0, 1.0));
  // Turned with the record, for everything printed or stuck on it.
  let qr = rot(q, -view.angle);

  // Vinyl is almost black and very glossy.
  var col = vec3f(0.012, 0.011, 0.012) * (0.4 + l.w);

  // Where the grooves are, and the smooth bands between tracks.
  let grooved = smoothstep(0.395, 0.4, u) * smoothstep(0.975, 0.968, u);
  var gap = 0.0;
  for (var k = 0; k < 6; k++) {
    let ug = 0.47 + f32(k) * 0.085 + 0.025 * hash21(vec2f(f32(k), 3.0));
    gap = max(gap, smoothstep(0.0032, 0.0012, abs(u - ug)));
  }
  let ridges = grooved * (1.0 - gap);

  // The grooves: a bow tie of light square to them, fringed by diffraction.
  let band = 0.65 + 0.35 * vnoise(vec2f(u * 260.0, 0.5)) * (0.7 + 0.3 * vnoise(vec2f(u * 1800.0, 2.5)));
  let th = dot(T, H.xy);
  col += grooveLight(th, 0.0005) * band * ridges * l.w;
  // The window across the room lays a second, softer bow tie that stays put.
  let Hw = normalize(WINDOW + vec3f(0.0, 0.0, 1.0));
  col += grooveLight(dot(T, Hw.xy), 0.003) * band * ridges * 0.07;

  // Smooth vinyl (gaps, run-out, the lip) shows the lamp as a glossy spot.
  let glossy = (1.0 - ridges) * step(0.335, u);
  let nh = H.z;
  col += LAMP_COL * (pow(nh, 900.0) * 6.0 + pow(nh, 60.0) * 0.06) * l.w * glossy;
  // The run-out groove's locked loop, and the matrix number scratched by hand.
  col += LAMP_COL * exp(-sq((u - 0.372) / 0.0015)) * (0.08 + exp(-th * th / 0.0012) * 0.7) * l.w;
  let ang = atan2(qr.y, qr.x);
  let mat = step(0.35, u) * step(u, 0.36) * step(abs(ang - 2.2), 0.35) * step(0.4, fract(ang * 60.0)) * step(0.3, hash21(vec2f(floor(ang * 60.0), 4.0)));
  col += vec3f(0.06) * mat * l.w;
  // The rolled edge of the record.
  let lip = smoothstep(0.985, 1.0, u);
  let ln = normalize(vec3f(rd * lip * 0.9, 1.0));
  col += LAMP_COL * pow(max(dot(ln, H), 0.0), 200.0) * lip * l.w * 2.0;

  // Dust and scratches, turning with the record.
  let cell = floor(qr / 0.011);
  let h = hash21(cell + 17.0);
  if (h < 0.035 && u > 0.34) {
    let at = (cell + vec2f(hash21(cell + 2.0), hash21(cell + 5.0))) * 0.011;
    let d = length(qr - at) - px * (0.35 + 1.2 * hash21(cell + 9.0));
    col += vec3f(0.75, 0.73, 0.7) * cover(d) * (0.15 + 0.8 * l.w) * (0.3 + 0.7 * hash21(cell + 1.0));
  }
  let sc = floor(qr / 0.08);
  for (var j = 0; j < 4; j++) {
    let c2 = sc + vec2f(f32(j & 1), f32(j >> 1)) - 0.5;
    if (hash21(c2 + 40.0) > 0.35) { continue; }
    let a0 = (c2 + vec2f(hash21(c2 + 41.0), hash21(c2 + 42.0))) * 0.08;
    let dir = rot(vec2f(1.0, 0.0), hash21(c2 + 43.0) * 6.283);
    let len = 0.01 + 0.03 * hash21(c2 + 44.0);
    let sdd = segDist(qr, a0, a0 + dir * len);
    let wdir = rot(dir, view.angle);
    let glint = exp(-sq(dot(wdir, H.xy) / max(length(H.xy), 1e-3)) / 0.01);
    col += LAMP_COL * clamp(0.5 - (sdd.x - px * 0.25) / px, 0.0, 1.0) * glint * 0.7 * l.w * step(0.4, u) * step(u, 0.97);
  }

  // The label: cream paper printed in red and black, turning with the record.
  let lab = cover(r - R * 0.333);
  if (lab > 0.0) {
    let lu = u / 0.333;
    var c = vec3f(0.84, 0.78, 0.66);
    // A red band and a thin ring near the rim.
    c = mix(c, vec3f(0.62, 0.11, 0.07), smoothstep(0.83, 0.835, lu) * smoothstep(0.935, 0.93, lu));
    c = mix(c, vec3f(0.08), smoothstep(0.012, 0.0, abs(lu - 0.79)) * 0.8);
    // Small type running around inside the band.
    let ra = atan2(qr.y, qr.x);
    let glyph = step(0.3, fract(ra * 70.0)) * step(0.25, hash21(vec2f(floor(ra * 70.0), 7.0))) * step(abs(ra + 1.57), 1.2);
    c = mix(c, vec3f(0.96, 0.9, 0.8), glyph * smoothstep(0.865, 0.87, lu) * smoothstep(0.9, 0.895, lu));
    // A maker's mark at the top, a title, and small print below the spindle.
    let mq = qr / (R * 0.333);
    let LR = R * 0.333;
    let sunD = max(length(mq - vec2f(0.0, 0.47)) - 0.13, 0.47 - mq.y);
    let bar = boxDist(mq, vec2f(0.0, 0.43), vec2f(1.0, 0.0), vec2f(0.17, 0.013), 0.0);
    c = mix(c, vec3f(0.62, 0.11, 0.07), cover(min(sunD, bar) * LR));
    c = mix(c, vec3f(0.1), print(mq, vec2f(0.0, 0.24), 0.42, 0.06, 3.0) * 0.9);
    c = mix(c, vec3f(0.62, 0.11, 0.07), print(mq, vec2f(0.0, 0.15), 0.26, 0.035, 5.0) * 0.9);
    c = mix(c, vec3f(0.1), print(mq, vec2f(0.0, -0.26), 0.5, 0.034, 6.0) * 0.85);
    c = mix(c, vec3f(0.1), print(mq, vec2f(0.0, -0.34), 0.44, 0.034, 7.0) * 0.85);
    c = mix(c, vec3f(0.1), print(mq, vec2f(0.0, -0.42), 0.36, 0.034, 8.0) * 0.85);
    c = mix(c, vec3f(0.1), print(mq, vec2f(-0.42, 0.0), 0.06, 0.07, 9.0) * 0.9);
    c = mix(c, vec3f(0.1), print(mq, vec2f(0.42, 0.0), 0.08, 0.045, 10.0) * 0.9);
    c *= 0.92 + 0.08 * vnoise(qr * 300.0);
    let n = vec3f(0.0, 0.0, 1.0);
    var lc = shade(c, n, p, Z_RECORD, 0.03, 30.0);
    // The label sits a hair lower than the vinyl around it.
    lc *= 1.0 - 0.35 * smoothstep(0.02, 0.0, 0.333 - u) ;
    col = mix(col, lc, lab);
  }
  // The spindle.
  let sp = r / (R * 0.024);
  if (sp < 1.2) {
    let sn = normalize(vec3f(rd * min(sp, 1.0) * 0.9, 1.0));
    let sc2 = shade(vec3f(0.55, 0.55, 0.57), sn, p, Z_RECORD + 0.01, 1.0, 120.0) + vec3f(0.05) * (sn.y * 0.5 + 0.5);
    col = mix(col, sc2, cover(r - R * 0.024));
  }
  return col;
}

/// Brushed or polished metal on a rounded part with normal n.
fn metal(base: vec3f, n: vec3f, p: vec2f, z: f32, rough: f32) -> vec3f {
  let l = lampAt(p, z);
  let H = normalize(l.xyz + vec3f(0.0, 0.0, 1.0));
  let nh = max(dot(n, H), 0.0);
  // A room reflected in the curve: lighter up the screen, dark below.
  let env = mix(vec3f(0.03, 0.028, 0.026), vec3f(0.22, 0.2, 0.18), smoothstep(-0.6, 0.8, n.y + n.x * 0.3));
  return base * (env + max(dot(n, l.xyz), 0.0) * l.w * 0.35) + LAMP_COL * pow(nh, rough) * l.w * 2.2;
}

/// Normal of a rounded capsule at p.
fn capNormal(p: vec2f, a: vec2f, b: vec2f, rad: f32) -> vec3f {
  let sd = segDist(p, a, b);
  let c = a + (b - a) * sd.y;
  var v = (p - c) / rad;
  v /= max(1.0, length(v));
  return normalize(vec3f(v, sqrt(max(0.0, 1.0 - dot(v, v))) + 0.02));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = view.aspect;
  px = 1.0 / view.res.y;
  let p = vec2f(uv.x * aspect, 1.0 - uv.y);
  let C = view.rec.xy;
  let R = view.rec.z;
  let q = p - C;
  let r = length(q);

  // The plinth: lacquered walnut.
  var col = shade(walnut(p), vec3f(0.0, 0.0, 1.0), p, Z_PLINTH, 0.35, 300.0);
  col *= platterShadow(p) * armShadow(p, Z_PLINTH);

  // Start and speed buttons, top left of the platter, and the pitch slider.
  let bc = select(C + vec2f(-R * 0.5, R * 1.25), C + vec2f(-R * 1.22, R * 0.86), view.aspect >= 1.0);
  for (var b = 0; b < 3; b++) {
    let at = bc + vec2f(f32(b) * R * 0.2 - select(0.0, R * 0.08, b == 0), 0.0);
    let sz = select(vec2f(R * 0.06, R * 0.04), vec2f(R * 0.1, R * 0.06), b == 0);
    let d = boxDist(p, at, vec2f(1.0, 0.0), sz, R * 0.012);
    let e = clamp(-d / (R * 0.012), 0.0, 1.0);
    let o = (p - at) / sz;
    let n = normalize(vec3f(o * (1.0 - e) * 0.7, 1.0));
    // A black key in a bright bezel.
    let ring = smoothstep(-R * 0.012, -R * 0.006, d);
    var bcol = mix(shade(vec3f(0.03, 0.03, 0.034), n, p, 0.01, 0.1, 60.0), metal(vec3f(0.7, 0.7, 0.72), n, p, 0.01, 60.0), ring);
    if (b == 1 && view.lampOn > 0.5) { bcol += vec3f(0.9, 0.3, 0.05) * 0.5 * smoothstep(0.5, 0.0, length(o)); }
    let sh = boxDist(p - (p - view.lamp.xy) * 0.02, at, vec2f(1.0, 0.0), sz, R * 0.012);
    col *= 1.0 - 0.5 * smoothstep(0.01, -0.01, sh);
    col = mix(col, bcol, cover(d));
  }
  let pivot = view.arm.xy;
  let slot = boxDist(p, pivot + vec2f(R * 0.32, -R * 0.75), vec2f(0.0, 1.0), vec2f(R * 0.32, R * 0.012), R * 0.01);
  col = mix(col, vec3f(0.01), cover(slot));
  let knob = boxDist(p, pivot + vec2f(R * 0.32, -R * 0.75), vec2f(0.0, 1.0), vec2f(R * 0.04, R * 0.05), R * 0.01);
  let kn = normalize(vec3f((p - pivot - vec2f(R * 0.32, -R * 0.75)) / (R * 0.05) * 0.5, 1.0));
  col *= 1.0 - 0.4 * smoothstep(0.01, -0.01, knob - 0.008);
  col = mix(col, metal(vec3f(0.5), kn, p, 0.02, 40.0), cover(knob));

  // The platter rim, turned aluminium that shines in rings.
  if (r < R * 1.04) {
    let rd = q / max(r, 1e-6);
    let l = lampAt(p, Z_RECORD - 0.005);
    let H = normalize(l.xyz + vec3f(0.0, 0.0, 1.0));
    let th = dot(vec2f(-rd.y, rd.x), H.xy) / max(H.z, 0.3);
    let bev = smoothstep(R * 1.025, R * 1.04, r);
    let n = normalize(vec3f(rd * bev * 1.2, 1.0));
    var rim = vec3f(0.5, 0.5, 0.52) * (0.1 + l.w * 0.4 * max(dot(n, l.xyz), 0.0));
    rim += LAMP_COL * exp(-th * th / 0.01) * l.w * 0.9 * (1.0 - bev);
    rim += LAMP_COL * pow(max(dot(n, H), 0.0), 60.0) * l.w * bev;
    // The strobe dots along the rim, turning with the platter.
    let ang = atan2(q.y, q.x) - view.angle;
    let dot2 = length(vec2f(fract(ang * 180.0 / 6.2831853 + 0.5) - 0.5, (r - R * 1.032) / (R * 0.004) * 0.07));
    rim = mix(rim, rim * 0.7, smoothstep(0.32, 0.25, dot2) * step(R * 1.026, r));
    col = mix(col, rim, cover(r - R * 1.04));
  }
  // The record.
  if (r < R * 1.002) {
    var rc = record(p, q, r) * armShadow(p, Z_RECORD);
    col = mix(col, rc, cover(r - R));
  }

  // The tonearm.
  let P = view.arm.xy;
  let J = view.arm.zw;
  let N = view.head.xy;
  let hd = view.head.zw;
  let ad = normalize(J - P);
  let side = vec2f(-ad.y, ad.x);
  // Arm rest post and clip, and the anti-skate dial.
  let rest = P + rot(vec2f(-R * 0.02, -R * 0.42), 0.0);
  let dRest = length(p - rest) - R * 0.035;
  col *= 1.0 - 0.45 * smoothstep(0.012, -0.012, length(p - rest + (p - view.lamp.xy) * 0.05) - R * 0.035);
  col = mix(col, metal(vec3f(0.12), normalize(vec3f((p - rest) / (R * 0.035) * 0.8, 1.0)), p, 0.05, 50.0), cover(dRest));
  let dial = P + vec2f(R * 0.2, -R * 0.13);
  let dDial = length(p - dial) - R * 0.045;
  let dn = normalize(vec3f((p - dial) / (R * 0.045) * 0.6, 1.0));
  var dc = metal(vec3f(0.55), dn, p, 0.04, 30.0);
  dc *= 0.85 + 0.15 * step(0.5, fract(atan2(p.y - dial.y, p.x - dial.x) * 6.0));
  col *= 1.0 - 0.4 * smoothstep(0.012, -0.012, length(p - dial + (p - view.lamp.xy) * 0.04) - R * 0.045);
  col = mix(col, dc, cover(dDial));
  // The pivot housing: turned rings.
  let dP = length(p - P) - R * 0.12;
  col *= 1.0 - 0.5 * smoothstep(0.015, -0.015, length(p - P + (p - view.lamp.xy) * 0.06) - R * 0.12);
  if (dP < px) {
    let pr = length(p - P) / (R * 0.12);
    let pn = normalize(vec3f((p - P) / (R * 0.12) * smoothstep(0.75, 1.0, pr) * 1.4, 1.0));
    var pc = metal(vec3f(0.6, 0.6, 0.62), pn, p, 0.06, 30.0);
    let l = lampAt(p, 0.06);
    let H = normalize(l.xyz + vec3f(0.0, 0.0, 1.0));
    let rr = normalize(p - P);
    pc += LAMP_COL * exp(-sq(dot(vec2f(-rr.y, rr.x), H.xy) / max(H.z, 0.3)) / 0.02) * l.w * 0.6 * step(pr, 0.75);
    pc *= 0.85 + 0.15 * smoothstep(0.0, 0.04, abs(fract(pr * 4.0) - 0.5));
    col = mix(col, pc, cover(dP));
  }
  // Counterweight on its stub.
  let w0 = P - ad * R * 0.2;
  let w1 = P - ad * R * 0.36;
  let dStub = segDist(p, P, w0).x - R * 0.024;
  col = mix(col, metal(vec3f(0.5), capNormal(p, P, w0, R * 0.024), p, 0.08, 80.0), cover(dStub));
  let dW = segDist(p, w0, w1).x - R * 0.075;
  if (dW < px) {
    var wc = metal(vec3f(0.18, 0.18, 0.19), capNormal(p, w0, w1, R * 0.075), p, 0.09, 50.0);
    let along = dot(p - w0, -ad) / (R * 0.16);
    wc *= 0.8 + 0.2 * step(0.5, fract(along * 14.0)) * step(0.55, along);
    col = mix(col, wc, cover(dW));
  }
  // The arm tube.
  let dT = segDist(p, P, J).x - R * 0.021;
  col = mix(col, metal(vec3f(1.2, 1.2, 1.22), capNormal(p, P, J, R * 0.021), p, Z_ARM, 120.0), cover(dT));
  // The cartridge under the headshell, the headshell, and the finger lift.
  let cart = boxDist(p, N - hd * R * 0.04, hd, vec2f(R * 0.065, R * 0.04), R * 0.008);
  let co = p - (N - hd * R * 0.035);
  var cc = shade(vec3f(0.5, 0.06, 0.04), normalize(vec3f(dot(co, side) / (R * 0.034) * 0.4 * side, 1.0)), p, Z_ARM - 0.02, 0.6, 80.0);
  col = mix(col, cc, cover(cart));
  let hc = N - hd * R * 0.1;
  let dH = boxDist(p, hc, hd, vec2f(R * 0.105, R * 0.058), R * 0.018);
  let ho = p - hc;
  let hy = dot(ho, vec2f(-hd.y, hd.x)) / (R * 0.058);
  let hn = normalize(vec3f(vec2f(-hd.y, hd.x) * hy * 0.5, 1.0));
  var hcol = metal(vec3f(0.07, 0.07, 0.075), hn, p, Z_ARM, 60.0);
  hcol += vec3f(0.02) * step(0.5, fract(dot(ho, hd) / (R * 0.02)));
  col = mix(col, hcol, cover(dH));
  let lift0 = hc + vec2f(-hd.y, hd.x) * R * 0.04 + hd * R * 0.02;
  let lift1 = lift0 + vec2f(-hd.y, hd.x) * R * 0.08 + hd * R * 0.02;
  let dL = segDist(p, lift0, lift1).x - R * 0.009;
  col = mix(col, metal(vec3f(0.6), capNormal(p, lift0, lift1, R * 0.009), p, Z_ARM, 100.0), cover(dL));
  // Two screws on top of the headshell.
  for (var s = 0; s < 2; s++) {
    let at = hc + hd * R * (f32(s) * 0.06 - 0.01);
    let dS = length(p - at) - R * 0.011;
    col = mix(col, metal(vec3f(0.6), normalize(vec3f((p - at) / (R * 0.011) * 0.7, 1.0)), p, Z_ARM, 60.0), cover(dS));
  }

  // The lamp's falloff, a filmic shoulder, vignette and dither.
  col = 1.0 - exp(-col * 1.5);
  col = pow(col, vec3f(0.95));
  col *= 1.0 - 0.3 * smoothstep(0.35, 0.9, length((uv - 0.5) * vec2f(1.0, 1.1)) * 1.2);
  col += (hash21(uv * view.res) - 0.5) / 255.0;
  return vec4f(col, 1.0);
}
