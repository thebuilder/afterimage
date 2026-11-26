// The bench under the snow, shared by the snow pass and the picture: noise,
// and where the slats run. Slats lie nearly across the screen, turned a few
// degrees, with dark gaps between them.

export fn ghash(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 456.21));
  q += dot(q, q + 45.32);
  return fract(q.x * q.y);
}

export fn gnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = ghash(i);
  let b = ghash(i + vec2f(1.0, 0.0));
  let c = ghash(i + vec2f(0.0, 1.0));
  let d = ghash(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

export fn gfbm(p: vec2f) -> f32 {
  var s = 0.0;
  var a = 0.5;
  var q = p;
  for (var i = 0; i < 4; i++) {
    s += a * gnoise(q);
    q = q * 2.03 + vec2f(17.1, 9.3);
    a *= 0.5;
  }
  return s;
}

const TURN: f32 = 0.07;
export const PITCH: f32 = 0.158;
export const GAP: f32 = 0.018;

/// Bench coordinates: x along the slats, y across them.
export fn benchXY(p: vec2f) -> vec2f {
  let c = cos(TURN);
  let s = sin(TURN);
  return vec2f(c * p.x + s * p.y, -s * p.x + c * p.y) + vec2f(0.0, 0.031);
}

/// Distance in from the nearer edge of the slat under p (negative in a gap),
/// the slat's index, and the position along it.
export fn slat(p: vec2f) -> vec3f {
  let q = benchXY(p);
  let t = q.y / PITCH;
  let i = floor(t);
  let f = (t - i) * PITCH;
  let e = min(f - GAP * 0.5, PITCH - GAP * 0.5 - f);
  return vec3f(e, i, q.x);
}

/// Fresh snow as it fell: a little uneven, drifted by the wind, and rounded
/// off over each slat's edges.
export fn laidSnow(p: vec2f) -> f32 {
  let s = slat(p);
  if (s.x <= 0.0) { return 0.0; }
  let q = benchXY(p);
  var d = 1.0 + 0.2 * (gfbm(q * 7.0 + s.y * 3.1) - 0.5) + 0.06 * (gnoise(q * vec2f(18.0, 46.0)) - 0.5);
  // A cushion: the snow slumps round over the edges.
  let k = clamp(s.x / 0.022, 0.0, 1.0);
  d *= sqrt(k) * (0.6 + 0.4 * k);
  return d;
}
