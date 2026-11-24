// The picture: the still street from the cached pass, plus everything that
// moves, drawn every frame through the same lens: the traffic, bodies and
// lights, its shadows and beams on the road and its long reflections in it, the signals changing at the crossings, and
// the string lights swaying across the balcony. Then a film-like shoulder
// and the lens's vignette.
import { hash21 } from "../../shaders/common.wgsl";
import { Lens, coc, project, pointLight, rowRange, aboveParapet, pools, F, H0, CAM_H, BLOCK, KERB_L, KERB_R, Z_END } from "./scene.wgsl";

struct Params {
  res: vec2f,
  aspect: f32,
  time: f32,
  focus: f32,
  aperture: f32,
  exposure: f32,
  breath: f32,
  ends: array<vec4f, 2>,   // string lights: from x, y, to x, y (screen)
  str: array<vec4f, 2>,    // sag, diopters, bulb spacing, sway phase
}
@group(0) @binding(0) var still: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> params: Params;

/// A car in a lane slot: where it is and what it is.
struct Car {
  z: f32,      // the end nearest the camera
  x: f32,      // lane centre
  L: f32,      // length
  W: f32,      // width
  top: f32,    // height of the body (the bonnet line)
  hc: f32,     // cabin height above the body
  a: f32,      // cabin roof length
  sf: f32,     // run of the windscreen and rear window
  cab: f32,    // cabin centre, as a share of the length from the near end
  kind: f32,   // 0 saloon, 1 hatch or SUV, 2 van, 3 taxi, 4 bus
  seed: f32,
  coming: bool,
}

const SP = 26.0;
const LANE_X0 = KERB_L + 2.25;

fn laneShift(lane: i32, time: f32) -> f32 {
  let coming = lane < 2;
  let v = select(11.0, 13.5, coming) + f32(lane % 2) * 2.0;
  return select(1.0, -1.0, coming) * v * time;
}

/// The car in slot n of a lane, if the slot holds one (z < 0 when empty).
fn carAt(lane: i32, n: f32, shift: f32) -> Car {
  let coming = lane < 2;
  let fl = f32(lane);
  var c = Car(-1.0, LANE_X0 + 4.5 * fl, 4.7, 1.82, 0.82, 0.52, 1.25, 0.75, 0.55, 0.0, 0.0, coming);
  if (hash21(vec2f(n, fl + 50.0)) > 0.6) { return c; }
  let k = hash21(vec2f(n, fl + 52.0));
  c.seed = hash21(vec2f(n, fl + 53.0));
  let outer = lane == 0 || lane == 3;
  if (outer && k < 0.07) {
    c.kind = 4.0; c.L = 12.0; c.W = 2.5; c.top = 3.05; c.hc = 0.0;
  } else if (k < 0.22) {
    c.kind = 2.0; c.L = 5.2; c.W = 2.0; c.top = 1.05; c.hc = 0.95; c.a = 3.1; c.sf = 0.35; c.cab = 0.6;
  } else if (k < 0.48) {
    c.kind = 1.0; c.L = 4.5; c.W = 1.88; c.top = 0.95; c.hc = 0.68; c.a = 1.8; c.sf = 0.45; c.cab = 0.58;
  } else if (k < 0.58) {
    c.kind = 3.0;
  }
  if (!coming) { c.cab = 1.0 - c.cab; }
  c.z = n * SP + (SP - c.L - 4.0) * hash21(vec2f(n, fl + 51.0)) + shift;
  if (c.z < 9.0 || c.z > Z_END) { c.z = -1.0; }
  return c;
}

fn paint(c: Car) -> vec3f {
  if (c.kind == 3.0) { return vec3f(0.62, 0.4, 0.05); }
  if (c.kind == 4.0) { return select(vec3f(0.5, 0.05, 0.04), vec3f(0.45, 0.45, 0.42), c.seed > 0.5); }
  let h = c.seed;
  if (h < 0.25) { return vec3f(0.018); }
  if (h < 0.45) { return vec3f(0.06, 0.062, 0.066); }
  if (h < 0.6) { return vec3f(0.32, 0.33, 0.34); }
  if (h < 0.74) { return vec3f(0.6, 0.6, 0.58); }
  if (h < 0.84) { return vec3f(0.02, 0.035, 0.09); }
  if (h < 0.93) { return vec3f(0.24, 0.02, 0.025); }
  return vec3f(0.03, 0.07, 0.05);
}

/// The half-extent of a 2D zonotope (a sum of segments g) along unit n, and
/// its signed distance from d along every edge normal: exact inside, close
/// enough outside to soften an outline by a disc.
fn zono(d: vec2f, g0: vec2f, g1: vec2f, g2: vec2f, g3: vec2f) -> f32 {
  var s = -1e9;
  for (var i = 0; i < 4; i++) {
    var g = g0;
    if (i == 1) { g = g1; }
    if (i == 2) { g = g2; }
    if (i == 3) { g = g3; }
    let len = length(g);
    if (len < 1e-7) { continue; }
    let n = vec2f(-g.y, g.x) / len;
    let ext = abs(dot(g0, n)) + abs(dot(g1, n)) + abs(dot(g2, n)) + abs(dot(g3, n));
    s = max(s, abs(dot(d, n)) - ext);
  }
  return s;
}

struct Span {
  tn: f32,
  tf: f32,
  n: vec3f,
}

/// Narrows a ray's span to a slab |dot(x - c, n)| <= h, keeping the normal of
/// the face it enters by.
fn slab(sp: Span, o: f32, dn: f32, h: f32, n: vec3f) -> Span {
  var r = sp;
  if (abs(dn) < 1e-6) {
    if (abs(o) > h) { r.tn = 1e9; }
    return r;
  }
  let t1 = (-h - o) / dn;
  let t2 = (h - o) / dn;
  let ta = min(t1, t2);
  if (ta > r.tn) { r.tn = ta; r.n = -sign(dn) * n; }
  r.tf = min(r.tf, max(t1, t2));
  return r;
}

/// One car's body as seen by the pixel: premultiplied colour and coverage.
/// The outline is the union of two zonotopes (the body box, and a cabin whose
/// slanted generators make the windscreen and rear window), projected through
/// the lens at the car's depth and softened by its disc. Inside, a ray picks
/// the face for shading: paint, glass, wheels, grille, the lit windows of a bus.
fn carBody(l: Lens, q: vec2f, c: Car) -> vec4f {
  let zC = c.z + 0.5 * c.L;
  let yB = 0.5 * (c.top + 0.18);
  let r = coc(l, 1.0 / zC);
  // The car's centre on screen, and how its axes project there.
  let cs = F * vec2f(c.x, yB - CAM_H) / zC;
  let reachS = F * (0.6 * c.L + c.W + c.hc) / c.z * 0.5 + r + 2.0 * l.px;
  if (abs(q.x - cs.x) > reachS || abs(q.y - cs.y) > reachS) { return vec4f(0.0); }
  let jx = vec2f(F / zC, 0.0);
  let jy = vec2f(0.0, F / zC);
  let jz = -F * vec2f(c.x, yB - CAM_H) / (zC * zC);
  let hb = 0.5 * (c.top - 0.18);
  var sd = zono(q - cs, jx * c.W * 0.5, jy * hb, jz * c.L * 0.5, vec2f(0.0));
  let zCab = c.z + c.cab * c.L;
  let wc = c.W * 0.5 - 0.1;
  if (c.hc > 0.0) {
    let cc = F * vec2f(c.x, c.top - CAM_H) / zCab;
    let s2 = zono(q - cc, jx * wc, jz * c.a * 0.5, jy * c.hc * 0.5 + jz * c.sf * 0.5, jy * c.hc * 0.5 - jz * c.sf * 0.5);
    sd = min(sd, s2);
  }
  let w = max(l.px, 2.0 * r);
  var cov = clamp(0.5 - sd / w, 0.0, 1.0);
  if (cov <= 0.0) { return vec4f(0.0); }
  // A disc wider than the car spreads its shadow thin.
  let size = F * sqrt(c.W * (c.top + c.hc) + 0.25 * c.L * (c.top + c.hc)) / zC;
  cov *= size * size / (size * size + 0.6 * r * r);

  let albedo = paint(c);
  let lamp = pools(c.x, zC);
  let amb = vec3f(1.0, 0.84, 0.66) * (0.02 + 0.3 * lamp);
  let skyRef = vec3f(0.1, 0.072, 0.065);
  let avg = albedo * amb * 0.8 + vec3f(0.006) + skyRef * 0.06;
  let detail = 1.0 - smoothstep(0.12, 0.4, r / size);
  if (detail <= 0.0) { return vec4f(avg * cov, cov); }

  // The face under the pixel.
  let O = vec3f(0.0, CAM_H, 0.0);
  let D = vec3f(q.x / F, q.y / F, 1.0);
  var hit = Span(-1e9, 1e9, vec3f(0.0, 1.0, 0.0));
  hit = slab(hit, -c.x, D.x, c.W * 0.5, vec3f(1.0, 0.0, 0.0));
  hit = slab(hit, CAM_H - yB, D.y, hb, vec3f(0.0, 1.0, 0.0));
  hit = slab(hit, -zC, D.z, 0.5 * c.L, vec3f(0.0, 0.0, 1.0));
  var onCab = false;
  if (c.hc > 0.0) {
    var hc = Span(-1e9, 1e9, vec3f(0.0, 1.0, 0.0));
    hc = slab(hc, -c.x, D.x, wc, vec3f(1.0, 0.0, 0.0));
    hc = slab(hc, CAM_H - c.top, D.y, c.hc, vec3f(0.0, 1.0, 0.0));
    let ln = sqrt(c.sf * c.sf + c.hc * c.hc);
    let he = c.hc * (c.sf + 0.5 * c.a) / ln;
    let n1 = vec3f(0.0, c.sf, -c.hc) / ln;
    let n2 = vec3f(0.0, c.sf, c.hc) / ln;
    let oc = O - vec3f(c.x, c.top, zCab);
    hc = slab(hc, dot(oc, n1), dot(D, n1), he, n1);
    hc = slab(hc, dot(oc, n2), dot(D, n2), he, n2);
    if (hc.tn <= hc.tf && (hit.tn > hit.tf || hc.tn < hit.tn)) {
      hit = hc;
      onCab = true;
    }
  }
  var col = avg;
  if (hit.tn <= hit.tf) {
    let P = O + D * hit.tn;
    let N = hit.n;
    let V = -normalize(D);
    let fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
    // Distance from the car's front, whichever way it is driving.
    let lz = select(c.z + c.L - P.z, P.z - c.z, c.coming);
    let up = N.y > 0.5;
    let env = select(vec3f(0.035, 0.03, 0.026), skyRef, up) + vec3f(1.0, 0.8, 0.55) * lamp * select(0.03, 0.12, up);
    let diff = albedo * amb * select(0.55, 1.0, up);
    let paintC = diff + env * fres;
    let glassC = vec3f(0.004, 0.005, 0.007) + env * max(fres, 0.14) * 1.3;
    col = paintC;
    if (c.kind == 4.0) {
      // A bus: a band of lit windows down its sides, a big windscreen in front.
      let band = step(1.25, P.y) * step(P.y, 2.55);
      if (abs(N.x) > 0.5) {
        let bay = step(0.12, fract(lz / 1.6));
        col = mix(col, mix(glassC, vec3f(0.55, 0.5, 0.4), bay * 0.8), band);
      } else if (abs(N.z) > 0.5) {
        col = mix(col, mix(glassC, vec3f(0.3, 0.28, 0.22), 0.4), band * step(0.15, abs(P.x - c.x) - 0.0) + band * step(abs(P.x - c.x), 0.15));
      } else {
        col = mix(col, vec3f(0.03), 0.3 * step(abs(P.x - c.x), 0.5) * step(fract(lz / 3.0), 0.3));
      }
    } else if (onCab && !up) {
      // Glass all round the cabin, with a pillar in the middle of each side.
      col = glassC;
      if (abs(N.x) > 0.5) {
        let along = abs(P.z - zCab);
        col = mix(col, paintC, step(along, 0.09) + step(0.5 * c.a + c.sf * 0.8, along));
      }
    } else if (abs(N.x) > 0.5) {
      // Flanks: a crease catching the street, a dark sill, the wheels.
      let crease = exp(-pow((P.y - (c.top - 0.12)) / 0.05, 2.0));
      col += env * crease * 0.8;
      col *= mix(0.35, 1.0, step(0.32, P.y));
      let wf = vec2f(lz - 0.85, P.y - 0.34);
      let wr = vec2f(lz - (c.L - 0.9), P.y - 0.34);
      let wheel = step(min(length(wf), length(wr)), 0.36);
      col = mix(col, vec3f(0.006), wheel);
    } else if (abs(N.z) > 0.5) {
      // The face toward us: grille between the lamps, or the boot and its plate.
      let mid = step(abs(P.x - c.x), c.W * 0.5 - 0.42) * step(0.3, P.y) * step(P.y, 0.58);
      if (c.coming) {
        col = mix(col, vec3f(0.008), mid * 0.85);
      } else {
        col = mix(col, vec3f(0.14, 0.13, 0.11), mid * step(abs(P.x - c.x), 0.26) * 0.8);
      }
      col *= mix(0.5, 1.0, step(0.3, P.y));
    } else if (c.kind == 3.0 && onCab) {
      // The taxi's roof sign.
      col = mix(col, vec3f(0.9, 0.65, 0.25), step(abs(P.z - zCab), 0.22) * step(abs(P.x - c.x), 0.42));
    }
  }
  return vec4f(mix(avg, col, detail) * cov, cov);
}

/// The bodies of the traffic, front to back, and on the road under and
/// before them: their shadows, the beams of headlights, the glow of brake lights.
struct Traffic {
  body: vec4f,
  shade: f32,
  glow: vec3f,
}

fn traffic(l: Lens, p: vec2f) -> Traffic {
  let q = p - l.centre;
  var out = Traffic(vec4f(0.0), 1.0, vec3f(0.0));
  if (q.y > 0.0) { return out; }
  let m = -q.y;
  let tr = m / (F * CAM_H);
  let zr = 1.0 / max(tr, 1e-4);
  let xr = q.x / (F * tr);
  let R = coc(l, tr) + 3.0 * l.px;
  let zLo = F * (CAM_H - 3.3) / (m + R) - 12.0;
  let zHi = F * CAM_H / max(m - R, 0.004);
  var nearest = 1e9;
  for (var lane = 0; lane < 4; lane++) {
    let shift = laneShift(lane, l.time);
    let x = LANE_X0 + 4.5 * f32(lane);
    // The road around the pixel: shadows, beams, glows.
    if (abs(xr - x) < 6.0) {
      let k0 = floor((zr - 16.0 - shift) / SP) - 1.0;
      for (var n = k0; n <= k0 + 2.0; n += 1.0) {
        let c = carAt(lane, n, shift);
        if (c.z < 0.0) { continue; }
        let blurM = R / (F * tr) ;
        let o = abs(vec2f(xr - c.x, zr - (c.z + 0.5 * c.L))) - vec2f(0.5 * c.W + 0.2, 0.5 * c.L + 0.25);
        let rs = length(max(o, vec2f(0.0))) + min(max(o.x, o.y), 0.0);
        out.shade *= 1.0 - 0.72 * (1.0 - smoothstep(-0.3, 0.7 + blurM, rs));
        let ahead = c.z - zr;
        if (ahead > 0.0) {
          let lat = (xr - c.x) / (0.75 + ahead * 0.17);
          if (c.coming) {
            out.glow += vec3f(1.0, 0.9, 0.74) * 0.11 * exp(-ahead / 15.0) * smoothstep(0.0, 1.5, ahead) * exp(-lat * lat);
          } else {
            out.glow += vec3f(1.0, 0.08, 0.04) * 0.03 * exp(-ahead / 2.2) * exp(-lat * lat * 0.5);
          }
        }
      }
    }
    // Bodies that can cover the pixel.
    let n0 = floor((zLo - shift) / SP) - 1.0;
    let n1 = min(floor((zHi - shift) / SP), n0 + 6.0);
    for (var n = n0; n <= n1; n += 1.0) {
      let c = carAt(lane, n, shift);
      if (c.z < 0.0) { continue; }
      let b = carBody(l, q, c);
      if (b.a <= 0.0) { continue; }
      // Composite in depth order: two bodies rarely overlap, so "over" by
      // the nearer one is enough.
      if (c.z < nearest) {
        out.body = b + out.body * (1.0 - b.a);
        nearest = c.z;
      } else {
        out.body = out.body + b * (1.0 - out.body.a);
      }
    }
  }
  return out;
}

/// Head lights coming, tail lights going, at the corners of each car, and
/// in the wet road their long reflections.
fn carLights(l: Lens, p: vec2f, mirror: bool) -> vec3f {
  var sum = vec3f(0.0);
  for (var lane = 0; lane < 4; lane++) {
    let coming = lane < 2;
    let x = LANE_X0 + 4.5 * f32(lane);
    let y0 = select(0.85, 0.66, coming);
    let shift = laneShift(lane, l.time);
    let rr = rowRange(l, p, x, select(y0, -y0, mirror), 0.02);
    let n0 = floor((rr.y - shift) / SP) - 1.0;
    let n1 = min(floor((rr.z - shift) / SP), n0 + 12.0);
    for (var n = n0; n <= n1; n += 1.0) {
      let c = carAt(lane, n, shift);
      if (c.z < 0.0) { continue; }
      let z = c.z - 0.05;
      var y = select(0.85, 0.66, coming);
      if (c.kind == 4.0) { y = select(1.0, 0.75, coming); }
      if (c.kind == 2.0 && !coming) { y = 1.0; }
      let ly = select(y, -y, mirror);
      let col = select(vec3f(1.0, 0.1, 0.05), vec3f(1.0, 0.96, 0.88), coming);
      let e = select(0.8, 2.2, coming) * select(1.0, 0.35, mirror) * min(pow(45.0 / z, 1.5), 2.0);
      let stretch = select(1.0, 6.0, mirror);
      let d = 1.0 / z;
      let dx = c.W * 0.5 - select(0.17, 0.24, coming);
      sum += pointLight(l, p, project(l, vec3f(c.x - dx, ly, z)), d, e, col, F * 0.12 / z, stretch, 1.0);
      sum += pointLight(l, p, project(l, vec3f(c.x + dx, ly, z)), d, e, col, F * 0.12 / z, stretch, 1.0);
      if (c.kind == 3.0 && !mirror) {
        let zs = c.z + c.cab * c.L;
        sum += pointLight(l, p, project(l, vec3f(c.x, c.top + c.hc + 0.12, zs)), 1.0 / zs, 0.25 * min(pow(45.0 / zs, 1.5), 2.0), vec3f(1.0, 0.7, 0.3), F * 0.25 / zs, 1.0, 1.0);
      }
    }
  }
  return sum;
}

/// Signals at each crossing, changing on their own cycles.
fn signals(l: Lens, p: vec2f, mirror: bool) -> vec3f {
  var sum = vec3f(0.0);
  for (var s = 0; s < 2; s++) {
    let x = select(KERB_R + 0.4, KERB_L - 0.4, s == 0);
    let y = select(5.5, -5.5, mirror);
    let rr = rowRange(l, p, x, y, 0.02);
    let m0 = max(1.0, floor(rr.y / BLOCK));
    let m1 = min(floor(rr.z / BLOCK) + 1.0, m0 + 8.0);
    for (var m = m0; m <= m1; m += 1.0) {
      let z = m * BLOCK + 1.0;
      let ph = fract((l.time + hash21(vec2f(m, 3.0)) * 16.0) / 16.0) * 16.0;
      var col = vec3f(0.15, 1.0, 0.45);
      if (ph > 9.0) { col = vec3f(1.0, 0.55, 0.08); }
      if (ph > 11.0) { col = vec3f(1.0, 0.1, 0.06); }
      let stretch = select(1.0, 5.0, mirror);
      sum += pointLight(l, p, project(l, vec3f(x, y, z)), 1.0 / z, select(1.0, 0.3, mirror) * min(pow(60.0 / z, 1.5), 1.0), col, F * 0.18 / z, stretch, 1.0);
    }
  }
  return sum;
}

fn stringY(i: i32, x: f32) -> f32 {
  let e = params.ends[i];
  let s = (x - e.x) / (e.z - e.x);
  return mix(e.y, e.w, s) - params.str[i].x * 4.0 * s * (1.0 - s);
}

/// String lights across the balcony, in screen space since they hang so close.
fn bulbs(l: Lens, p: vec2f) -> vec3f {
  var sum = vec3f(0.0);
  for (var s = 0; s < 2; s++) {
    let S = params.str[s];
    let e = params.ends[s];
    let r = l.A * abs(S.y - l.focus);
    let reach = r + 0.03;
    let sway = 0.006 * sin(l.time * 0.7 + S.w);
    if (abs(p.y - stringY(s, p.x) - sway) > reach + 0.03) { continue; }
    let sp = S.z;
    let k0 = max(0.0, floor((p.x - reach - e.x) / sp));
    let k1 = min(floor((e.z - e.x) / sp), floor((p.x + reach - e.x) / sp) + 1.0);
    for (var k = k0; k <= k1; k += 1.0) {
      let bx = e.x + k * sp;
      let at = vec2f(bx, stringY(s, bx) + 0.006 * sin(l.time * 0.7 + S.w + k * 0.3) - 0.009);
      let h = hash21(vec2f(k, f32(s) + 70.0));
      sum += pointLight(l, p, at, S.y, 0.8 + 0.4 * h, mix(vec3f(1.0, 0.6, 0.26), vec3f(1.0, 0.75, 0.45), h), 0.0075 * S.y, 1.0, 1.0);
    }
  }
  return sum;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let a = params.aspect;
  let px = 1.0 / params.res.y;
  let raw = vec2f(uv.x * a, 1.0 - uv.y);
  let mid = vec2f(a * 0.5, 0.5);
  let p = mid + (raw - mid) * params.breath;
  let l = Lens(vec2f(a * 0.5, H0), params.focus, params.aperture, px, params.time);

  let st = textureSampleLevel(still, samp, uv, 0.0);
  let road = st.a;
  let above = aboveParapet(l, p);
  let tf = traffic(l, p);
  // The road under the traffic: shadows and the light the cars throw on it,
  // then everything the wet road mirrors.
  var col = st.rgb * mix(1.0, tf.shade, road * above);
  var under = tf.glow;
  if (road > 0.0) {
    under += carLights(l, p, true) + signals(l, p, true);
  }
  col += under * road * above;
  // The bodies cover what is behind them, then the lights shine on top.
  let body = tf.body * above;
  col = col * (1.0 - body.a) + body.rgb;
  col += (carLights(l, p, false) + signals(l, p, false)) * above;
  col += bulbs(l, p);

  col *= params.exposure;
  col = 1.0 - exp(-col * 1.6);
  col = pow(col, vec3f(0.92));
  let q = uv - 0.5;
  col *= 1.0 - 0.45 * smoothstep(0.25, 0.85, length(q * vec2f(1.0, 1.15)) * 1.2);
  col += (hash21(uv * params.res) - 0.5) / 255.0;
  return vec4f(col, 1.0);
}
