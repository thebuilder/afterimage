// Everything that does not move: the sky and far skyline, the facades with
// their lit windows and shopfronts, the road with its lamp pools and markings,
// the street lamps and their reflections in the wet road, and the parapet.
// Drawn in linear light into a half-float texture, and only drawn again when
// the focus or the lens changes.
import { hash21 } from "../../shaders/common.wgsl";
import { Lens, coc, project, buildingHeight, pointLight, areaLight, rowRange, onRoad, aboveParapet, F, H0, CAM_H, X_LEFT, X_RIGHT, KERB_L, KERB_R, Z_END, PARAPET_Y, D_PARAPET, D_SKYLINE } from "./scene.wgsl";

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

/// Lamp light on the road at (x, z).
fn pools(x: f32, z: f32) -> f32 {
  let k = round((z - 14.0) / 32.0);
  let zk = 14.0 + k * 32.0;
  let dz = z - zk;
  let l = exp(-(dz * dz + (x - (KERB_L - 0.8)) * (x - (KERB_L - 0.8))) / 70.0)
        + exp(-(dz * dz + (x - (KERB_R + 0.8)) * (x - (KERB_R + 0.8))) / 70.0);
  return l;
}

/// The surface seen at p: its colour and its distance in diopters.
fn surface(l: Lens, p: vec2f) -> vec4f {
  let q = p - l.centre;
  if (p.y < PARAPET_Y) {
    let edge = exp(-(PARAPET_Y - p.y) * 60.0);
    return vec4f(vec3f(0.004, 0.004, 0.005) + vec3f(0.03, 0.022, 0.016) * edge, D_PARAPET);
  }
  var col = sky(q);
  var best = D_SKYLINE;
  if (q.y < 0.0) {
    let t = -q.y / (F * CAM_H);
    let z = 1.0 / t;
    let x = q.x / (F * t);
    let light = pools(x, z) + 0.06;
    var c = vec3f(0.006, 0.006, 0.007) + vec3f(0.16, 0.12, 0.08) * light * 0.35;
    if (x < KERB_L || x > KERB_R) {
      c = vec3f(0.012, 0.011, 0.011) + vec3f(0.2, 0.15, 0.1) * light * 0.45;
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
    col = c;
    best = t;
  }
  for (var s = 0; s < 2; s++) {
    let xf = select(X_RIGHT, X_LEFT, s == 0);
    let t = q.x / (F * xf);
    if (t <= best) { continue; }
    let z = 1.0 / t;
    let y = CAM_H + q.y / (F * t);
    if (y <= 0.0 || y >= buildingHeight(f32(s), z)) { continue; }
    // Dark stone, lit from below by the street, with the glass of unlit windows.
    var c = vec3f(0.007, 0.007, 0.009) + vec3f(0.07, 0.05, 0.032) * exp(-y / 6.0);
    let fy = fract((y - 4.5) / 3.6);
    let fz = fract(z / 3.4);
    let glass = select(step(0.15, fy) * step(fy, 0.68) * step(0.27, fz) * step(fz, 0.73), step(1.0, y) * step(y, 3.8) * step(0.08, fz) * step(fz, 0.92), y < 4.5);
    c = mix(c, vec3f(0.004, 0.006, 0.01) + vec3f(0.03, 0.025, 0.02) * exp(-y / 4.0), glass * 0.8);
    col = c;
    best = t;
  }
  return vec4f(col, best);
}

fn windowColour(h: f32) -> vec3f {
  if (h < 0.5) { return vec3f(1.0, 0.7, 0.4); }
  if (h < 0.78) { return vec3f(1.0, 0.88, 0.7); }
  if (h < 0.94) { return vec3f(0.72, 0.85, 1.0); }
  return vec3f(0.6, 1.0, 0.85);
}

/// The lit windows and shopfronts on one facade that can reach the pixel.
fn facadeLights(l: Lens, p: vec2f, side: i32) -> vec3f {
  let xf = select(X_RIGHT, X_LEFT, side == 0);
  let q = p - l.centre;
  if (q.x * sign(xf) < -0.07) { return vec3f(0.0); }
  let maxR = 0.045;
  let t = clamp(q.x / (F * xf), 1.0 / Z_END, 1.0 / 6.0);
  let reach = min(coc(l, t), maxR) + 0.004;
  let dt = reach / (F * abs(xf)) * 1.1;
  let z0 = 1.0 / (t + dt);
  let z1 = 1.0 / max(t - dt, 1.0 / Z_END);
  let k0 = floor(z0 / 3.4);
  let k1 = min(floor(z1 / 3.4), k0 + 11.0);
  let yc = CAM_H + q.y / (F * t);
  let dy = reach / (F * t) + 2.0;
  let j0 = max(-1.0, floor((yc - dy - 4.5) / 3.6));
  let j1 = min(j0 + 6.0, floor((yc + dy - 4.5) / 3.6));
  var sum = vec3f(0.0);
  for (var k = k0; k <= k1; k += 1.0) {
    let z = (k + 0.5) * 3.4;
    let hgt = buildingHeight(f32(side), z);
    if (hgt <= 0.0) { continue; }
    let d = 1.0 / z;
    let hw = F * abs(xf) * 0.8 / (z * z);
    for (var j = j0; j <= j1; j += 1.0) {
      let h = hash21(vec2f(k * 1.3 + f32(side) * 71.0, j + 9.0));
      if (j < 0.0) {
        // Shopfronts on the ground floor: wide, warm and mostly lit.
        if (h > mix(0.15, 0.55, smoothstep(40.0, 90.0, z))) { continue; }
        let at = project(l, vec3f(xf, 2.4, z));
        sum += areaLight(l, p, at, vec2f(hw * 1.7, F * 1.3 / z), d, 1.1, mix(vec3f(1.0, 0.78, 0.5), vec3f(0.85, 0.95, 1.0), step(0.4, h)), maxR);
        continue;
      }
      let yw = 4.5 + (j + 0.42) * 3.6;
      // Near offices are mostly closed for the night.
      if (yw > hgt - 1.5 || h > mix(0.05, 0.32, smoothstep(40.0, 110.0, z))) { continue; }
      let at = project(l, vec3f(xf, yw, z));
      sum += areaLight(l, p, at, vec2f(hw, F * 0.95 / z), d, 0.75 + 0.5 * hash21(vec2f(k, j + 3.0)), windowColour(hash21(vec2f(k + f32(side) * 31.0, j))), maxR);
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

  // The surfaces, softened by their own disc: five taps are enough for dark stone.
  let s0 = surface(l, p);
  let r = min(coc(l, s0.w), 0.06) * 0.6;
  var col = s0.rgb;
  if (r > px) {
    col = (s0.rgb * 2.0 + surface(l, p + vec2f(r, 0.0)).rgb + surface(l, p - vec2f(r, 0.0)).rgb + surface(l, p + vec2f(0.0, r)).rgb + surface(l, p - vec2f(0.0, r)).rgb) / 6.0;
  }

  var street = facadeLights(l, p, 0) + facadeLights(l, p, 1);
  street += lamps(l, p, false);
  street += skyline(l, p);
  // The wet road mirrors the lamps.
  if (onRoad(l, p)) {
    street += lamps(l, p, true);
  }
  col += street * aboveParapet(l, p);
  return vec4f(col, 1.0);
}
