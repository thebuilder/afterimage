// The bowl's fractures, shared by the gold sim and the picture. Main breaks
// are the edges of a warped Voronoi pattern, with some edges left whole so
// the network has dead ends and long runs like a real break. Positions are
// in screen heights.

export const SCALE: f32 = 3.6;

fn h22(p: vec2f) -> vec2f {
  let q = vec2f(dot(p, vec2f(127.1, 311.7)), dot(p, vec2f(269.5, 183.3)));
  return fract(sin(q) * 43758.5453);
}

fn h21(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(41.3, 289.1))) * 43758.5453);
}

fn vn(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2f(1.0, 0.0)), w.x), mix(h21(i + vec2f(0.0, 1.0)), h21(i + vec2f(1.0, 1.0)), w.x), w.y);
}

/// Domain warp, so the breaks wander instead of running ruler-straight.
fn warp(p: vec2f) -> vec2f {
  let a = vn(p * 2.3) * 0.6 + vn(p * 5.1 + 3.7) * 0.3 + vn(p * 11.0 + 9.1) * 0.1;
  let b = vn(p * 2.3 + 17.0) * 0.6 + vn(p * 5.1 + 21.3) * 0.3 + vn(p * 11.0 + 30.2) * 0.1;
  return p * SCALE + (vec2f(a, b) - 0.5) * 1.1;
}

/// Distance from p to the nearest main fracture, in screen heights.
export fn fracture(p: vec2f) -> f32 {
  let q = warp(p);
  let n = floor(q);
  let f = fract(q);
  var mg = vec2f(0.0);
  var mr = vec2f(0.0);
  var md = 8.0;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let g = vec2f(f32(i), f32(j));
      let r = g + h22(n + g) * 0.85 + 0.075 - f;
      let d = dot(r, r);
      if (d < md) { md = d; mr = r; mg = g; }
    }
  }
  var ed = 8.0;
  for (var j = -2; j <= 2; j++) {
    for (var i = -2; i <= 2; i++) {
      let g = mg + vec2f(f32(i), f32(j));
      let r = g + h22(n + g) * 0.85 + 0.075 - f;
      let dr = r - mr;
      if (dot(dr, dr) > 1e-5) {
        // Some boundaries never broke; skip them.
        let a = n + mg;
        let b = n + g;
        let keep = h21(a + b + 0.37) * 0.5 + h21(abs(a - b) + 1.9) * 0.5;
        if (keep > 0.3) {
          ed = min(ed, dot(0.5 * (mr + r), normalize(dr)));
        }
      }
    }
  }
  return ed / SCALE;
}

/// Distance to the fine crazing in the glaze (never carries gold).
export fn crazing(p: vec2f) -> f32 {
  let q = p * 19.0 + vec2f(vn(p * 7.0), vn(p * 7.0 + 5.0)) * 0.8;
  let n = floor(q);
  let f = fract(q);
  var d1 = 8.0;
  var d2 = 8.0;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let g = vec2f(f32(i), f32(j));
      let r = g + h22(n + g + 50.0) - f;
      let d = length(r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return (d2 - d1) * 0.5 / 19.0;
}
