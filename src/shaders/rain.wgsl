// Datastream: falling glyph columns on three depth planes, CRT-tinted.
import { centered, filmic, dither, hash11, hash21 } from "./common.wgsl";

struct Params {
  res: vec2f,
  mouse: vec2f,
  time: f32,
  density: f32,
  speed: f32,
  bleed: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

/// A 5x7 dot-matrix glyph. Each cell is on or off according to one hash bit, so
/// `id` picks a character out of a font that never had to be authored.
fn glyph(cell: vec2f, id: f32) -> f32 {
  // Reject the outer margin so glyphs have air around them.
  if (cell.x < 0.10 || cell.x > 0.90 || cell.y < 0.06 || cell.y > 0.94) { return 0.0; }
  let g = floor(vec2f((cell.x - 0.10) / 0.80 * 5.0, (cell.y - 0.06) / 0.88 * 7.0));
  let on = step(0.52, hash21(g + id * 37.0));
  // Square dots with a hairline gap, so the matrix reads as a matrix.
  let f = fract(vec2f((cell.x - 0.10) / 0.80 * 5.0, (cell.y - 0.06) / 0.88 * 7.0));
  let dot = step(0.12, f.x) * step(f.x, 0.88) * step(0.10, f.y) * step(f.y, 0.90);
  return on * dot;
}

/// One depth plane of columns.
fn layer(uv: vec2f, t: f32, cols: f32, speed: f32, seedOff: f32) -> vec3f {
  let rows = floor(cols * 0.56);
  let grid = vec2f(cols, rows);
  let cellId = floor(uv * grid);
  let cell = fract(uv * grid);

  let colSeed = hash11(cellId.x * 3.13 + seedOff);
  // Each column has its own speed, length and phase.
  let vel = speed * (0.45 + colSeed * 1.15);
  let head = fract(colSeed * 7.0 + t * vel) * (rows + 14.0) - 7.0;
  let tail = 6.0 + colSeed * 16.0;

  let below = head - cellId.y;
  if (below < 0.0 || below > tail) { return vec3f(0.0); }

  // Characters churn: the id changes on its own clock per cell.
  let churn = floor(t * (2.0 + colSeed * 6.0) + cellId.y * 0.7);
  let id = hash11(cellId.x * 17.3 + cellId.y * 5.1 + churn + seedOff);
  let mask = glyph(cell, id);
  if (mask < 0.5) { return vec3f(0.0); }

  let fade = pow(1.0 - below / tail, 1.7);
  let isHead = smoothstep(1.6, 0.0, below);

  // The leading character burns near-white and cools to phosphor behind it.
  let colr = mix(vec3f(0.10, 0.95, 0.55), vec3f(0.85, 1.0, 0.94), isHead);
  return colr * (fade * 0.85 + isHead * 1.9);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let t = params.time;
  let aspect = params.res.x / max(params.res.y, 1.0);
  let m = params.mouse - 0.5;

  var col = vec3f(0.002, 0.010, 0.008);

  // Three planes at different densities and speeds. Parallax on the pointer,
  // scaled by depth, is what turns a flat texture into a volume.
  let far = vec2f(uv.x * aspect + m.x * 0.010, uv.y);
  let mid = vec2f(uv.x * aspect + m.x * 0.024, uv.y);
  let near = vec2f(uv.x * aspect + m.x * 0.048, uv.y);

  col += layer(far, t, 58.0 * params.density, 0.030 * params.speed, 11.0) * 0.30;
  col += layer(mid, t, 32.0 * params.density, 0.048 * params.speed, 3.0) * 0.62;
  col += layer(near, t, 17.0 * params.density, 0.072 * params.speed, 47.0) * 1.0;

  // Phosphor bleed: a soft green wash that follows the overall brightness.
  col += vec3f(0.02, 0.11, 0.07) * pow(col.g, 0.5) * 0.9 * params.bleed;


  // CRT: scanlines, a slow roll bar, and a shadow-mask tint per pixel column.
  let scan = 0.88 + 0.12 * sin(uv.y * params.res.y * 3.14159);
  let roll = 1.0 + 0.05 * smoothstep(0.0, 0.06, abs(fract(uv.y - t * 0.07) - 0.5) - 0.44);
  let maskTint = vec3f(1.03, 0.99, 1.01);
  col *= scan * roll;
  col *= mix(vec3f(1.0), maskTint, 0.6);

  col = filmic(col * 1.25);
  col *= 0.55 + 0.45 * smoothstep(1.30, 0.12, length((uv - 0.5) * vec2f(1.1, 1.0)));
  return vec4f(col + dither(uv, params.res), 1.0);
}
