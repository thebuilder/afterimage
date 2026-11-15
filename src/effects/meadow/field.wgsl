// Shared by both passes: where each row of grass stands, and the wind.

export const LAYERS: i32 = 6;

/// Row l, back (0) to front (5): ground height, blade height, spacing, width,
/// all in screen heights with y up from the bottom edge.
export fn row(l: i32) -> vec4f {
  let f = f32(l) / 5.0;
  let ground = mix(0.34, -0.02, pow(f, 0.8));
  let height = mix(0.07, 0.62, f * f);
  let spacing = mix(0.0042, 0.021, f * f);
  let width = mix(0.0016, 0.0115, f * f);
  return vec4f(ground, height, spacing, width);
}

/// The wind's bend at x: a steady lean, slow swells and gust fronts that roll
/// across the field from left to right.
export fn wind(x: f32, t: f32, l: f32, strength: f32) -> f32 {
  let swell = 0.18 * sin(x * 2.3 - t * 1.1 + l * 0.4) + 0.1 * sin(x * 5.7 - t * 2.3 + l);
  let front = fract((x - t * 0.32) * 0.35);
  let gust = 0.55 * smoothstep(0.0, 0.08, front) * (1.0 - smoothstep(0.08, 0.5, front));
  return strength * (0.12 + swell + gust);
}
