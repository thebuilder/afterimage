// Draw the meadow at golden hour: a warm sky with the sun low on the
// horizon, and six rows of grass from hazy distance to dark foreground, every
// blade bent by the wind and by the hand's memory in the spring texture, and
// glowing gold along its edges where the sun shines through.
import { hash21, filmic } from "../../shaders/common.wgsl";
import { LAYERS, row, wind } from "./field.wgsl";

struct View {
  res: vec2f,
  sun: vec2f,
  time: f32,
  aspect: f32,
  gust: f32,     // wind strength
  glow: f32,     // how golden the light is
}
@group(0) @binding(0) var state: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> view: View;

fn pushed(x: f32, l: i32) -> f32 {
  let uv = vec2f(x / view.aspect, (f32(l) + 0.5) / f32(LAYERS));
  return textureSampleLevel(state, samp, uv, 0.0).r;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = view.aspect;
  let s = vec2f(uv.x * aspect, 1.0 - uv.y);
  let px = 1.0 / max(view.res.y, 1.0);
  let t = view.time;
  let sunD = length((s - view.sun) * vec2f(1.0, 1.3));
  let gold = vec3f(1.0, 0.72, 0.36);

  // Sky: deep blue overhead, peach at the horizon, a white-gold sun.
  let hgt = clamp((s.y - 0.3) / 0.7, 0.0, 1.0);
  var col = mix(vec3f(1.0, 0.66, 0.34), vec3f(0.93, 0.56, 0.42), smoothstep(0.0, 0.35, hgt));
  col = mix(col, vec3f(0.3, 0.33, 0.52), smoothstep(0.25, 1.0, hgt));
  col += gold * 0.8 * exp(-sunD * 3.5) * view.glow;
  col += vec3f(1.0, 0.95, 0.85) * smoothstep(0.034, 0.028, sunD) * 1.4;
  col += gold * 0.35 * exp(-sunD * 14.0);

  for (var l = 0; l < LAYERS; l++) {
    let r = row(l);
    let f = f32(l) / 5.0;
    let sp = r.z;
    let cell = floor(s.x / sp);
    // Distant rows dissolve into the haze; near ones are near-black shapes.
    let haze = mix(col, vec3f(1.0, 0.7, 0.42), 0.4);
    let dark = mix(haze * vec3f(0.75, 0.62, 0.5), vec3f(0.03, 0.022, 0.015), 0.3 + 0.7 * pow(f, 0.6));
    var cov = 0.0;
    var edge = 0.0;
    var along = 0.0;
    for (var j = -2; j <= 2; j++) {
      let id = cell + f32(j);
      let k = vec2f(id, f32(l) * 13.1);
      let h1 = hash21(k);
      let h2 = hash21(k + 7.3);
      let h3 = hash21(k + 19.7);
      let root = (id + 0.5 + (h1 - 0.5) * 0.9) * sp;
      let height = r.y * (0.6 + 0.55 * h2);
      let ty = (s.y - r.x) / height;
      if (ty < 0.0 || ty > 1.08) { continue; }
      let bend = wind(root, t, f32(l), view.gust) * (0.6 + 0.7 * h3) + pushed(root, l) + (h1 - 0.5) * 0.35;
      let off = bend * height * 0.55 * ty * ty;
      let slope = 1.1 * bend * ty;
      let d = abs(s.x - root - off) / sqrt(1.0 + slope * slope);
      var w = r.w * (0.8 + 0.5 * h2) * (1.0 - 0.88 * min(ty, 1.0));
      // About a third of the stems carry a seed head.
      // About a third of the stems carry a slim seed head, like wild oats.
      if (h3 > 0.66) {
        let q = (ty - 0.93) / 0.11;
        w = max(w, r.w * 0.75 * sqrt(max(1.0 - q * q, 0.0)));
      }
      let top = select(1.0, 1.04, h3 > 0.66);
      let c = (1.0 - smoothstep(w - px * 0.7, w + px * 0.7, d)) * step(ty, top);
      if (c > cov) {
        cov = c;
        edge = clamp(d / max(w, 1e-5), 0.0, 1.0);
        along = ty;
      }
    }
    // The soil line under each row, so no sky shows between the stems' roots.
    let base = 1.0 - smoothstep(r.x - 0.004, r.x + 0.012 + 0.01 * hash21(vec2f(floor(s.x / sp), f32(l))), s.y);
    // Backlight: the sun shines through blade edges and tips, strongest near it.
    let through = (exp(-sunD * mix(4.0, 2.2, f)) * 1.4 + 0.18) * view.glow;
    let blade = dark + gold * through * (0.1 + 0.9 * along) * (0.06 + 1.2 * edge * edge * edge) * mix(0.6, 1.7, f);
    col = mix(col, dark, base);
    col = mix(col, blade, cov);
  }

  // Pollen and seed fluff drifting in the light.
  let g = s / 0.07 + vec2f(-t * 0.15 * view.gust, sin(t * 0.3) * 0.2);
  let gi = floor(g);
  let gh = hash21(gi);
  let gp = vec2f(hash21(gi + 3.1), hash21(gi + 8.7)) * 0.8 + 0.1 + 0.08 * vec2f(sin(t * 0.7 + gh * 6.0), cos(t * 0.5 + gh * 5.0));
  let mote = exp(-length(fract(g) - gp) * 0.07 / (px * 1.6)) * step(0.72, gh) * smoothstep(0.15, 0.35, s.y) * (1.0 - smoothstep(0.5, 0.75, s.y));
  col += gold * mote * (0.15 + 1.2 * exp(-sunD * 2.0)) * view.glow;

  col = filmic(col * 1.05);
  col += (hash21(uv * view.res + fract(t) * 17.0) - 0.5) / 255.0;
  return vec4f(col, 1.0);
}
