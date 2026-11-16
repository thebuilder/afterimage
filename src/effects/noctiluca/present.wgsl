// The night shore from a few steps up the beach: stars over a dark sea,
// breakers rolling in, and blue light from the plankton wherever the water is
// disturbed. Breaking waves are drawn as faces standing up off the sea, with
// a glowing lip that spills whitewater down the face as the wave collapses.
// Glow on the surface comes from the sim as a smooth field; the picture turns
// all of it into a haze plus single sparks, so it reads as living points.
import { hash21, filmic } from "../../shaders/common.wgsl";
import { WAVES, SHORE, ARRIVE, ground, toScreen, wander, shoreS, edge, wave, cycle } from "./shore.wgsl";

struct View {
  res: vec2f,
  time: f32,
  aspect: f32,
  horizon: f32,
  surf: f32,
  glow: f32,
}
@group(0) @binding(0) var state: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> view: View;

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2f(1.0, 0.0)), w.x),
             mix(hash21(i + vec2f(0.0, 1.0)), hash21(i + vec2f(1.0, 1.0)), w.x), w.y);
}

/// Points of light: each cell of a fine grid holds one plankton that lights
/// once the glow there passes its own threshold, and twinkles. Each layer's
/// grid is turned, so no rows or columns line up.
fn sparks(p: vec2f, g: f32, t: f32, cellPx: f32, seed: f32, ang: f32) -> f32 {
  let r = mat2x2f(cos(ang), sin(ang), -sin(ang), cos(ang));
  let q = r * p * view.res.y / cellPx;
  let c = floor(q);
  let h = hash21(c + seed);
  let h2 = hash21(c + seed + 17.3);
  let jit = fract(vec2f(h, h2) * 7.31) * 0.7 + 0.15;
  let d = length(fract(q) - jit);
  let lit = smoothstep(h * 0.9 + 0.08, h * 0.9 + 0.5, g);
  let tw = 0.55 + 0.45 * sin(t * (5.0 + 9.0 * h2) + h * 40.0);
  return lit * tw * exp(-d * d * 30.0) * 1.4;
}

fn glowAt(p: vec2f) -> vec4f {
  return textureSampleLevel(state, samp, vec2f(p.x / view.aspect, 1.0 - p.y), 0.0);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = view.aspect;
  let p = vec2f(uv.x * aspect, 1.0 - uv.y);
  let px = 1.0 / max(view.res.y, 1.0);
  let t = view.time;
  let hz = view.horizon;
  let blue = vec3f(0.06, 0.62, 1.0);
  let cyan = vec3f(0.35, 0.95, 1.0);

  // Sky: near-black overhead, a faint cool band at the horizon, stars.
  let above = p.y - hz;
  var col = mix(vec3f(0.035, 0.05, 0.085), vec3f(0.006, 0.01, 0.022), smoothstep(0.0, 0.35, above));
  let sq = p * view.res.y / 2.5;
  let sh = hash21(floor(sq));
  let sd = length(fract(sq) - 0.5);
  let star = smoothstep(0.985, 1.0, sh) * exp(-sd * sd * 18.0) * (0.6 + 0.4 * sin(t * (1.0 + 3.0 * hash21(floor(sq) + 3.1)) + sh * 50.0));
  col += vec3f(0.75, 0.8, 1.0) * star * smoothstep(0.01, 0.12, above) * 0.8;

  var gl = 0.0;
  var lift = 0.0; // how much of the glow belongs to a wave face, not the surface

  let g0 = ground(p, hz, aspect);
  if (g0.z > 0.5) {
    let x = g0.x;
    let z = g0.y;
    let u = x;
    let s = shoreS(x, z);
    let st = glowAt(p);
    let e = edge(u, t, view.surf);
    let depth = s - e;
    // Antialias the waterline over a pixel's footprint on the ground.
    let fp = px * z * z;
    let water = smoothstep(-1.5 * fp, 1.5 * fp, depth);
    let near = smoothstep(16.0, 3.0, z);
    let fog = smoothstep(5.0, 30.0, z);

    // Sand: cool dark grain under starlight, darker and glossy where wet.
    let grain = hash21(floor(p * view.res.y * 0.8)) - 0.5;
    let ribs = 0.5 + 0.5 * sin(z * 9.0 + x * 0.6 + vnoise(vec2f(x, z) * 1.3) * 5.0);
    let ripples = mix(0.5, ribs, 0.7 * near);
    var sand = vec3f(0.06, 0.058, 0.062) * (1.0 + grain * 0.3 + (ripples - 0.5) * 0.5);
    sand += vec3f(0.01, 0.014, 0.022) * smoothstep(1.5, 4.0, z);
    let wetness = smoothstep(0.05, 0.7, st.g);
    // Wet sand mirrors the sky's horizon band and whatever glows in the
    // water just beyond it.
    let ze = SHORE - wander(u) + e;
    let ye = toScreen(x, ze, 0.0, hz, aspect).y;
    let mirror = glowAt(vec2f(p.x, 2.0 * ye - p.y));
    var wet = vec3f(0.018, 0.024, 0.036) * (0.85 + 0.3 * ripples) + vec3f(0.02, 0.03, 0.05) * smoothstep(1.5, 4.0, z);
    wet += blue * (mirror.r + mirror.b) * 0.07 * view.glow * smoothstep(0.0, 0.08, ye - p.y + 0.02);
    var ground_col = mix(sand, wet, wetness);

    // Sea: black-blue, a film over the sand in the swash, a fine chop that
    // catches the sky, and the horizon band reflected far out.
    let deepness = smoothstep(0.0, 1.5, depth);
    var sea = mix(wet * 0.9, vec3f(0.01, 0.018, 0.034), deepness);
    let chop = vnoise(vec2f(x * 1.4 + t * 0.1, z * 3.0 - t * 0.5)) * 0.6 + vnoise(vec2f(x * 4.0 - t * 0.2, z * 8.0 + t * 0.9)) * 0.4;
    sea += vec3f(0.02, 0.03, 0.05) * (chop - 0.45) * near;
    sea = mix(sea, vec3f(0.035, 0.05, 0.085), fog);

    // Foam lace and a moonless sheen behind breakers and along the swash.
    let lace = abs(vnoise(vec2f(x * 2.2, z * 3.5) + vec2f(t * 0.05, 0.0) + vnoise(vec2f(x, z) * 0.7) * 2.0) - 0.5);
    let laceLine = smoothstep(0.08, 0.0, lace) * near;
    var foam = 0.0;
    for (var i = 0; i < WAVES; i++) {
      let f = wave(i, u, t, view.surf);
      let back = s - f.x;
      foam += f.y * laceLine * smoothstep(-0.05, 0.1, back) * exp(-max(back, 0.0) / (0.6 + 0.2 * max(f.x, 0.0)));
      foam += f.y * exp(-back * back / 0.004) * 0.8;
    }
    sea += vec3f(0.12, 0.15, 0.2) * min(foam, 1.0) * 0.4;
    ground_col = mix(ground_col, sea, water);
    col = ground_col;
    gl = (st.r + st.b) * (1.0 - fog * 0.7);
  }

  // Wave faces standing up off the sea, nearest last so it covers the rest.
  // A pixel's crest is found by guessing its u from where the pixel's ray
  // would meet the sea, then correcting it twice against the crest itself.
  var faceZ = 1e9;
  for (var i = 0; i < WAVES; i++) {
    var u = (p.x - 0.5 * aspect) * clamp(g0.y, 0.5, 60.0);
    var f = wave(i, u, t, view.surf);
    var zc = SHORE + f.x - wander(u);
    for (var k = 0; k < 2; k++) {
      u = (p.x - 0.5 * aspect) * zc;
      f = wave(i, u, t, view.surf);
      zc = SHORE + f.x - wander(u);
    }
    if (f.z < 0.002 || zc > faceZ) { continue; }
    let hgt = f.z;
    let len = 0.12 + 1.1 * hgt;
    let top = toScreen(u, zc, hgt, hz, aspect).y;
    let bot = toScreen(u, zc - len, 0.0, hz, aspect).y;
    // The back of the wave, seen just over the lip, is a slope down to the sea.
    let rear = toScreen(u, zc + len * 1.6, 0.0, hz, aspect).y;
    if (p.y > top || p.y < bot) {
      // Just over the lip: the back slope hides what is behind it.
      if (p.y > top && p.y < rear && rear > top) {
        let vb = (p.y - top) / (rear - top);
        let hide = (1.0 - smoothstep(0.0, 1.0, vb)) * smoothstep(0.004, 0.06, f.z) * (1.0 - smoothstep(8.0, 20.0, zc));
        col = mix(col, vec3f(0.012, 0.022, 0.04), hide);
        gl *= 1.0 - hide;
      }
      continue;
    }
    faceZ = zc;
    let v = (top - p.y) / max(top - bot, 1e-5); // 0 at the lip, 1 at the base
    let lineW = max(px / max(top - bot, 1e-5), 0.02);
    // Dark water, a little lighter toward the lip where it is thin.
    var face = mix(vec3f(0.03, 0.055, 0.09), vec3f(0.006, 0.012, 0.026), smoothstep(0.0, 0.6, v));
    let brk = f.y;
    let froth = vnoise(vec2f(u * 1.8, t * 0.6)) * 0.6 + vnoise(vec2f(u * 4.0, t * 0.9)) * 0.4;
    // Whitewater pours down the face as the wave breaks.
    let spill = smoothstep(0.0, 1.0, brk) * (0.35 + 0.65 * froth);
    let pour = smoothstep(spill + 0.25, spill - 0.15, v) * brk;
    let lip = exp(-v * v / (lineW * lineW * 6.0 + 0.0004));
    face += vec3f(0.1, 0.13, 0.18) * pour * 0.35;
    face = mix(face, vec3f(0.08, 0.1, 0.14), lip * 0.5);
    // A collapsing wave fades out as its face shrinks, never leaving a sliver.
    let stand = smoothstep(0.01, 0.12, hgt);
    col = mix(col, face, stand);
    // Toward its base the face hands over to the glowing water in front of
    // it, so the wave stands out of the surf rather than being cut from it.
    let base = smoothstep(0.55, 1.0, v);
    let surface = gl;
    gl = (lip * (0.25 + 1.8 * brk) + pour * 1.3 * (0.4 + 0.6 * froth)) * (1.0 - smoothstep(10.0, 30.0, zc));
    gl = mix(gl, max(gl, surface), base);
    gl = mix(surface, gl, stand);
    lift = 1.0;
  }

  // The plankton: a soft haze plus sparks.
  let haze = pow(gl, 1.3) * (0.12 + 0.06 * lift);
  let sp = sparks(p, gl, t, 3.4, 0.0, 0.61) + 0.8 * sparks(p, gl * 0.8, t, 5.3, 7.0, -0.93);
  col += blue * haze * view.glow;
  col += mix(blue, cyan, 0.5) * sp * min(gl + 0.2, 1.8) * 1.6 * view.glow;
  col += vec3f(0.6, 1.0, 1.0) * smoothstep(1.0, 2.6, gl) * 0.3 * view.glow;

  let vig = length(uv - 0.5);
  col *= 1.0 - 0.35 * vig * vig;
  col = filmic(col * 1.4);
  col += (hash21(uv * view.res + t) - 0.5) / 255.0;
  return vec4f(col, 1.0);
}
