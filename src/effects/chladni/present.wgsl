// Draw the plate: blued steel on a dark bench, clamped at its centre by one
// bolt, with white sand lying where the plate is still and dancing where it
// moves.
import { hash21 } from "../../shaders/common.wgsl";
import { simplex2d } from "@vgpu/wgsl-std/noise/simplex";
import { plateMode } from "./mode.wgsl";

struct View {
  mode: vec4f, // n, m, sign, how close to resonance
  res: vec2f,
  time: f32,
  sand: f32,
  bow: f32,
  _p0: f32,
  _p1: f32,
  _p2: f32,
}
@group(0) @binding(0) var state: texture_2d<f32>;
@group(0) @binding(1) var<uniform> view: View;

const SAND = vec3f(0.95, 0.92, 0.86);
const STEEL = vec3f(0.062, 0.067, 0.078);
// Light from a softbox up and to the left of the plate.
const LIGHT = vec3f(-0.45, 0.55, 0.7);

/// Where the plate sits: centre and half the side, in screen units of height 1.
fn plateLayout(aspect: f32) -> vec3f {
  let wide = smoothstep(0.9, 1.3, aspect);
  let r = min(0.39, aspect * 0.43);
  let cx = wide * min(0.2 * aspect, 0.5 * aspect - r - 0.07);
  let cy = mix(0.1, 0.015, wide);
  return vec3f(cx, cy, r);
}

fn box(q: vec2f, b: f32, rc: f32) -> f32 {
  let d = abs(q) - vec2f(b - rc);
  return length(max(d, vec2f(0.0))) + min(max(d.x, d.y), 0.0) - rc;
}

fn rot(a: f32) -> mat2x2f {
  return mat2x2f(cos(a), sin(a), -sin(a), cos(a));
}

/// One layer of grains at g (in grain cells): coverage of a grain here, and its shade.
fn grains(g: vec2f, cov: f32, shake: f32, gpx: f32, seed: f32) -> vec2f {
  let gc = floor(g) + seed * 31.0;
  let hop = select(0.0, floor(view.time * 26.0 + hash21(gc) * 9.0), shake > 0.06);
  let gh = hash21(gc + hop * 1.37);
  let size = 0.17 + 0.15 * hash21(gc + 1.9);
  let off = (vec2f(hash21(gc + 3.1), hash21(gc + 8.7)) - 0.5) * (1.0 - 2.0 * size);
  let d = length(fract(g) - 0.5 - off);
  let aa = 0.75 / gpx;
  let on = smoothstep(size + aa, size - aa, d) * step(gh, cov * 0.7);
  return vec2f(on, 0.72 + 0.45 * hash21(gc + 5.5));
}

/// Sand at u, filtered by hand: full floats cannot go through a sampler.
fn sandAt(u: vec2f) -> f32 {
  let n = vec2i(textureDimensions(state));
  let x = u * vec2f(n) - 0.5;
  let i = vec2i(floor(x));
  let f = x - floor(x);
  let a = textureLoad(state, clamp(i, vec2i(0), n - 1), 0).r;
  let b = textureLoad(state, clamp(i + vec2i(1, 0), vec2i(0), n - 1), 0).r;
  let c = textureLoad(state, clamp(i + vec2i(0, 1), vec2i(0), n - 1), 0).r;
  let d = textureLoad(state, clamp(i + vec2i(1, 1), vec2i(0), n - 1), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = view.res.x / max(view.res.y, 1.0);
  let p = vec2f((uv.x - 0.5) * aspect, 0.5 - uv.y);
  let lay = plateLayout(aspect);
  let R = lay.z;
  let q = (p - lay.xy) / R;
  let px = 1.0 / (view.res.y * R);

  // The bench: near black, a little warmer where the softbox spills on it.
  var col = vec3f(0.022, 0.022, 0.025) + vec3f(0.03, 0.028, 0.026) * exp(-dot(p - lay.xy - vec2f(-0.2, 0.25), p - lay.xy - vec2f(-0.2, 0.25)) / 0.5);
  // The plate's soft shadow falls down and to the right.
  let sh = box(q - vec2f(0.035, -0.06), 1.0, 0.03);
  col *= 1.0 - 0.75 * smoothstep(0.12, -0.05, sh);

  let d = box(q, 1.0, 0.012);
  let inside = smoothstep(px, -px, d);
  if (inside > 0.0) {
    let u = vec2f(q.x, -q.y) * 0.5 + 0.5;
    let wave = plateMode(u, view.mode.xyz).x * 0.5;
    let shake = clamp(view.bow * view.mode.w, 0.0, 1.5) * abs(wave);

    // Blued, bead-blasted steel: a soft gradient from the softbox, a fine tooth.
    let grad = smoothstep(1.6, -1.2, q.x - q.y);
    let tooth = 0.9 + 0.1 * hash21(floor(q / px)) + 0.04 * simplex2d(q * 6.0);
    var plate = STEEL * (0.7 + 0.7 * grad) * tooth;
    // The softbox itself, a broad soft window caught in the steel.
    let win = smoothstep(0.9, 0.2, abs(q.x + q.y * 0.6 + 0.35)) * smoothstep(1.4, 0.3, length(q - vec2f(-0.4, 0.5)));
    plate += vec3f(0.05, 0.055, 0.065) * win;
    // A machined bevel: bright along the lit edges, dark along the far ones.
    let rim = smoothstep(-8.0 * px, -1.5 * px, d);
    let lit = clamp(0.5 + 0.5 * dot(normalize(q + vec2f(1e-4)), normalize(LIGHT.xy)), 0.0, 1.0);
    plate += vec3f(0.42, 0.44, 0.48) * rim * lit * lit * 0.6;
    plate *= 1.0 - 0.5 * rim * (1.0 - lit);

    // The sand, and the shadow its heaps throw toward the bottom right.
    let rho = sandAt(u) * view.sand;
    let back = sandAt(u + vec2f(-LIGHT.x, LIGHT.y) * 0.004) * view.sand;
    plate *= 1.0 - 0.45 * smoothstep(1.5, 7.0, back) * (1.0 - smoothstep(1.5, 7.0, rho));

    // Grains: two scattered layers, each on a tilted grid in the plate's own
    // space, every grain a little round stone of its own size and shade. On
    // the still lines they lie put; on the moving parts they hop and flicker.
    let gpx = 3.4;
    let gscale = 2.0 * R * view.res.y / gpx;
    let cov = 1.0 - exp(-rho * 0.3);
    let g1 = grains(rot(0.46) * u * gscale, cov, shake, gpx, 0.0);
    let g2 = grains(rot(-0.71) * u * gscale * 1.13 + 0.37, cov, shake, gpx, 7.0);
    let grain = max(g1.x, g2.x);
    let gc = floor(rot(0.46) * u * gscale);
    // Where sand piles thick it closes into a solid ridge, lit like a heap,
    // with a ragged edge where single grains stand proud of it.
    let tone = mix(0.82, select(g2.y, g1.y, g1.x >= g2.x), grain);
    let solid = smoothstep(4.0, 11.0, rho * (0.75 + 0.5 * hash21(gc + 2.3)));
    let e = 1.5 / 512.0;
    let dx = sandAt(u + vec2f(e, 0.0)) - sandAt(u - vec2f(e, 0.0));
    let dy = sandAt(u - vec2f(0.0, e)) - sandAt(u + vec2f(0.0, e));
    let n = normalize(vec3f(-dx * 0.04, -dy * 0.04, 1.0));
    let shade = 0.68 + 0.5 * max(dot(n, normalize(LIGHT)), 0.0);
    let mask = max(grain, solid);
    let sand = SAND * tone * mix(1.0, shade, solid) * (1.0 - 0.12 * solid * (1.0 - grain));
    plate = mix(plate, sand, mask);

    // The bolt that clamps the plate at its centre.
    let bq = q / 0.06;
    let ang = atan2(bq.y, bq.x);
    let hexr = cos(0.5235988) / cos(((ang + 0.5235988 + 6.2831853) % 1.0471976) - 0.5235988);
    let br = length(bq);
    let nut = smoothstep(hexr + 0.06, hexr - 0.02, br);
    var bolt = vec3f(0.16, 0.165, 0.17) * (0.6 + 0.6 * clamp(dot(normalize(bq + vec2f(1e-4)), normalize(LIGHT.xy)), 0.0, 1.0) * smoothstep(0.4, hexr, br));
    bolt = mix(bolt, vec3f(0.22, 0.225, 0.23) * (0.8 + 0.3 * (bq.x * -0.45 + bq.y * 0.55)), smoothstep(0.52, 0.46, br));
    let ring = 1.0 - 0.6 * smoothstep(hexr + 0.3, hexr, br) * smoothstep(hexr - 0.05, hexr + 0.1, br);
    plate = mix(plate * ring, bolt, nut);

    col = mix(col, plate, inside);
  }

  col *= 1.0 - 0.3 * dot(uv - 0.5, uv - 0.5);
  col += (hash21(uv * view.res) - 0.5) / 255.0;
  return vec4f(pow(max(col, vec3f(0.0)), vec3f(0.92)), 1.0);
}
