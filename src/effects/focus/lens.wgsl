// A night city from a balcony, seen through a fast lens. Every light is a
// point at a known depth, and the lens spreads each one into its circle of
// confusion: a disc whose radius grows with how far the light is from the
// focus plane, measured in diopters. The discs are hexagonal from the blades,
// brighter at the rim, clipped into cat's eyes toward the corners, and fringed
// magenta in front of focus and green behind it, as a real fast lens does.
import { hash21 } from "../../shaders/common.wgsl";

struct Params {
  res: vec2f,
  aspect: f32,
  time: f32,
  focus: f32,      // focus distance in diopters (1 / depth)
  aperture: f32,   // disc radius per diopter of defocus, in screen heights
  exposure: f32,
  breath: f32,     // focus breathing: a slight zoom as focus moves
  ends: array<vec4f, 2>,   // string lights: from x, y, to x, y
  str: array<vec4f, 2>,    // sag, diopters, bulb spacing, sway phase
}
@group(0) @binding(0) var<uniform> params: Params;

const SKY_BASE = 0.37;
const STREET_Y = 0.33;
const PARAPET_Y = 0.26;
const D_CITY = 0.07;
const D_STREET = 0.25;
const D_PARAPET = 1.3;

var<private> px: f32;
var<private> centre: vec2f;

fn coc(d: f32) -> f32 {
  return params.aperture * abs(d - params.focus);
}

/// The light a single point spreads over the pixel at offset `o` from it.
fn disc(o: vec2f, at: vec2f, r: f32, front: f32) -> vec3f {
  let re = max(r, 0.7 * px);
  let ro = length(o);
  // Six blades, a little rounded.
  let a = abs(o);
  let hexd = max(a.x * 0.866 + a.y * 0.5, a.y) * 1.04;
  let m = mix(ro, hexd, 0.3 * smoothstep(px * 2.0, px * 6.0, re));
  var cov = clamp((re - m) / px + 0.5, 0.0, 1.0);
  // Cat's eye: the lens barrel clips discs toward the corners.
  let off = (at - centre) * 0.55 * re;
  cov *= clamp((re * 1.04 - length(o + off)) / px + 0.5, 0.0, 1.0);
  if (cov <= 0.0) { return vec3f(0.0); }
  let k = m / re;
  // Brighter rim and faint onion rings from the aspheric element.
  let rim = smoothstep(0.62, 1.0, k);
  let profile = 0.85 + 0.4 * rim + 0.025 * sin(k * 26.0);
  // Longitudinal chromatic aberration fringes the rim.
  let fr = select(vec3f(0.9, 1.06, 0.92), vec3f(1.06, 0.88, 1.08), front > 0.0);
  let tint = mix(vec3f(1.0), fr, rim * smoothstep(px * 3.0, px * 10.0, re));
  // The same energy spread over a larger disc is dimmer, though less than
  // strictly, so the big discs still read.
  return tint * (cov * profile / (3.1416 * pow(max(re, 0.0035), 1.3)));
}

/// One light: its disc, and a soft glow while it is close to focus.
fn light(p: vec2f, at: vec2f, d: f32, e: f32, col: vec3f, size: f32) -> vec3f {
  // A light has a size of its own, so in focus it is a small bright shape.
  let r = max(coc(d), size);
  let o = p - at;
  let sharp = 1.0 - smoothstep(size, size + 0.008, r);
  // In focus the core is small and hot, so it is held back and glows instead.
  var c = disc(o, at, r, d - params.focus) * mix(1.0, 0.3, sharp);
  c += sharp * exp(-length(o) / (0.003 + size * 1.2)) * 14.0;
  return c * col * e;
}

fn building(x: f32) -> f32 {
  let col = floor(x / 0.055);
  let h = hash21(vec2f(col, 3.1));
  let tall = step(0.82, hash21(vec2f(col, 9.7)));
  return SKY_BASE + 0.04 + h * 0.2 + tall * 0.17;
}

fn windowColour(h: f32) -> vec3f {
  if (h < 0.55) { return vec3f(1.0, 0.68, 0.36); }
  if (h < 0.8) { return vec3f(1.0, 0.86, 0.66); }
  if (h < 0.95) { return vec3f(0.72, 0.84, 1.0); }
  return vec3f(0.55, 1.0, 0.8);
}

fn stringY(i: i32, x: f32) -> f32 {
  let e = params.ends[i];
  let s = (x - e.x) / (e.z - e.x);
  return mix(e.y, e.w, s) - params.str[i].x * 4.0 * s * (1.0 - s);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let a = params.aspect;
  px = 1.0 / params.res.y;
  centre = vec2f(a * 0.5, 0.5);
  // Focus breathing: the picture scales a touch as the focus moves.
  let p = centre + (vec2f(uv.x * a, 1.0 - uv.y) - centre) * params.breath;
  let t = params.time;

  // Sky with the city's glow low down, and building silhouettes in front.
  var col = mix(vec3f(0.035, 0.03, 0.05), vec3f(0.006, 0.01, 0.028), smoothstep(SKY_BASE, 1.0, p.y));
  col += vec3f(0.05, 0.03, 0.035) * exp(-(p.y - SKY_BASE) * 9.0) * step(SKY_BASE - 0.05, p.y);
  let rCity = max(coc(D_CITY), px);
  let skyline = (building(p.x - rCity) + building(p.x) * 2.0 + building(p.x + rCity)) * 0.25;
  let mass = smoothstep(skyline + rCity, skyline - rCity, p.y);
  col = mix(col, vec3f(0.01, 0.011, 0.018), mass);

  var light_sum = vec3f(0.0);

  // Lit windows, a sparse hashed grid inside the buildings.
  let cw = vec2f(0.032, 0.034);
  let reach = rCity + 0.02 * (1.0 - smoothstep(0.0, 0.006, rCity));
  if (p.y > SKY_BASE - reach && p.y < SKY_BASE + 0.45 + reach) {
    let base = floor(p / cw);
    let R = i32(ceil(reach / cw.x));
    for (var j = -R; j <= R; j++) {
      for (var i = -R; i <= R; i++) {
        let c = base + vec2f(f32(i), f32(j));
        let h = hash21(c + 17.0);
        if (h > 0.34) { continue; }
        let at = (c + vec2f(0.25 + 0.5 * hash21(c + 3.0), 0.3 + 0.4 * hash21(c + 5.0))) * cw;
        if (at.y < SKY_BASE + 0.01 || at.y > building(at.x) - 0.012) { continue; }
        let o = p - at;
        if (dot(o, o) > (reach + px) * (reach + px)) { continue; }
        light_sum += light(p, at, D_CITY, 0.5 + 0.7 * hash21(c + 8.0), windowColour(hash21(c + 11.0)), 0.0022);
      }
    }
    // Red beacons on the tall towers, blinking slowly.
    let bc = floor(p.x / 0.055);
    for (var i = -2; i <= 2; i++) {
      let col2 = bc + f32(i);
      if (hash21(vec2f(col2, 9.7)) < 0.82) { continue; }
      let at = vec2f((col2 + 0.5) * 0.055, building((col2 + 0.5) * 0.055) + 0.006);
      let blink = 0.5 + 0.5 * sin(t * 2.2 + col2 * 1.7);
      light_sum += light(p, at, D_CITY, 1.6 * blink * blink, vec3f(1.0, 0.12, 0.08), 0.002);
    }
  }

  // The street: sodium lamps, headlights going left, tail lights going right.
  let rS = coc(D_STREET);
  let reachS = rS + 0.02 * (1.0 - smoothstep(0.0, 0.006, rS));
  if (abs(p.y - STREET_Y) < reachS + 0.04) {
    let sp = 0.16;
    let k0 = floor((p.x - reachS) / sp);
    let k1 = floor((p.x + reachS) / sp);
    for (var k = k0; k <= k1; k += 1.0) {
      let at = vec2f((k + 0.5) * sp, STREET_Y + 0.032);
      light_sum += light(p, at, D_STREET, 1.4, vec3f(1.0, 0.55, 0.18), 0.003);
    }
    for (var lane = 0; lane < 2; lane++) {
      let dir = select(1.0, -1.0, lane == 0);
      let v = select(0.05, 0.075, lane == 0);
      let y = STREET_Y + select(0.0, -0.01, lane == 0);
      let csp = 0.09;
      let u = p.x - dir * v * t;
      let c0 = floor((u - reachS - 0.02) / csp);
      let c1 = floor((u + reachS + 0.02) / csp);
      for (var c = c0; c <= c1; c += 1.0) {
        let h = hash21(vec2f(c, f32(lane) + 40.0));
        if (h > 0.55) { continue; }
        let cx = (c + 0.2 + 0.6 * hash21(vec2f(c, f32(lane) + 41.0))) * csp + dir * v * t;
        let tint = select(vec3f(1.0, 0.12, 0.06), vec3f(0.95, 0.95, 1.0), lane == 0);
        let e = select(0.55, 0.9, lane == 0);
        light_sum += light(p, vec2f(cx - 0.006, y), D_STREET, e, tint, 0.0016);
        light_sum += light(p, vec2f(cx + 0.006, y), D_STREET, e, tint, 0.0016);
      }
    }
  }

  // The balcony parapet, close and dark, softened by the same lens.
  let rP = max(coc(D_PARAPET), px);
  let wall = smoothstep(PARAPET_Y + rP, PARAPET_Y - rP, p.y);
  col = mix(col, vec3f(0.006, 0.006, 0.008), wall);
  col += vec3f(0.03, 0.022, 0.015) * exp(-abs(p.y - PARAPET_Y) / max(rP, 0.002)) * 0.5;

  // String lights draped across the balcony.
  for (var s = 0; s < 2; s++) {
    let S = params.str[s];
    let e = params.ends[s];
    let r = coc(S.y);
    let reachB = r + 0.02 * (1.0 - smoothstep(0.0, 0.006, r));
    let sway = 0.006 * sin(t * 0.7 + S.w);
    let wy = stringY(s, p.x) + sway;
    if (abs(p.y - wy) > reachB + 0.03) { continue; }
    let sp = S.z;
    let k0 = max(0.0, floor((p.x - reachB - e.x) / sp));
    let k1 = min(floor((e.z - e.x) / sp), floor((p.x + reachB - e.x) / sp) + 1.0);
    for (var k = k0; k <= k1; k += 1.0) {
      let bx = e.x + k * sp;
      let at = vec2f(bx, stringY(s, bx) + 0.006 * sin(t * 0.7 + S.w + k * 0.3) - 0.009);
      let h = hash21(vec2f(k, f32(s) + 70.0));
      light_sum += light(p, at, S.y, 0.8 + 0.4 * h, mix(vec3f(1.0, 0.6, 0.26), vec3f(1.0, 0.75, 0.45), h), 0.0075 * S.y);
    }
  }

  col += light_sum * 0.024 * params.exposure;
  // Film-like shoulder, keeping hue.
  col = 1.0 - exp(-col * 1.6);
  col = pow(col, vec3f(0.92));
  // Lens vignette.
  let q = uv - 0.5;
  col *= 1.0 - 0.45 * smoothstep(0.25, 0.85, length(q * vec2f(1.0, 1.15)) * 1.2);
  col += (hash21(uv * params.res) - 0.5) / 255.0;
  return vec4f(col, 1.0);
}
