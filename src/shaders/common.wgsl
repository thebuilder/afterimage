// Shared helpers for every hero shader.
// Modules are pure: no @group/@binding lives here.

/// Screen-space coordinate centred on 0 with y pointing up and x scaled by aspect.
/// `uv` arrives top-origin from effect(), which is why y is flipped once, here.
export fn centered(uv: vec2f, res: vec2f) -> vec2f {
  return vec2f((uv.x - 0.5) * (res.x / max(res.y, 1.0)), 0.5 - uv.y);
}

/// Cosine gradient palette. Four control vectors, one scalar, every ramp in the set.
export fn palette(t: f32, a: vec3f, b: vec3f, c: vec3f, d: vec3f) -> vec3f {
  return a + b * cos(6.283185307 * (c * t + d));
}

export fn rot2(a: f32) -> mat2x2f {
  let s = sin(a);
  let c = cos(a);
  return mat2x2f(c, -s, s, c);
}

/// Polynomial smooth minimum: the operator that makes two SDFs melt instead of crease.
export fn smin(a: f32, b: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

export fn hash21(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 456.21));
  q += dot(q, q + 45.32);
  return fract(q.x * q.y);
}

export fn hash11(n: f32) -> f32 {
  return fract(sin(n * 127.1) * 43758.5453);
}

/// ACES-ish filmic curve. Keeps additive highlights from clipping to flat white.
export fn filmic(x: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

/// Ordered-ish dither. 8-bit targets band badly on slow gradients; this hides it.
export fn dither(uv: vec2f, res: vec2f) -> f32 {
  return (hash21(uv * res) - 0.5) / 255.0;
}

/// Radial vignette, 1 at the centre.
export fn vignette(uv: vec2f, amount: f32) -> f32 {
  let d = length(uv - 0.5);
  return 1.0 - amount * d * d;
}
