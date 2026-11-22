// The marbling itself. Every drop of paint and every pull of the stylus or
// comb is an exact map of the tray onto itself, so instead of moving paint
// around a grid, each pixel walks the list of moves backwards to find where
// its paint came from: inside a drop it takes that drop's colour, otherwise
// it keeps going, and past the oldest move it reads the tray as it was baked.
// The local stretch of the map is carried along, which gives each edge an
// exact antialiased width however thin the combing has drawn it.
import { ground, paint, tnoise } from "./tray.wgsl";


struct Params {
  res: vec2f,        // the target being drawn
  aspect: f32,
  n: f32,            // how many moves to replay
  baseAspect: f32,   // the baked tray's width in tray heights
  fresh: f32,        // 1 while nothing is baked yet
  baseTexel: f32,    // one baked texel, in tray heights
  _p0: f32,
  // Per move. Drop: a = centre, radius, paint; b.x = grain seed.
  // Stroke: a = from, to; b = carry, width. Comb: a = origin, direction;
  // b = shift, tine spacing, tine sharpness; c = front, ramp, tine phase.
  // b.w is the kind: 0 drop, 1 stroke, 2 comb.
  a: array<vec4f, 40>,
  b: array<vec4f, 40>,
  c: array<vec4f, 40>,
}
@group(0) @binding(0) var base: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> params: Params;

/// smoothstep and its derivative.
fn sstep(e0: f32, e1: f32, x: f32) -> vec2f {
  let k = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
  let inside = select(0.0, 1.0, x > e0 && x < e1);
  return vec2f(k * k * (3.0 - 2.0 * k), inside * 6.0 * k * (1.0 - k) / (e1 - e0));
}

/// The Jacobian of p -> p - u * f(p), given the gradient of f.
fn shear(u: vec2f, grad: vec2f) -> mat2x2f {
  return mat2x2f(vec2f(1.0, 0.0) - u * grad.x, vec2f(0.0, 1.0) - u * grad.y);
}

fn baked(p: vec2f) -> vec3f {
  let uv = vec2f(p.x / params.baseAspect, 1.0 - p.y);
  return textureSampleLevel(base, samp, uv, 0.0).rgb;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var p = vec2f(uv.x * params.aspect, 1.0 - uv.y);
  let px = 1.0 / params.res.y;
  // How far one pixel step moves the point being traced, in tray heights.
  var J = mat2x2f(px, 0.0, 0.0, -px);
  var col = vec3f(0.0);
  var w = 1.0;

  let n = i32(params.n);
  for (var i = n - 1; i >= 0; i--) {
    let A = params.a[i];
    let B = params.b[i];
    if (B.w < 0.5) {
      // A drop pushes everything outward and keeps area: x -> c + v sqrt(1 + r²/|v|²).
      let c = A.xy;
      let r = A.z;
      if (r < 1e-5) { continue; }
      let v = p - c;
      let d = length(v);
      let vh = v / max(d, 1e-7);
      let L = max(length(transpose(J) * vh), 1e-7);
      let cov = clamp(0.5 + (r - d) / L, 0.0, 1.0);
      if (cov > 0.0) {
        // Pigment grain in the drop's own space, so combing streaks it.
        let loc = v / r;
        let fine = clamp(1.6 - L * 18.0 / r, 0.0, 1.0);
        let g = (tnoise(loc * 9.0 + B.x) - 0.5) * 0.14 * fine + (tnoise(loc * 2.2 + B.x * 1.7) - 0.5) * 0.1;
        col += w * cov * paint(A.w) * (1.0 + g);
        w *= 1.0 - cov;
        if (w < 0.004) { break; }
      }
      let dd = max(d, r * 1.0005);
      let r2 = r * r;
      let s = sqrt(max(1.0 - r2 / (dd * dd), 1e-8));
      let vv = vh * dd;
      p = c + vv * s;
      let k = r2 / (s * dd * dd * dd * dd);
      J = mat2x2f(s + k * vv.x * vv.x, k * vv.x * vv.y, k * vv.x * vv.y, s + k * vv.y * vv.y) * J;
    } else if (B.w < 1.5) {
      // A stylus stroke carries the paint near its line along with it.
      let a0 = A.xy;
      let ab = A.zw - A.xy;
      let len = length(ab);
      if (len < 1e-5) { continue; }
      let u = ab / len;
      let nrm = vec2f(-u.y, u.x);
      let q = p - a0;
      let t = dot(q, u);
      let sd = dot(q, nrm);
      let lam = B.y;
      let endW = 2.0 * len + 2.0 * lam;
      if (abs(sd) > lam * 9.0 || t < -len || t > len + endW) { continue; }
      let E = exp(-abs(sd) / lam);
      let dE = -sign(sd) * E / lam;
      let r1 = sstep(-len, len, t);
      let r2 = sstep(len, len + endW, t);
      let ramp = r1.x * (1.0 - r2.x);
      let dramp = r1.y * (1.0 - r2.x) - r1.x * r2.y;
      let K = B.x * len;
      p -= u * (K * ramp * E);
      J = shear(u, u * (K * dramp * E) + nrm * (K * ramp * dE)) * J;
    } else {
      // A comb: a row of tines drawn across the whole tray, its front moving.
      let C = params.c[i];
      let u = A.zw;
      let nrm = vec2f(-u.y, u.x);
      let q = p - A.xy;
      let t = dot(q, u);
      let s = dot(q, nrm);
      let R = sstep(0.0, 1.0, (C.x - t) / C.y);
      if (R.x <= 0.0) { continue; }
      let sp = B.y;
      let ang = 6.2831853 * (s / sp - C.z);
      let bump = 0.5 + 0.5 * cos(ang);
      let E = pow(bump, B.z);
      let dE = B.z * pow(bump, B.z - 1.0) * (-0.5 * sin(ang)) * (6.2831853 / sp);
      let Z = B.x;
      p -= u * (Z * R.x * E);
      J = shear(u, u * (-Z * R.y / C.y * E) + nrm * (Z * R.x * dE)) * J;
    }
  }

  if (w > 0.0) {
    var under: vec3f;
    if (params.fresh > 0.5) {
      under = ground(p);
    } else {
      // Where the moves squeeze the baked tray, average over the pixel's footprint.
      let foot = max(length(J[0]), length(J[1]));
      if (foot > 1.5 * params.baseTexel) {
        under = 0.25 * (baked(p + 0.25 * (J[0] + J[1])) + baked(p + 0.25 * (J[0] - J[1])) + baked(p - 0.25 * (J[0] - J[1])) + baked(p - 0.25 * (J[0] + J[1])));
      } else {
        under = baked(p);
      }
    }
    col += w * under;
  }
  return vec4f(col, 1.0);
}
