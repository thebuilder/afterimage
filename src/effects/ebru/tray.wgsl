// The marbling tray, shared by the marbling pass and the picture: the dark
// size the paint floats on, and the paints themselves.

export fn thash(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 456.21));
  q += dot(q, q + 45.32);
  return fract(q.x * q.y);
}

export fn tnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(thash(i), thash(i + vec2f(1.0, 0.0)), u.x), mix(thash(i + vec2f(0.0, 1.0)), thash(i + vec2f(1.0, 1.0)), u.x), u.y);
}

/// The size in the tray: a deep blue black with a faint cloudiness.
export fn ground(p: vec2f) -> vec3f {
  let n = tnoise(p * 3.0) * 0.6 + tnoise(p * 11.0 + 7.0) * 0.4;
  return vec3f(0.055, 0.065, 0.085) * (0.85 + 0.3 * n);
}

/// Six earth and mineral paints, in the order the hand picks them up.
export fn paint(i: f32) -> vec3f {
  let k = i32(i) % 6;
  switch k {
    case 0: { return vec3f(0.93, 0.89, 0.79); }   // cream
    case 1: { return vec3f(0.64, 0.17, 0.14); }   // oxblood
    case 2: { return vec3f(0.85, 0.60, 0.21); }   // ochre
    case 3: { return vec3f(0.16, 0.27, 0.53); }   // indigo
    case 4: { return vec3f(0.17, 0.46, 0.44); }   // verdigris
    default: { return vec3f(0.83, 0.66, 0.55); }  // rose clay
  }
}
