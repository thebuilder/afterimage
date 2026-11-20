// The washi sheet, shared by the ink sim and the picture: where its fibres
// run, ink soaks along them faster, and the picture draws them.

export fn phash(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 456.21));
  q += dot(q, q + 45.32);
  return fract(q.x * q.y);
}

export fn pnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(phash(i), phash(i + vec2f(1.0, 0.0)), u.x), mix(phash(i + vec2f(0.0, 1.0)), phash(i + vec2f(1.0, 1.0)), u.x), u.y);
}

/// Long thin fibres at a few angles: 0 between them, up to 1 along one.
export fn fibres(p: vec2f) -> f32 {
  var f = 0.0;
  for (var k = 0; k < 3; k++) {
    let a = f32(k) * 2.1 + 0.4;
    let c = cos(a);
    let s = sin(a);
    let q = vec2f(c * p.x - s * p.y, s * p.x + c * p.y);
    // Stretched noise, kept only near its ridge, makes a long wavy strand.
    let n = pnoise(vec2f(q.x * 5.0 + f32(k) * 7.0, q.y * 150.0 + pnoise(q * 9.0) * 6.0));
    f = max(f, smoothstep(0.86, 0.97, n) * (0.5 + 0.5 * pnoise(q * 3.0 + 11.0)));
  }
  return f;
}

/// How readily wet ink soaks sideways through the sheet here.
export fn permeability(p: vec2f) -> f32 {
  return 0.35 + 0.45 * pnoise(p * 60.0) + 0.6 * fibres(p);
}
