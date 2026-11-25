// A record deck seen from straight above under one warm lamp, by an eye that
// moves with the pointer. A walnut
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
  eye: vec4f,     // the viewer's eye: x, y, height
}
@group(0) @binding(0) var<uniform> view: View;

const LAMP_COL = vec3f(1.0, 0.9, 0.76);
const WINDOW = vec3f(-0.45, 0.55, 0.7);
const Z_PLINTH = 0.0;
const Z_RECORD = 0.045;
const Z_ARM = 0.1;

var<private> px: f32;

/// From a point at height z toward the viewer's eye.
fn viewDir(p: vec2f, z: f32) -> vec3f {
  return normalize(view.eye.xyz - vec3f(p, z));
}

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
  var rainbow = bands(a, vec3f(0.105, 0.085, 0.066), 0.009);
  rainbow += 0.35 * bands(a, vec3f(0.21, 0.17, 0.132), 0.014);
  return LAMP_COL * core + rainbow * 0.08;
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
  let V = viewDir(p, z);
  let H = normalize(L + V);
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

fn fbm(p: vec2f) -> f32 {
  return vnoise(p) * 0.5 + vnoise(p * 2.03 + 3.1) * 0.3 + vnoise(p * 4.1 - 1.7) * 0.2;
}

/// Straight-grained walnut veneer: long streaks of darker and lighter wood
/// running across the deck, wandering a little, fine lines inside them, thin
/// dark pore streaks, and the colour drifting across the board.
fn walnut(p: vec2f) -> vec3f {
  let wy = p.y + 0.035 * fbm(vec2f(p.x * 0.6, p.y * 1.8)) + 0.008 * sin(p.x * 2.1 + p.y * 3.0);
  let s1 = fbm(vec2f(p.x * 0.7, wy * 40.0));
  let s2 = vnoise(vec2f(p.x * 1.8, wy * 150.0));
  let s3 = vnoise(vec2f(p.x * 4.0, wy * 380.0));
  let tone = s1 * 0.6 + s2 * 0.27 + s3 * 0.13;
  var c = mix(vec3f(0.075, 0.04, 0.022), vec3f(0.25, 0.14, 0.072), smoothstep(0.2, 0.85, tone));
  // The board's colour drifts: warmer in places, near black in others.
  let fig = fbm(p * vec2f(0.45, 1.3) + 4.0);
  c *= mix(vec3f(0.75, 0.78, 0.82), vec3f(1.15, 1.05, 0.95), smoothstep(0.3, 0.75, fig));
  // Pores: thin dark streaks strung along the grain.
  let pore = smoothstep(0.74, 0.86, vnoise(vec2f(p.x * 30.0, wy * 520.0)));
  c *= 1.0 - pore * 0.4;
  return c;
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
  let V = viewDir(p, Z_RECORD);
  let H = normalize(L + V);
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
  let Hw = normalize(normalize(WINDOW) + V);
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

/// The room as a mirror sees it: dark walls, the lamp's big shade, and the
/// window. Rough metal sees it blurred: rough is the blur in radians.
fn env(r: vec3f, rough: f32) -> vec3f {
  let C = view.rec.xy;
  let toLamp = normalize(vec3f(view.lamp.xy - C, view.lamp.z));
  var c = mix(vec3f(0.012, 0.011, 0.01), vec3f(0.07, 0.062, 0.055), smoothstep(-0.1, 0.9, r.z));
  let a = acos(clamp(dot(r, toLamp), -1.0, 1.0));
  c += LAMP_COL * (1.0 - smoothstep(0.55 - rough, 0.55 + rough, a)) * 0.8 * view.lamp.w;
  c += LAMP_COL * (1.0 - smoothstep(0.12 - rough * 0.5, 0.12 + rough * 0.5, a)) * 1.2 * view.lamp.w;
  let w = normalize(WINDOW);
  let aw = acos(clamp(dot(r, w), -1.0, 1.0));
  c += vec3f(0.55, 0.62, 0.72) * (1.0 - smoothstep(0.22 - rough, 0.22 + rough, aw)) * 0.5;
  return c;
}

/// Metal on a part with normal n: the room reflected, plus a little diffuse.
fn metal(base: vec3f, n: vec3f, p: vec2f, z: f32, rough: f32) -> vec3f {
  let V = viewDir(p, z);
  let r = reflect(-V, n);
  let blur = 1.4 / sqrt(rough);
  let l = lampAt(p, z);
  return base * (env(r, blur) + max(dot(n, l.xyz), 0.0) * l.w * 0.08);
}

/// Turned metal: fine concentric tool marks around c reflect the lamp in a
/// radial streak, as a record's grooves do.
fn turned(p: vec2f, c: vec2f, z: f32) -> f32 {
  let l = lampAt(p, z);
  let H = normalize(l.xyz + viewDir(p, z));
  let rd = normalize(p - c + vec2f(1e-6));
  let th = dot(vec2f(-rd.y, rd.x), H.xy);
  return (exp(-th * th / 0.004) * 0.9 + exp(-th * th / 0.06) * 0.15) * l.w;
}

/// A black plastic key or cap with chamfered edges: d is its distance, e the
/// chamfer width, o the position across it, and a shadow under it.
fn plastic(base: vec3f, d: f32, e: f32, grad: vec2f, p: vec2f, z: f32) -> vec3f {
  let t = clamp(1.0 + d / e, 0.0, 1.0);
  let n = normalize(vec3f(grad * t * 0.9, 1.0));
  let V = viewDir(p, z);
  let l = lampAt(p, z);
  let f = 0.04 + 0.5 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  let H = normalize(l.xyz + V);
  let spec = pow(max(dot(n, H), 0.0), 50.0) * 0.35 * l.w * t;
  return base * (0.08 + max(dot(n, l.xyz), 0.0) * l.w) + env(reflect(-V, n), 0.12) * f * 0.8 + LAMP_COL * spec;
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
  // Satin lacquer: it mirrors the lamp's shade and the window, softly.
  let pn = normalize(vec3f((vnoise(p * 30.0) - 0.5) * 0.02, (vnoise(p * 30.0 + 7.0) - 0.5) * 0.02, 1.0));
  let pv = viewDir(p, Z_PLINTH);
  var col = shade(walnut(p), pn, p, Z_PLINTH, 0.0, 300.0);
  col *= platterShadow(p) * armShadow(p, Z_PLINTH);
  col += env(reflect(-pv, pn), 0.18) * (0.045 + 0.4 * pow(1.0 - pv.z, 5.0)) * platterShadow(p);

  // Start and speed keys, top left of the platter: black plastic, chamfered,
  // set in a recess, with small white legends and the running light.
  let bc = select(C + vec2f(-R * 0.5, R * 1.25), C + vec2f(-R * 1.22, R * 0.86), view.aspect >= 1.0);
  for (var b = 0; b < 3; b++) {
    let at = bc + vec2f(f32(b) * R * 0.22 - select(0.0, R * 0.08, b == 0), 0.0);
    let sz = select(vec2f(R * 0.07, R * 0.045), vec2f(R * 0.11, R * 0.065), b == 0);
    let d = boxDist(p, at, vec2f(1.0, 0.0), sz, R * 0.012);
    // The recess, a hair larger than the key, shadowed inside.
    let dr = boxDist(p, at, vec2f(1.0, 0.0), sz + R * 0.008, R * 0.016);
    col = mix(col, col * 0.12, cover(dr));
    let o = (p - at) / sz;
    let grad = vec2f(select(0.0, sign(o.x), abs(o.x) * sz.x > abs(o.y) * sz.y + (sz.x - sz.y)), select(0.0, sign(o.y), abs(o.x) * sz.x <= abs(o.y) * sz.y + (sz.x - sz.y)));
    var kc = plastic(vec3f(0.028, 0.028, 0.03) * (0.9 + 0.2 * vnoise(p * 900.0)), d, R * 0.012, grad, p, 0.012);
    // Legends: START on the big key, 33 and 45 on the others.
    let lq = (p - at) / R;
    let leg = select(print(lq, vec2f(0.0, -0.004), 0.05, 0.018, 21.0), print(lq, vec2f(0.0, -0.004), 0.02, 0.018, 22.0 + f32(b)), b > 0);
    kc = mix(kc, vec3f(0.55, 0.54, 0.5) * (0.3 + lampAt(p, 0.012).w), leg);
    if (b == 1 && view.lampOn > 0.5) {
      let led = length(p - at - vec2f(0.0, sz.y * 0.55)) / (R * 0.008);
      kc = mix(kc, vec3f(1.0, 0.45, 0.1) * 1.6, smoothstep(1.0, 0.7, led));
      col += vec3f(1.0, 0.4, 0.08) * 0.05 * exp(-led * 0.15);
    }
    col = mix(col, kc, cover(d));
  }

  // The pitch fader: a brushed plate with a scale, a dark slot, and a ridged cap.
  let pivot = view.arm.xy;
  let fc = pivot + vec2f(R * 0.32, -R * 0.75);
  let plate = boxDist(p, fc, vec2f(0.0, 1.0), vec2f(R * 0.4, R * 0.075), R * 0.012);
  if (plate < px) {
    let po = p - fc;
    // Brushed along the slot: the light streaks across the brushing.
    let l = lampAt(p, 0.004);
    let H = normalize(l.xyz + viewDir(p, 0.004));
    let brush = 0.85 + 0.15 * vnoise(vec2f(po.x * 4000.0, po.y * 40.0));
    var pc = vec3f(0.5, 0.5, 0.52) * (env(vec3f(0.0, 0.0, 1.0), 0.6) * 0.6 + exp(-H.x * H.x / 0.01) * l.w * 0.5) * brush;
    pc += vec3f(0.25) * smoothstep(-R * 0.004, 0.0, plate);
    // Scale: ticks either side of the slot, longer every fifth, and the centre mark.
    let tk = po.y / (R * 0.032);
    let fi = abs(fract(tk + 0.5) - 0.5);
    let major = step(abs(round(tk)) % 5.0, 0.5);
    let tick = smoothstep(0.12, 0.05, fi * R * 0.032 / (px * 1.0 + R * 0.0035)) * step(abs(po.y), R * 0.33);
    let len = mix(R * 0.022, R * 0.04, major);
    let side = step(R * 0.026, abs(po.x)) * step(abs(po.x), R * 0.026 + len);
    pc = mix(pc, vec3f(0.06), tick * side * 0.85);
    pc = mix(pc, vec3f(0.06), print(po / R, vec2f(-0.055, 0.36), 0.012, 0.02, 31.0));
    pc = mix(pc, vec3f(0.06), print(po / R, vec2f(-0.055, -0.36), 0.012, 0.02, 32.0));
    col *= 1.0 - 0.4 * smoothstep(0.006, -0.006, boxDist(p + vec2f(0.004, 0.004), fc, vec2f(0.0, 1.0), vec2f(R * 0.4, R * 0.075), R * 0.012));
    col = mix(col, pc, cover(plate));
    let slot = boxDist(p, fc, vec2f(0.0, 1.0), vec2f(R * 0.34, R * 0.011), R * 0.008);
    col = mix(col, vec3f(0.006) + vec3f(0.03) * smoothstep(R * 0.011, 0.0, abs(po.x + R * 0.004)) * 0.3, cover(slot));
    // The cap, sitting at zero.
    let cd = boxDist(p, fc, vec2f(0.0, 1.0), vec2f(R * 0.05, R * 0.042), R * 0.01);
    col *= 1.0 - 0.55 * smoothstep(0.008, -0.008, cd - 0.004);
    let co = (p - fc) / vec2f(R * 0.042, R * 0.05);
    let cgrad = select(vec2f(0.0, sign(co.y)), vec2f(sign(co.x), 0.0), abs(co.x) > abs(co.y));
    var capc = plastic(vec3f(0.03), cd, R * 0.012, cgrad, p, 0.02);
    capc *= 1.0 - 0.45 * step(0.5, fract(po.y / (R * 0.012))) * step(abs(po.y), R * 0.03) * step(abs(po.x), R * 0.03);
    capc = mix(capc, vec3f(0.85, 0.84, 0.8) * (0.3 + lampAt(p, 0.02).w), smoothstep(R * 0.003, R * 0.0015, abs(po.y)) * step(abs(po.x), R * 0.038));
    col = mix(col, capc, cover(cd));
  }

  // The platter rim, turned aluminium that shines in rings.
  if (r < R * 1.04) {
    let rd = q / max(r, 1e-6);
    let l = lampAt(p, Z_RECORD - 0.005);
    let H = normalize(l.xyz + viewDir(p, Z_RECORD));
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
  // Arm rest: a black post with a chrome clip.
  let rest = P + vec2f(-R * 0.02, -R * 0.42);
  let dRest = length(p - rest) - R * 0.035;
  col *= 1.0 - 0.45 * smoothstep(0.012, -0.012, length(p - rest + (p - view.lamp.xy) * 0.05) - R * 0.035);
  col = mix(col, plastic(vec3f(0.03), dRest, R * 0.02, normalize(p - rest + vec2f(1e-6)), p, 0.05), cover(dRest));
  let clip = boxDist(p, rest, side, vec2f(R * 0.012, R * 0.03), R * 0.006);
  col = mix(col, metal(vec3f(0.9), normalize(vec3f(side * dot(p - rest, side) / (R * 0.012) * 0.6, 1.0)), p, 0.06, 200.0), cover(clip));
  // Anti-skate dial: a turned knob with a knurled edge and a white index.
  let dial = P + vec2f(R * 0.2, -R * 0.13);
  let dr = length(p - dial) / (R * 0.048);
  col *= 1.0 - 0.45 * smoothstep(0.012, -0.012, length(p - dial + (p - view.lamp.xy) * 0.04) - R * 0.048);
  if (dr < 1.2) {
    let rd2 = normalize(p - dial + vec2f(1e-6));
    let edge = smoothstep(0.72, 0.8, dr);
    let knurl = 0.75 + 0.25 * sin(atan2(rd2.y, rd2.x) * 60.0);
    let dn = normalize(vec3f(rd2 * edge * mix(0.5, 1.0, knurl), 1.0));
    var dc = metal(vec3f(0.75, 0.75, 0.77), dn, p, 0.04, 60.0) * mix(1.0, knurl, edge);
    dc += LAMP_COL * turned(p, dial, 0.04) * 0.35 * (1.0 - edge);
    dc += LAMP_COL * 0.6 * smoothstep(0.03, 0.0, abs(dr - 0.72)) * lampAt(p, 0.04).w;
    let idx = rot(vec2f(0.0, 1.0), 0.6);
    dc = mix(dc, vec3f(0.9), step(abs(dot(rd2, vec2f(-idx.y, idx.x)) * dr), 0.06) * step(0.25, dr) * step(dr, 0.65) * step(0.0, dot(rd2, idx)));
    col = mix(col, dc, cover((dr - 1.0) * R * 0.048));
  }
  // The pivot housing: a turned aluminium base with a raised boss and a
  // knurled ring, where the arm's bearings sit.
  let pr = length(p - P) / (R * 0.12);
  col *= 1.0 - 0.5 * smoothstep(0.015, -0.015, length(p - P + (p - view.lamp.xy) * 0.06) - R * 0.12);
  if (pr < 1.1) {
    let rd3 = normalize(p - P + vec2f(1e-6));
    let outer = smoothstep(0.86, 0.95, pr);
    let step1 = smoothstep(0.015, 0.0, abs(pr - 0.62));
    let pn = normalize(vec3f(rd3 * (outer * 1.2 + step1 * 0.8), 1.0));
    var pc = metal(vec3f(0.85, 0.85, 0.87), pn, p, 0.06, 40.0);
    pc += LAMP_COL * turned(p, P, 0.06) * 0.45 * (1.0 - outer);
    let kn = 0.7 + 0.3 * sin(atan2(rd3.y, rd3.x) * 90.0);
    pc *= mix(1.0, kn, smoothstep(0.8, 0.86, pr) * (1.0 - outer));
    pc *= 1.0 - 0.5 * smoothstep(0.02, 0.0, abs(pr - 0.8));
    // The bearing yoke: a dark block across the arm.
    let yoke = boxDist(p, P, ad, vec2f(R * 0.045, R * 0.06), R * 0.01);
    pc = mix(pc, plastic(vec3f(0.035), yoke, R * 0.012, normalize(vec2f(1e-6) + side * sign(dot(p - P, side))), p, 0.09), cover(yoke));
    col = mix(col, pc, cover((pr - 1.0) * R * 0.12));
  }
  // Counterweight on its stub: machined, with knurled grip bands.
  let w0 = P - ad * R * 0.2;
  let w1 = P - ad * R * 0.36;
  let dStub = segDist(p, P, w0).x - R * 0.024;
  col = mix(col, metal(vec3f(0.85), capNormal(p, P, w0, R * 0.024), p, 0.08, 300.0), cover(dStub));
  let dW = segDist(p, w0, w1).x - R * 0.075;
  if (dW < px) {
    let along = dot(p - w0, -ad) / (R * 0.16);
    let wn = capNormal(p, w0, w1, R * 0.075);
    let grip = step(0.62, along) * step(along, 0.92);
    let kn = 0.5 + 0.5 * sin(along * 300.0);
    var wc = metal(vec3f(0.9, 0.9, 0.92), wn, p, 0.09, 25.0) + vec3f(0.02);
    wc *= mix(1.0, 0.8 + 0.2 * kn, grip);
    wc *= 1.0 - 0.6 * smoothstep(0.012, 0.0, min(abs(along - 0.53), abs(along - 0.06)));
    col = mix(col, wc, cover(dW));
  }
  // The arm tube: polished chrome.
  let dT = segDist(p, P, J).x - R * 0.021;
  col = mix(col, metal(vec3f(0.95, 0.95, 0.97), capNormal(p, P, J, R * 0.021), p, Z_ARM, 900.0), cover(dT));
  // The cartridge under the headshell, the headshell, and the finger lift.
  let cart = boxDist(p, N - hd * R * 0.04, hd, vec2f(R * 0.065, R * 0.04), R * 0.008);
  let co = p - (N - hd * R * 0.04);
  let cc = plastic(vec3f(0.42, 0.05, 0.035), cart, R * 0.01, normalize(side * sign(dot(co, side)) + vec2f(1e-6)), p, Z_ARM - 0.02);
  col = mix(col, cc, cover(cart));
  let hc = N - hd * R * 0.1;
  let dH = boxDist(p, hc, hd, vec2f(R * 0.105, R * 0.058), R * 0.018);
  let ho = p - hc;
  let hside = vec2f(-hd.y, hd.x);
  let hgrad = select(hside * sign(dot(ho, hside)), hd * sign(dot(ho, hd)), abs(dot(ho, hd)) / (R * 0.105) > abs(dot(ho, hside)) / (R * 0.058));
  var hcol = plastic(vec3f(0.07, 0.07, 0.075), dH, R * 0.016, hgrad * 1.8, p, Z_ARM);
  // Two slots where the cartridge screws through.
  for (var s = 0; s < 2; s++) {
    let sl = boxDist(p, hc + hd * R * (f32(s) * 0.07 - 0.02), hside, vec2f(R * 0.02, R * 0.006), R * 0.006);
    hcol = mix(hcol, vec3f(0.005), cover(sl));
    let at = hc + hd * R * (f32(s) * 0.07 - 0.02);
    let dS = length(p - at) - R * 0.0095;
    var scc = metal(vec3f(0.8), normalize(vec3f((p - at) / (R * 0.0095) * 0.7, 1.0)), p, Z_ARM, 200.0);
    scc *= 1.0 - 0.8 * step(abs(dot(p - at, normalize(vec2f(1.0, 0.6)))), R * 0.0018);
    hcol = mix(hcol, scc, cover(dS));
  }
  col = mix(col, hcol, cover(dH));
  let lift0 = hc + hside * R * 0.04 + hd * R * 0.02;
  let lift1 = lift0 + hside * R * 0.08 + hd * R * 0.02;
  let dL = segDist(p, lift0, lift1).x - R * 0.009;
  col = mix(col, metal(vec3f(0.9), capNormal(p, lift0, lift1, R * 0.009), p, Z_ARM, 600.0), cover(dL));

  // The lamp's falloff, a filmic shoulder, vignette and dither.
  col = 1.0 - exp(-col * 1.5);
  col = pow(col, vec3f(0.95));
  col *= 1.0 - 0.3 * smoothstep(0.35, 0.9, length((uv - 0.5) * vec2f(1.0, 1.1)) * 1.2);
  col += (hash21(uv * view.res) - 0.5) / 255.0;
  return vec4f(col, 1.0);
}
