// The picture: the still street from the cached pass, plus everything that
// moves, drawn every frame through the same lens: the traffic and its long
// reflections in the wet road, the signals changing at the crossings, and
// the string lights swaying across the balcony. Then a film-like shoulder
// and the lens's vignette.
import { hash21 } from "../../shaders/common.wgsl";
import { Lens, project, pointLight, rowRange, onRoad, aboveParapet, F, H0, BLOCK, KERB_L, KERB_R, Z_END } from "./scene.wgsl";

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

/// Cars in four lanes: head lights coming, tail lights going.
fn traffic(l: Lens, p: vec2f, mirror: bool) -> vec3f {
  var sum = vec3f(0.0);
  for (var lane = 0; lane < 4; lane++) {
    let coming = lane < 2;
    let x = KERB_L + 2.25 + 4.5 * f32(lane);
    let y0 = select(0.85, 0.7, coming);
    let y = select(y0, -y0, mirror);
    let v = select(11.0, 13.5, coming) + f32(lane % 2) * 2.0;
    let shift = select(1.0, -1.0, coming) * v * l.time;
    let rr = rowRange(l, p, x, y, 0.02);
    let sp = 26.0;
    let n0 = floor((rr.y - shift) / sp) - 1.0;
    let n1 = min(floor((rr.z - shift) / sp), n0 + 12.0);
    for (var n = n0; n <= n1; n += 1.0) {
      let h = hash21(vec2f(n, f32(lane) + 50.0));
      if (h > 0.6) { continue; }
      let z = n * sp + sp * 0.7 * hash21(vec2f(n, f32(lane) + 51.0)) + shift;
      if (z < 9.0 || z > Z_END) { continue; }
      let col = select(vec3f(1.0, 0.1, 0.05), vec3f(1.0, 0.96, 0.88), coming);
      let e = select(0.8, 2.2, coming) * select(1.0, 0.35, mirror) * min(pow(45.0 / z, 1.5), 2.0);
      let stretch = select(1.0, 6.0, mirror);
      let d = 1.0 / z;
      sum += pointLight(l, p, project(l, vec3f(x - 0.75, y, z)), d, e, col, F * 0.12 / z, stretch, 1.0);
      sum += pointLight(l, p, project(l, vec3f(x + 0.75, y, z)), d, e, col, F * 0.12 / z, stretch, 1.0);
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

  var col = textureSampleLevel(still, samp, uv, 0.0).rgb;
  var moving = traffic(l, p, false) + signals(l, p, false);
  if (onRoad(l, p)) {
    moving += traffic(l, p, true) + signals(l, p, true);
  }
  col += moving * aboveParapet(l, p);
  col += bulbs(l, p);

  col *= params.exposure;
  col = 1.0 - exp(-col * 1.6);
  col = pow(col, vec3f(0.92));
  let q = uv - 0.5;
  col *= 1.0 - 0.45 * smoothstep(0.25, 0.85, length(q * vec2f(1.0, 1.15)) * 1.2);
  col += (hash21(uv * params.res) - 0.5) / 255.0;
  return vec4f(col, 1.0);
}
