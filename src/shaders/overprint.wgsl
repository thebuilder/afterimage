// Overprint: a three-ink risograph poster that never finishes printing. Each
// ink is its own halftone screen at its own angle, the plates drift out of
// register with the pointer, and a loupe follows the cursor so the dots read up close.
import { simplex2d } from "@vgpu/wgsl-std/noise/simplex";
import { hash21, rot2 } from "./common.wgsl";

struct Params {
  res: vec2f,
  mouse: vec2f,
  time: f32,
  screen: f32,
  slip: f32,
  gain: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

const TAU: f32 = 6.2831853;
const PAPER = vec3f(0.962, 0.941, 0.898);
// Riso inks are translucent, so each one is a transmittance the paper is multiplied by.
const PINK = vec3f(0.99, 0.33, 0.56);
const BLUE = vec3f(0.13, 0.47, 0.84);
const YELLOW = vec3f(1.00, 0.86, 0.16);

/// The artwork, already separated: x pink, y blue, z yellow, each a 0..1 tone.
fn scene(p: vec2f, t: f32, m: vec2f) -> vec3f {
  var pink = 0.05 + 0.24 * smoothstep(0.55, -0.15, p.y);
  var blue = 0.04 * smoothstep(0.1, 0.5, p.y);
  var yellow = 0.10 * smoothstep(0.35, -0.15, p.y);

  // Sun: solid yellow, flushed pink toward its lower edge.
  let c = vec2f(0.20 + 0.03 * sin(t * 0.11), 0.07 + 0.02 * sin(t * 0.17));
  let sr = 0.27;
  let sun = 1.0 - smoothstep(sr - 0.003, sr + 0.003, length(p - c));
  yellow += sun * 0.88;
  pink += sun * mix(0.0, 0.62, smoothstep(c.y + sr, c.y - sr * 0.8, p.y));

  // A blue disc orbits the sun and leans toward the pointer. Where it crosses
  // the sun, blue over yellow and pink makes the colours the print never had.
  let orbit = c + rot2(t * 0.09) * vec2f(0.33, 0.0) * vec2f(1.0, 0.6);
  let oc = mix(orbit, m, 0.22);
  let disc = 1.0 - smoothstep(0.155, 0.161, length(p - oc));
  blue += disc * 0.5;

  // Sea: wave bands that get denser toward the viewer.
  let hz = -0.17;
  let below = hz - p.y;
  if (below > 0.0) {
    let depth = clamp(below / 0.35, 0.0, 1.0);
    // Ripple rings around the pointer, squashed for perspective.
    let dm = length((p - m) * vec2f(1.0, 3.2));
    let ring = sin(dm * 70.0 - t * 4.0) * exp(-dm * 6.0) * 0.6;
    let k = below * 1.4 + 0.02;
    let phase = log(k) * 9.0 + sin(p.x * 4.0 + t * 0.7 + below * 9.0) * 0.6 + ring - t * 0.35;
    let band = 0.5 + 0.5 * sin(phase * TAU * 0.5);
    blue = 0.26 + 0.5 * depth + 0.3 * band;
    pink = 0.10 + 0.12 * (1.0 - depth) + 0.10 * band;
    yellow = 0.0;
    // Glitter under the sun, broken up by the same bands.
    let gx = (p.x - c.x) / (0.09 + below * 0.5);
    let glint = exp(-gx * gx) * (1.0 - depth * 0.7);
    yellow += glint * smoothstep(0.35, 0.85, band) * 0.95;
    pink += glint * band * 0.25;
    blue -= glint * smoothstep(0.35, 0.85, band) * 0.45;
  }

  // Nothing on a real print is flat: tones wander a little everywhere.
  let n = vec3f(
    simplex2d(p * 2.1 + vec2f(t * 0.04, 1.7)),
    simplex2d(p * 1.7 - vec2f(3.1, t * 0.05)),
    simplex2d(p * 2.6 + vec2f(5.3, t * 0.03)),
  );
  return clamp(vec3f(pink, blue, yellow) + n * 0.05, vec3f(0.0), vec3f(1.0));
}

/// Ink coverage of one plate. A cosine spot is a round dot at low tone, a
/// checkerboard at half and a round hole near solid, with no cell seams anywhere.
fn plate(q: vec2f, tone: f32, angle: f32, cells: f32, seed: f32) -> f32 {
  let g = rot2(angle) * q * cells;
  let s = 0.5 + 0.25 * (cos(TAU * g.x) + cos(TAU * g.y));
  // Rough dot edges: ink catches on the paper fibre.
  let rough = simplex2d(q * 260.0 + seed) * 0.07 * smoothstep(0.0, 0.2, tone);
  let e = s - (1.0 - tone) + rough;
  let aa = max(fwidth(s), 1e-4) * 0.8;
  let cov = smoothstep(-aa, aa, e);
  // Drum starvation: big soft patches where the plate laid down less ink, plus fine grain.
  let starve = 0.86 + 0.14 * simplex2d(q * 1.3 + seed * 7.0);
  let grain = 0.88 + 0.12 * simplex2d(q * 140.0 - seed * 3.0);
  return cov * starve * grain;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = params.res.x / max(params.res.y, 1.0);
  let p = vec2f((uv.x - 0.5) * aspect, 0.5 - uv.y);
  let m = vec2f((params.mouse.x - 0.5) * aspect, 0.5 - params.mouse.y);
  let t = params.time;

  // Loupe: inside, the print is read through a 3x glass.
  let R = 0.19;
  let d = length(p - m);
  let inside = smoothstep(R, R * 0.94, d);
  let zoom = mix(1.0, 3.2, inside);
  let pp = m + (p - m) / zoom;

  // Each plate sits at its own slight offset, and parallaxes against the
  // pointer by its own depth, as if three sheets were stacked loosely.
  let reg = params.slip;
  let wob = vec2f(sin(t * 0.37), cos(t * 0.29)) * 0.0015;
  let offP = (vec2f(0.0045, -0.0025) + m * 0.020 + wob) * reg;
  let offB = (vec2f(-0.0035, 0.0030) - m * 0.014 - wob.yx) * reg;
  let offY = (vec2f(0.0020, 0.0040) + m * 0.008) * reg;

  let cells = 92.0 * params.screen;
  let g = params.gain;
  let tp = pow(scene(pp - offP, t, m).x, 1.0 / g);
  let tb = pow(scene(pp - offB, t, m).y, 1.0 / g);
  let ty = pow(scene(pp - offY, t, m).z, 1.0 / g);

  let cp = plate(pp - offP, tp, 1.309, cells, 1.0); // 75°
  let cb = plate(pp - offB, tb, 0.262, cells, 2.0); // 15°
  let cy = plate(pp - offY, ty, 0.785, cells * 0.9, 3.0); // 45°, a coarser screen

  // Paper with a little tooth, then each ink multiplied over it in press order.
  let fibre = simplex2d(pp * vec2f(30.0, 180.0)) * 0.012 + (hash21(floor(uv * params.res)) - 0.5) * 0.02;
  var col = PAPER * (1.0 + fibre);
  col *= mix(vec3f(1.0), YELLOW, cy);
  col *= mix(vec3f(1.0), PINK, cp);
  col *= mix(vec3f(1.0), BLUE, cb);

  // The glass: a soft cast shadow just outside it and a thin bright rim.
  let shadow = smoothstep(R + 0.05, R, d) * (1.0 - inside);
  col *= 1.0 - 0.16 * shadow;
  let rx = (d - R * 0.965) / 0.004;
  let rim = exp(-rx * rx);
  col = mix(col, vec3f(1.0), rim * 0.35);

  return vec4f(col, 1.0);
}
