// Everything that does not move: the sky and far skyline, the facades with
// their lit windows and shopfronts, the road with its lamp pools and markings,
// the street lamps and their reflections in the wet road, and the parapet.
// Drawn in linear light into a half-float texture, and only drawn again when
// the focus or the lens changes.
import { hash21 } from "../../shaders/common.wgsl";
import { Lens, coc, project, building, segment, traceSide, hiddenOnSide, lineOf, pools, pulse, pointLight, areaLight, rowRange, aboveParapet, F, H0, CAM_H, KERB_L, KERB_R, Z_END, PARAPET_Y, D_PARAPET, D_SKYLINE, BLOCK, GAP, SEG, COLS, STOREY, SHOP_H } from "./scene.wgsl";

struct Params {
  res: vec2f,
  aspect: f32,
  time: f32,
  focus: f32,
  aperture: f32,
  breath: f32,
  _p0: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

fn towerTop(qx: f32) -> f32 {
  let col = floor(qx / 0.016);
  let h = hash21(vec2f(col, 41.0));
  let wide = 1.0 - smoothstep(0.08, 0.42, abs(qx));
  return (0.008 + 0.11 * h * h * h + 0.03 * hash21(vec2f(col, 7.0))) * wide;
}

fn sky(q: vec2f) -> vec3f {
  // A city sky: low cloud lit from below, browner near the horizon.
  var c = mix(vec3f(0.11, 0.075, 0.07), vec3f(0.03, 0.033, 0.055), smoothstep(-0.02, 0.45, q.y));
  if (q.y < towerTop(q.x)) { c = vec3f(0.014, 0.014, 0.02); }
  return c;
}

struct Surf {
  col: vec3f,
  d: f32,      // diopters
  kind: i32,   // 0 sky, 1 road, 2 left buildings, 3 right buildings, 4 parapet, 5 lamp post
}

/// The window layout of a material: across a column (lo, hi), up a storey (lo, hi).
fn windowGrid(mat: f32) -> vec4f {
  if (mat < 0.5) { return vec4f(0.3, 0.7, 0.22, 0.74); }    // brick: tall sash windows
  if (mat < 1.5) { return vec4f(0.27, 0.73, 0.18, 0.76); }  // stone: larger, with sills
  if (mat < 2.5) { return vec4f(0.03, 0.97, 0.1, 0.94); }   // glass: floor-to-ceiling bays
  return vec4f(0.08, 0.92, 0.36, 0.78);                      // concrete: ribbon windows
}

fn albedo(mat: f32, seed: f32) -> vec3f {
  var c = vec3f(0.06, 0.032, 0.022);
  if (mat > 0.5) { c = vec3f(0.085, 0.075, 0.062); }
  if (mat > 1.5) { c = vec3f(0.02, 0.025, 0.034); }
  if (mat > 2.5) { c = vec3f(0.055, 0.055, 0.056); }
  return c * (0.75 + 0.5 * seed);
}

/// A building face at hit (z, face, distance from the axis, height).
fn facade(l: Lens, s: i32, h: vec4f) -> vec3f {
  let z = h.x;
  let xa = h.z;
  let y = h.w;
  let sg = segment(z);
  let bd = building(f32(s), sg.x + 1.0);
  let mat = bd.z;
  let base = albedo(mat, bd.w);
  // How much of the facade one pixel (or the disc) covers, in metres along
  // the street and up the wall. Every pattern below is filtered by it.
  let fw = max(l.px, 0.5 * coc(l, 1.0 / z));
  let fz = fw * z * z / (F * xa);
  let fy = fw * z / F;

  // The street lights the lower floors; each lamp washes its own stretch.
  let k = round((z - 14.0) / 32.0);
  let dz = z - (14.0 + 32.0 * k);
  let wash = exp(-dz * dz / 110.0) * exp(-max(y - 3.0, 0.0) / 8.0);
  let up = exp(-y / 7.0);
  let lightAmt = 0.22 + 1.1 * up + 1.5 * wash + 0.25 * smoothstep(20.0, 80.0, y);
  let warm = vec3f(1.0, 0.82, 0.62);

  // The cornice: a lit lip along the roofline with its shadow under it.
  let cornice = clamp((y - (bd.x - 0.7)) / fy + 0.5, 0.0, 1.0);
  let underLip = clamp((y - (bd.x - 1.4)) / fy + 0.5, 0.0, 1.0) * (1.0 - cornice);

  if (h.y > 0.5) {
    // A blank side wall facing down the street, where the nearer neighbour
    // stops short: party-wall brick in shade, lit only near the ground.
    var c = base * vec3f(1.0, 0.92, 0.85) * (0.14 + 0.7 * up + 0.5 * wash) * warm;
    c = mix(c, base * 1.8 * lightAmt * warm, cornice);
    return c * (1.0 - 0.5 * underLip);
  }

  let zl = z - sg.x;
  let cw = SEG / COLS;
  let u = zl / cw;
  let fu = fz / cw;
  let L = windowGrid(mat);
  var c = base * lightAmt * warm;

  // Where one building meets the next: a joint in shadow and a pilaster.
  let inner = pulse(zl / SEG, 0.02, 0.98, fz / SEG);
  c *= mix(0.45, 1.0, inner);

  if (y < SHOP_H) {
    // Shopfronts: dark glass between piers, a fascia above.
    let bay = pulse(u, 0.06, 0.94, fu);
    let glass = bay * pulse(y / SHOP_H, 0.06, 0.8, fy / SHOP_H);
    let fascia = bay * pulse(y / SHOP_H, 0.82, 0.96, fy / SHOP_H);
    c = mix(c, vec3f(0.01, 0.009, 0.008) + base * 0.2, glass);
    c = mix(c, base * 0.5 * lightAmt, fascia);
    // The kerb-side plinth catches the lamps.
    c += base * warm * wash * 1.5 * (1.0 - pulse(y / SHOP_H, 0.04, 1.0, fy / SHOP_H));
    return c;
  }

  let v = (y - SHOP_H) / STOREY;
  let fv = fy / STOREY;
  let roof = 1.0 - clamp((y - (bd.x - 1.6)) / fy + 0.5, 0.0, 1.0);
  let wu = pulse(u, L.x, L.y, fu);
  let wv = pulse(v, L.z, L.w, fv);
  let win = wu * wv * roof * inner;

  if (mat > 1.5 && mat < 2.5) {
    // Curtain wall: glass reflecting the city glow, dark spandrels, mullions.
    let sky = vec3f(0.03, 0.026, 0.03) * (0.6 + 0.6 * smoothstep(0.0, bd.x, y)) + vec3f(0.03, 0.02, 0.012) * up;
    let spandrel = 1.0 - wv;
    c = mix(sky, base * lightAmt * 0.8, spandrel * 0.85);
    c += vec3f(0.035, 0.032, 0.03) * (1.0 - wu) * wv * (0.5 + up);
    c = mix(c, base * 2.0 * lightAmt * warm, cornice * 0.6);
    return c * inner * (1.0 - 0.5 * underLip);
  }

  // Masonry: storey bands, window reveals in shadow with the far jamb catching
  // light, sills below, and the glass itself faintly reflecting the street.
  let band = pulse(v, 0.94, 1.0, fv) * (1.0 - step(2.5, mat));
  c *= 1.0 + 0.6 * band;
  let jamb = pulse(u, L.y - 0.05, L.y, fu) * wv;
  let reveal = pulse(u, L.x, L.x + 0.04, fu) * wv + pulse(v, L.w - 0.05, L.w, fv) * wu;
  let sill = pulse(u, L.x - 0.03, L.y + 0.03, fu) * pulse(v, L.z - 0.045, L.z, fv);
  let glassC = vec3f(0.007, 0.008, 0.011) + vec3f(0.02, 0.016, 0.012) * up + vec3f(0.008, 0.008, 0.012) * hash21(vec2f(floor(u) + sg.x, floor(v)));
  c = mix(c, glassC, win * 0.92);
  c = mix(c, base * 0.35 * lightAmt, reveal * roof * 0.8);
  c = mix(c, base * 1.6 * lightAmt * warm, jamb * roof * 0.7);
  c = mix(c, base * 2.0 * lightAmt * warm, sill * roof);
  c = mix(c, base * 2.2 * lightAmt * warm, cornice);
  return c * (1.0 - 0.55 * underLip);
}

struct Post {
  col: vec3f,
  cov: f32,
  t: f32,
}

/// Lamp posts on both kerbs: a dark pole and an arm out to the lamp head.
fn posts(l: Lens, q: vec2f, behind: f32) -> Post {
  var out = Post(vec3f(0.0), 0.0, 0.0);
  for (var s = 0; s < 2; s++) {
    let xp = select(KERB_R + 2.0, KERB_L - 2.0, s == 0);
    let xl = select(KERB_R + 0.8, KERB_L - 0.8, s == 0);
    if (q.x * xp <= 0.0) { continue; }
    let z = F * xp / q.x;
    let kc = round((z - 14.0) / 32.0);
    for (var dk = -1.0; dk <= 1.0; dk += 1.0) {
      let k = kc + dk;
      if (k < 0.0) { continue; }
      let zk = 14.0 + 32.0 * k;
      let t = 1.0 / zk;
      if (t <= behind || zk > Z_END) { continue; }
      let fw = max(l.px, 0.5 * coc(l, t));
      let y = CAM_H + q.y * zk / F;
      // Pole.
      let hw = F * 0.11 * t;
      let dx = abs(q.x - F * xp * t);
      var cov = clamp((hw - dx) / fw + 0.5, 0.0, 1.0) * clamp(9.2 - y, 0.0, 1.0) * step(0.0, y) * min(1.0, 2.0 * hw / fw);
      // Arm, rising a little toward the head.
      let xw = q.x * zk / F;
      let along = clamp((xw - xp) / (xl - xp), 0.0, 1.0);
      let ya = 9.0 + 0.35 * along;
      let ha = F * 0.07 * t;
      let inArm = step(min(xp, xl), xw) * step(xw, max(xp, xl));
      cov = max(cov, clamp((ha - abs(y - ya) * F * t) / fw + 0.5, 0.0, 1.0) * inArm * min(1.0, 2.0 * ha / fw));
      if (cov <= out.cov) { continue; }
      let col = vec3f(0.006, 0.006, 0.007) + vec3f(0.05, 0.04, 0.03) * exp(-abs(y - 9.0) * 0.6) + vec3f(0.03, 0.022, 0.015) * exp(-y / 2.0);
      out = Post(col, cov, t);
    }
  }
  return out;
}

/// The surface seen at p: its colour, distance in diopters, and what it is.
fn surface(l: Lens, p: vec2f) -> Surf {
  let q = p - l.centre;
  if (p.y < PARAPET_Y) {
    let edge = exp(-(PARAPET_Y - p.y) * 60.0);
    return Surf(vec3f(0.004, 0.004, 0.005) + vec3f(0.03, 0.022, 0.016) * edge, D_PARAPET, 4);
  }
  var out = Surf(sky(q), D_SKYLINE, 0);
  if (q.y < 0.0) {
    let t = -q.y / (F * CAM_H);
    let z = 1.0 / t;
    let x = q.x / (F * t);
    let light = pools(x, z) + 0.06;
    var c = vec3f(0.006, 0.006, 0.007) + vec3f(0.16, 0.12, 0.08) * light * 0.35;
    if (x < KERB_L || x > KERB_R) {
      // Pavement, a step up, its kerb edge catching the lamps.
      c = vec3f(0.012, 0.011, 0.011) + vec3f(0.2, 0.15, 0.1) * light * 0.45;
      let w = F * t * 0.12;
      let kerb = clamp((w - min(abs(x - KERB_L), abs(x - KERB_R)) * F * t) / l.px + 0.5, 0.0, 1.0) * min(1.0, 2.0 * w / l.px);
      c += vec3f(0.12, 0.1, 0.08) * kerb * light;
    } else {
      // Lane markings, faded where they would be thinner than a pixel.
      let w = F * t * 0.08;
      var mark = 0.0;
      for (var i = 0; i < 3; i++) {
        let xm = KERB_L + 4.5 * f32(i + 1);
        let solid = select(step(fract(z / 12.0), 0.4), 1.0, i == 1);
        mark = max(mark, solid * clamp((w - abs(x - xm) * F * t) / l.px + 0.5, 0.0, 1.0) * min(1.0, 2.0 * w / l.px));
      }
      c += vec3f(0.55, 0.5, 0.4) * mark * light * 0.4;
    }
    out = Surf(c, t, 1);
  }
  for (var s = 0; s < 2; s++) {
    let h = traceSide(q, s);
    if (h.x < 0.0) { continue; }
    out = Surf(facade(l, s, h), 1.0 / h.x, 2 + s);
  }
  let post = posts(l, q, out.d);
  if (post.cov > 0.0) {
    out.col = mix(out.col, post.col, post.cov);
    if (post.cov > 0.5) {
      out.d = post.t;
      out.kind = 5;
    }
  }
  return out;
}

fn windowColour(h: f32) -> vec3f {
  if (h < 0.5) { return vec3f(1.0, 0.7, 0.4); }
  if (h < 0.78) { return vec3f(1.0, 0.88, 0.7); }
  if (h < 0.94) { return vec3f(0.72, 0.85, 1.0); }
  return vec3f(0.6, 1.0, 0.85);
}

/// The column index along one side: twenty to a block, four to a building.
fn colIndex(z: f32) -> f32 {
  let b = floor(z / BLOCK);
  return b * 20.0 + clamp(floor((z - b * BLOCK - GAP) / (SEG / COLS)), 0.0, 19.0);
}

/// The lit windows and shopfronts on one side that can reach the pixel, each
/// on its own building's facade, and none that a nearer building hides.
fn facadeLights(l: Lens, p: vec2f, side: i32) -> vec3f {
  let W = lineOf(side);
  let xs = select(1.0, -1.0, side == 0);
  let q = p - l.centre;
  if (q.x * xs < -0.07) { return vec3f(0.0); }
  let maxR = 0.045;
  let t = clamp(q.x * xs / (F * W), 1.0 / Z_END, 1.0 / 6.0);
  let reach = min(coc(l, t), maxR) + 0.006;
  let dt = reach / (F * W) * 1.15;
  let z0 = 1.0 / (t + dt);
  let z1 = 1.0 / max(t - dt, 1.0 / Z_END);
  let g0 = colIndex(z0);
  let g1 = min(colIndex(z1), g0 + 11.0);
  let yc = CAM_H + q.y / (F * t);
  let dy = reach / (F * t) + 2.5;
  let j0 = max(-1.0, floor((yc - dy - SHOP_H) / STOREY));
  let j1 = min(j0 + 6.0, floor((yc + dy - SHOP_H) / STOREY));
  let cw = SEG / COLS;
  var sum = vec3f(0.0);
  for (var g = g0; g <= g1; g += 1.0) {
    let blk = floor(g / 20.0);
    let cin = g - blk * 20.0;
    let sgi = floor(cin / COLS);
    let zs = blk * BLOCK + GAP + sgi * SEG;
    let bd = building(f32(side), zs + 1.0);
    if (bd.x <= 0.0) { continue; }
    let L = windowGrid(bd.z);
    let col = cin - sgi * COLS;
    let xa = W + bd.y;
    let glassy = bd.z > 1.5 && bd.z < 2.5;
    for (var j = j0; j <= j1; j += 1.0) {
      let h = hash21(vec2f(g * 1.3 + f32(side) * 71.0, j + 9.0));
      var zc: f32;
      var yw: f32;
      var half: vec2f;
      var e: f32;
      var tint: vec3f;
      if (j < 0.0) {
        // Shopfronts on the ground floor: wide and warm, most still lit.
        zc = zs + (col + 0.5) * cw;
        if (h > mix(0.45, 0.7, smoothstep(40.0, 90.0, zc))) { continue; }
        yw = SHOP_H * 0.43;
        half = vec2f(0.42 * cw, SHOP_H * 0.36);
        e = 1.1;
        tint = mix(vec3f(1.0, 0.78, 0.5), vec3f(0.85, 0.95, 1.0), step(0.3, h));
      } else {
        zc = zs + (col + 0.5 * (L.x + L.y)) * cw;
        yw = SHOP_H + (j + 0.5 * (L.z + L.w)) * STOREY;
        // Near offices are mostly closed for the night; glass towers less so.
        let lit = mix(0.05, 0.3, smoothstep(40.0, 110.0, zc)) + select(0.0, 0.12, glassy);
        if (yw > bd.x - 2.0 || h > lit) { continue; }
        half = vec2f(0.5 * (L.y - L.x) * cw, 0.5 * (L.w - L.z) * STOREY);
        e = 0.75 + 0.5 * hash21(vec2f(g, j + 3.0));
        tint = windowColour(hash21(vec2f(g + f32(side) * 31.0, j)));
        if (glassy) { tint = mix(tint, vec3f(0.8, 0.92, 1.0), 0.6); e *= 0.8; }
      }
      if (bd.y > 0.0 && hiddenOnSide(side, xa, yw, zc)) { continue; }
      let at = project(l, vec3f(xs * xa, yw, zc));
      let hs = vec2f(F * xa * half.x / (zc * zc), F * half.y / zc);
      sum += areaLight(l, p, at, hs, 1.0 / zc, e, tint, maxR);
    }
  }
  return sum;
}

/// Street lamps on both kerbs, and in the wet road their long reflections.
fn lamps(l: Lens, p: vec2f, mirror: bool) -> vec3f {
  var sum = vec3f(0.0);
  for (var s = 0; s < 2; s++) {
    let x = select(KERB_R + 0.8, KERB_L - 0.8, s == 0);
    let y = select(9.0, -9.0, mirror);
    let rr = rowRange(l, p, x, y, 0.02);
    let k0 = max(0.0, floor((rr.y - 14.0) / 32.0));
    let k1 = min(floor((rr.z - 14.0) / 32.0) + 1.0, k0 + 14.0);
    for (var k = k0; k <= k1; k += 1.0) {
      let z = 14.0 + k * 32.0;
      if (z > Z_END) { break; }
      let at = project(l, vec3f(x, y, z));
      let stretch = select(1.0, 4.5, mirror);
      let e = select(1.4, 0.3, mirror) * min(pow(45.0 / z, 1.5), 1.6);
      sum += pointLight(l, p, at, 1.0 / z, e, vec3f(1.0, 0.8, 0.55), F * 0.35 / z, stretch, 1.0);
    }
  }
  return sum;
}

/// The far skyline's windows, too far for anything but points.
fn skyline(l: Lens, p: vec2f) -> vec3f {
  let q = p - l.centre;
  if (abs(q.x) > 0.48 || q.y < -0.03 || q.y > 0.19) { return vec3f(0.0); }
  let cell = vec2f(0.0065, 0.0085);
  let r = min(coc(l, D_SKYLINE), 0.014);
  let R = i32(ceil((r + 0.003) / cell.x));
  let base = floor(q / cell);
  var sum = vec3f(0.0);
  for (var j = -R; j <= R; j++) {
    for (var i = -R; i <= R; i++) {
      let c = base + vec2f(f32(i), f32(j));
      if (hash21(c + 23.0) > 0.28) { continue; }
      let at = (c + 0.5) * cell;
      if (at.y < 0.002 || at.y > towerTop(at.x) - 0.002) { continue; }
      sum += pointLight(l, p, at + l.centre, D_SKYLINE, 0.45 + 0.4 * hash21(c), windowColour(hash21(c + 4.0)), 0.0012, 1.0, 0.014);
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

  // The surfaces, softened by their own disc. Their patterns are already
  // filtered by it, so seven taps on a turned hexagon only have to carry the
  // outlines. The same taps say what each light is seen through: a window
  // across the street, or a far tower, never shows on a nearer building.
  let s0 = surface(l, p);
  let r = min(coc(l, s0.d), 0.06) * 0.6;
  var col = s0.col;
  var vSky = select(0.0, 1.0, s0.kind == 0);
  var vL = select(0.0, 1.0, s0.kind != 3 && s0.kind != 5);
  var vR = select(0.0, 1.0, s0.kind != 2 && s0.kind != 5);
  var vRoad = select(0.0, 1.0, s0.kind == 1);
  if (r > px) {
    let turn = hash21(floor(raw / px)) * 1.0472;
    for (var i = 0; i < 6; i++) {
      let ang = turn + f32(i) * 1.0472;
      let st = surface(l, p + r * vec2f(cos(ang), sin(ang)));
      col += st.col;
      vSky += select(0.0, 1.0, st.kind == 0);
      vL += select(0.0, 1.0, st.kind != 3 && st.kind != 5);
      vR += select(0.0, 1.0, st.kind != 2 && st.kind != 5);
      vRoad += select(0.0, 1.0, st.kind == 1);
    }
    col /= 7.0;
    vSky /= 7.0;
    vL /= 7.0;
    vR /= 7.0;
    vRoad /= 7.0;
  }

  var street = facadeLights(l, p, 0) * vL + facadeLights(l, p, 1) * vR;
  street += lamps(l, p, false);
  street += skyline(l, p) * vSky;
  // The wet road mirrors the lamps.
  if (vRoad > 0.0) {
    street += lamps(l, p, true) * vRoad;
  }
  col += street * aboveParapet(l, p);
  // Alpha carries how much of the pixel is open road, for the moving pass.
  return vec4f(col, vRoad);
}
