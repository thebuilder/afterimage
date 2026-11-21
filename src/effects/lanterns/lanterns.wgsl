// Lantern Night: paper sky lanterns rising from a still lake at night. The
// near lanterns are moved on the CPU (they rise, sway, and ride the air the
// pointer stirs); a field of far ones rises from the hills; the lake below
// mirrors all of it, broken into streaks by slow ripples.
import { hash21 } from "../../shaders/common.wgsl";

const MAXL = 44;

struct Params {
  res: vec2f,
  aspect: f32,
  time: f32,
  horizon: f32,
  count: f32,
  glow: f32,
  n: f32,          // how many near lanterns are in use
  lan: array<vec4f, 44>,   // x, y, size, brightness
  aux: array<vec4f, 44>,   // water level under it, flicker phase, -, -
}
@group(0) @binding(0) var<uniform> params: Params;

var<private> PX: f32;

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2f(1.0, 0.0)), u.x), mix(hash21(i + vec2f(0.0, 1.0)), hash21(i + vec2f(1.0, 1.0)), u.x), u.y);
}

const WARM = vec3f(1.0, 0.52, 0.18);
const CORE = vec3f(1.0, 0.82, 0.5);

/// One lantern seen at q (relative to its centre, in units of its size):
/// rgb is its light, a is how much it hides what is behind it.
fn lantern(q: vec2f, s: f32, bright: f32, flick: f32) -> vec4f {
  // A paper bag, wider at the top, open at the bottom where the flame is.
  let y = q.y;
  let w = 0.3 + 0.1 * clamp((y + 0.5) / 1.1, 0.0, 1.0);
  let top = 0.6 - 0.12 * (q.x / w) * (q.x / w);
  let d = max(abs(q.x) - w, max(y - top, -0.5 - y));
  let aa = PX / s;
  let cov = 1.0 - smoothstep(-aa, aa, d);
  // Lit from the flame inside: brightest low down and in the middle.
  let up = clamp((y + 0.5) / 1.1, 0.0, 1.0);
  let side = clamp(abs(q.x) / w, 0.0, 1.0);
  let ribs = 0.9 + 0.1 * cos(q.x / w * 7.0);
  var inside = mix(CORE * 1.15, WARM * 0.75, pow(up, 0.7)) * (1.0 - 0.45 * side * side) * ribs;
  // A darker band at the mouth where the wire ring holds it open.
  inside *= 1.0 - 0.35 * exp(-pow((y + 0.42) / 0.05, 2.0));
  inside *= bright * flick;
  // The flame, seen through the mouth.
  let fl = exp(-dot(q - vec2f(0.0, -0.38), q - vec2f(0.0, -0.38)) * 60.0) * 2.0 * bright * flick;
  // Its halo in the night air.
  let r = length(q - vec2f(0.0, 0.0));
  let halo = (exp(-r * 1.1) * 0.18 + exp(-r * 3.0) * 0.25) * bright * flick;
  return vec4f(inside * cov + CORE * fl + WARM * halo * params.glow, cov);
}

/// The far field: hundreds of tiny lanterns rising from the hills.
fn farField(p: vec2f, H: f32) -> vec3f {
  var c = vec3f(0.0);
  for (var k = 0; k < 3; k++) {
    let fk = f32(k);
    let sc = 70.0 - fk * 22.0;               // cells per unit: far layers are denser
    let speed = 0.008 + fk * 0.007;
    let q = vec2f(p.x * sc + fk * 13.1, (p.y - H) * sc - params.time * speed * sc);
    let cell = floor(q);
    let f = fract(q) - 0.5;
    let h = hash21(cell + fk * 7.3);
    // Fewer the higher up they are, and none below the hills.
    let alt = p.y - H;
    let keep = step(1.0 - 0.16 * params.count * smoothstep(0.7, 0.02, alt), h);
    if (keep > 0.0) {
      let jit = vec2f(hash21(cell + 3.1), hash21(cell + 5.7)) - 0.5;
      let d = length((f - jit * 0.6) * vec2f(1.0, 0.8)) / sc;
      let size = (0.0011 + 0.0012 * fk) * (0.7 + 0.6 * hash21(cell + 9.0));
      let tw = 0.75 + 0.25 * sin(params.time * (2.0 + 3.0 * h) + h * 40.0);
      let fade = smoothstep(0.0, 0.05, alt) * smoothstep(0.85, 0.4, alt);
      let inCell = smoothstep(0.5, 0.3, length(f));
      c += WARM * (smoothstep(size + PX, size - PX, d) * 1.4 + exp(-d / (size * 2.5)) * 0.2 * inCell) * tw * fade;
    }
  }
  return c;
}

fn hills(x: f32, H: f32) -> f32 {
  return H + 0.018 + 0.03 * vnoise(vec2f(x * 2.2, 1.0)) + 0.012 * vnoise(vec2f(x * 9.0, 3.0));
}

fn sky(p: vec2f, H: f32) -> vec3f {
  let alt = clamp((p.y - H) / (1.0 - H), 0.0, 1.0);
  var c = mix(vec3f(0.17, 0.085, 0.09), vec3f(0.035, 0.04, 0.09), pow(alt, 0.55));
  c = mix(c, vec3f(0.012, 0.016, 0.045), smoothstep(0.5, 1.0, alt));
  // Warm haze over the far shore, from all the lanterns.
  c += WARM * 0.06 * exp(-alt * 6.0) * params.glow;
  // A few stars, high up.
  let sq = p * 260.0;
  let sh = hash21(floor(sq));
  let star = step(0.996, sh) * smoothstep(0.3, 0.0, length(fract(sq) - 0.5)) * smoothstep(0.3, 0.7, alt);
  c += vec3f(0.8, 0.85, 1.0) * star * (0.5 + 0.5 * sin(params.time * 2.0 + sh * 90.0));
  c += farField(p, H);
  // The far shore: dark hills with a few town lights.
  let hy = hills(p.x, H);
  let land = smoothstep(hy + PX, hy - PX, p.y) * step(H, p.y);
  let town = step(0.985, hash21(floor(vec2f(p.x * 400.0, p.y * 400.0)))) * smoothstep(H + 0.012, H, p.y);
  c = mix(c, vec3f(0.018, 0.016, 0.03) + vec3f(1.0, 0.7, 0.4) * town * 0.8, land);
  return c;
}

fn nearLanterns(p: vec2f, mirror: bool, rip: f32) -> vec4f {
  var col = vec3f(0.0);
  var hide = 0.0;
  let n = i32(params.n);
  for (var i = 0; i < MAXL; i++) {
    if (i >= n) { break; }
    let L = params.lan[i];
    let A = params.aux[i];
    let s = L.z;
    var c = L.xy;
    var q = p - c;
    if (mirror) {
      // Reflected about the water under the lantern, stretched and shaken.
      c = vec2f(L.x, 2.0 * A.x - L.y);
      q = vec2f(p.x + rip * (A.x - p.y + 0.02) * 2.0 - c.x, (p.y - c.y) / 1.8);
      if (p.y > A.x) { continue; }
    }
    if (abs(q.x) > s * 5.0 || abs(q.y) > s * 5.0) { continue; }
    let flick = 0.88 + 0.12 * sin(params.time * 9.0 + A.y) * sin(params.time * 5.3 + A.y * 2.0);
    let l = lantern(q / s, s, L.w, flick);
    col = col * (1.0 - l.a) + l.rgb;
    hide = max(hide, l.a);
  }
  return vec4f(col, hide);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let a = params.aspect;
  let p = vec2f(uv.x * a, 1.0 - uv.y);
  PX = 1.0 / max(params.res.y, 1.0);
  let H = params.horizon;
  var col: vec3f;

  if (p.y >= H) {
    col = sky(p, H);
  } else {
    // The lake: the sky and lanterns mirrored, broken by slow ripples that
    // grow toward us.
    let depth = (H - p.y) / H;
    let rip = (vnoise(vec2f(p.x * 6.0, p.y * 120.0 / (0.15 + depth) + params.time * 0.6)) - 0.5) * (0.004 + 0.022 * depth);
    let m = vec2f(p.x + rip, 2.0 * H - p.y);
    col = sky(m, H) * 0.42;
    let refl = nearLanterns(p, true, rip);
    col = col * (1.0 - refl.a * 0.6) + refl.rgb * 0.65;
    col = mix(col, vec3f(0.01, 0.012, 0.025), 0.25 + 0.35 * depth);
    // A faint sheen line along the far shore.
    col += WARM * 0.08 * exp(-(H - p.y) * 120.0) * params.glow;
  }
  let near = nearLanterns(p, false, 0.0);
  col = col * (1.0 - near.a) + near.rgb;

  let vg = length(uv - vec2f(0.55, 0.45));
  col *= 1.0 - 0.35 * smoothstep(0.4, 0.95, vg);
  col = col / (1.0 + col * 0.35);
  col = pow(col, vec3f(0.95));
  col += (hash21(uv * params.res + fract(params.time) * 17.0) - 0.5) / 255.0;
  return vec4f(col, 1.0);
}
