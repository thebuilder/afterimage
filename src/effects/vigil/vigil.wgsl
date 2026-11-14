// Vigil: one candle burning in a dark room. The flame is a bent, flickering
// teardrop of light; the pointer is moving air, so a pass of the hand makes it
// lean, gutter and smoke, and the light on the wax and the wall follows it.
import { hash21, filmic } from "../../shaders/common.wgsl";

struct Params {
  res: vec2f,
  wick: vec2f,    // top of the wick, centred screen units, y up
  lean: vec2f,    // x: sideways bend, y: stretch (+) or squash (-)
  time: f32,
  flicker: f32,   // how disturbed the flame is
  bright: f32,    // 0 snuffed .. 1 full
  smoke: f32,     // how much smoke is rising
  radius: f32,    // the candle's half width
  floor: f32,     // height of the table top
  warmth: f32,
  _p0: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2f(1.0, 0.0)), u.x), mix(hash21(i + vec2f(0.0, 1.0)), hash21(i + vec2f(1.0, 1.0)), u.x), u.y);
}

/// The flame's emission at p, relative to the wick tip, in screen units.
fn flame(p: vec2f) -> vec3f {
  let H = 0.15 * (1.0 + params.lean.y) * mix(0.35, 1.0, params.bright);
  let y = p.y + 0.012;
  let u = y / H;
  // Bend with the air: the tip goes furthest, and turbulence grows with it.
  let t = params.time;
  let turb = (vnoise(vec2f(u * 3.0 - t * 5.0, t * 1.3)) - 0.5) * (0.004 + 0.04 * params.flicker);
  let x = p.x - params.lean.x * H * pow(clamp(u, 0.0, 1.4), 1.7) - turb * clamp(u, 0.0, 1.0);
  // A teardrop: round at the bottom, drawn to a point at the top.
  let uc = clamp(u, 0.0, 1.0);
  let w = 0.032 * mix(0.75, 1.0, params.bright) * pow(uc, 0.42) * pow(1.0 - uc, 0.75) * 2.2 + 0.0015;
  let q = abs(x) / w;
  let body = exp(-q * q * 1.6) * smoothstep(-0.06, 0.08, u) * (1.0 - smoothstep(0.85, 1.05, u));
  let core = exp(-q * q * 4.5) * smoothstep(0.08, 0.3, u) * (1.0 - smoothstep(0.45, 0.8, u));
  let blue = exp(-q * q * 2.2) * smoothstep(-0.08, 0.02, u) * (1.0 - smoothstep(0.05, 0.22, u));
  var col = vec3f(1.0, 0.42, 0.08) * body * 2.2;
  col += vec3f(1.0, 0.86, 0.55) * core * 3.2;
  col = mix(col, vec3f(0.15, 0.3, 1.0) * 1.1, blue * 0.7);
  return col * params.bright;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = params.res.x / max(params.res.y, 1.0);
  // Narrow screens pull back, so the candle keeps its size against the width.
  let zoom = clamp(aspect, 0.7, 1.0);
  let s = vec2f((uv.x - 0.5) * aspect, 0.5 - uv.y) / zoom;
  let px = 1.0 / max(params.res.y * zoom, 1.0);
  let w = params.wick;
  let R = params.radius;
  let top = w.y - 0.03;
  // The light source sits a little above the wick and moves with the flame.
  let lightPos = w + vec2f(params.lean.x * 0.07, 0.05 * (1.0 + params.lean.y));
  let flick = 0.92 + 0.08 * vnoise(vec2f(params.time * 9.0, 3.0)) + params.flicker * 0.25 * (vnoise(vec2f(params.time * 23.0, 7.0)) - 0.5);
  let L = params.bright * flick;
  let warm = mix(vec3f(1.0, 0.62, 0.32), vec3f(1.0, 0.5, 0.2), params.warmth - 0.5);

  // The wall: near black, lifted by the flame with a soft falloff.
  let d = length(s - lightPos);
  let wallLight = L * (0.09 / (0.02 + d * d * 2.2)) * 0.12;
  let grain = vnoise(s * 180.0) * 0.5 + vnoise(s * 41.0) * 0.5;
  var col = vec3f(0.014, 0.011, 0.01) * (0.9 + 0.2 * grain) + warm * wallLight * (0.85 + 0.15 * grain);

  // The table top, a little lighter and lit along the candle's foot.
  let onTable = 1.0 - smoothstep(params.floor - px, params.floor + px, s.y);
  let tableLight = L * 0.05 / (0.03 + pow(s.x - w.x, 2.0) * 3.0 + pow(s.y - params.floor, 2.0) * 9.0);
  let table = vec3f(0.02, 0.016, 0.013) + warm * tableLight * 0.25 * (0.9 + 0.1 * vnoise(vec2f(s.x * 300.0, s.y * 20.0)));
  // The candle's own shadow falls straight down in front of it, onto the table.
  let shadow = smoothstep(R * 1.1, R * 0.6, abs(s.x - w.x)) * smoothstep(params.floor - 0.12, params.floor, s.y);
  col = mix(col, table * (1.0 - 0.5 * shadow), onTable);

  // The candle: an ivory pillar lit from its own flame above, glowing through
  // the wax near the top, darker toward its edges and its foot.
  let xr = (s.x - w.x) / R;
  let rimY = top - 0.006 * (1.0 - xr * xr);
  // A few runs of melted wax down the side, a little paler and glossier.
  let run = pow(vnoise(vec2f(xr * 7.0 + 4.0, 1.0)), 4.0) * 3.5;
  let drip = smoothstep(0.35, 0.6, run) * smoothstep(top - 0.02 - 0.09 * run, top - 0.01, s.y);
  let inCandle = (1.0 - smoothstep(1.0 - 1.5 * px / R, 1.0, abs(xr))) * (1.0 - smoothstep(rimY - px, rimY + px, s.y)) * step(params.floor, s.y);
  let curve = sqrt(max(1.0 - xr * xr, 0.0));
  let downFromTop = max(top - s.y, 0.0);
  let lit = curve * (0.3 + 0.7 * curve) * L * 0.9 * exp(-downFromTop / 0.16) + curve * L * 0.05;
  let glow = L * exp(-downFromTop / 0.04) * 1.2 * (0.6 + 0.4 * curve);
  let wax = vec3f(0.92, 0.86, 0.74);
  let candle = wax * warm * lit * (0.55 + 0.18 * drip) + vec3f(1.0, 0.55, 0.22) * glow * 0.55 + vec3f(0.01);
  col = mix(col, candle, inCandle);
  // The melt pool across the top, seen just from above: a thin glowing ellipse.
  let pool = length(vec2f(xr, (s.y - top) / (R * 0.16)));
  let inPool = (1.0 - smoothstep(0.95, 1.0, pool)) * step(-0.05, s.y - top + R * 0.16);
  col = mix(col, vec3f(1.0, 0.62, 0.25) * L * (0.55 - 0.25 * pool), inPool * 0.85);

  // The wick: a short dark curl with an ember at its tip.
  let wx = s.x - w.x - params.lean.x * 0.006 * (s.y - top) / 0.03;
  let onWick = (1.0 - smoothstep(0.0022, 0.0022 + px, abs(wx))) * step(top - 0.004, s.y) * step(s.y, w.y);
  col = mix(col, vec3f(0.03, 0.02, 0.015), onWick);
  col += vec3f(1.0, 0.3, 0.05) * exp(-length(s - w) / 0.003) * 0.8 * max(params.bright, 0.25);

  // Smoke: a thin wandering ribbon rising from the wick after a disturbance.
  let sy = s.y - w.y;
  let sway = (vnoise(vec2f(sy * 6.0 - params.time * 0.8, 2.0)) - 0.5) * sy * 0.5 + params.lean.x * sy * 0.4;
  let sd = abs(s.x - w.x - sway) / (0.003 + sy * 0.05);
  let smoke = exp(-sd * sd) * smoothstep(0.02, 0.08, sy) * exp(-sy * 3.5) * params.smoke;
  col += vec3f(0.55, 0.52, 0.5) * smoke * 0.5 * (0.12 + wallLight * 5.0);

  // The flame itself, and the halo it throws in the air.
  col += flame(s - w);
  col += warm * L * 0.035 * exp(-d * 9.0);

  col = filmic(col * 1.15);
  col += (hash21(uv * params.res + fract(params.time) * 17.0) - 0.5) / 255.0;
  return vec4f(col, 1.0);
}
