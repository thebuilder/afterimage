// Hex Reactor: hexagonal lattice lit by radial energy pulses and a scan sweep.
import { centered, filmic, dither, hash21 } from "./common.wgsl";
import { simplex2d } from "@vgpu/wgsl-std/noise/simplex";

struct Params {
  res: vec2f,
  mouse: vec2f,
  time: f32,
  charge: f32,
  density: f32,
  sweep: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

/// Nearest hex centre on the pointy-top lattice.
/// Returns (local offset, cell id) using the two-candidate-lattice trick:
/// a hex grid is two offset rectangular grids, and the nearer candidate wins.
fn hexCoords(p: vec2f) -> vec4f {
  let r = vec2f(1.0, 1.7320508);
  let h = r * 0.5;

  // Each candidate centre is built from its integer lattice index, so every
  // pixel in a cell gets a bit-identical id. Recovering it as `p - local`
  // instead leaves a few ulps of jitter, and any per-cell function sharp enough
  // to matter turns that jitter into banding inside the cell.
  let ca = floor(p / r) * r + h;
  let cb = floor((p + h) / r) * r;
  let da = p - ca;
  let db = p - cb;
  if (dot(db, db) < dot(da, da)) { return vec4f(db, cb); }
  return vec4f(da, ca);
}

/// Distance to the hex edge: 1 at the flat sides, larger at the corners.
fn hexDist(p: vec2f) -> f32 {
  let q = abs(p);
  return max(dot(q, normalize(vec2f(1.0, 1.7320508))), q.x);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = centered(uv, params.res);
  let t = params.time;
  let mp = centered(params.mouse, params.res) * vec2f(1.0, -1.0);

  // Slow breathing zoom keeps the lattice from feeling like a static texture.
  let scale = params.density + sin(t * 0.13) * 1.1;
  let hc = hexCoords(p * scale);
  let gv = hc.xy;
  let id = hc.zw;
  let cell = id / scale;

  let dCentre = length(cell);
  let dMouse = length(cell - mp);
  let seed = hash21(id);

  // Two pulse trains: one from the origin, one from the pointer. Each is a
  // travelling ring, so a cell lights when a wavefront passes over it.
  let ring1 = sin(dCentre * 7.0 - t * 2.1);
  let ring2 = sin(dMouse * 9.0 - t * 3.0);
  var energy = pow(max(ring1, 0.0), 9.0) * 0.9;
  energy += pow(max(ring2, 0.0), 10.0) * 0.7 * smoothstep(1.6, 0.0, dMouse);

  // Slow field noise so idle cells still drift instead of sitting dead.
  energy += smoothstep(0.55, 1.05, simplex2d(cell * 1.6 + vec2f(t * 0.22, -t * 0.17))) * 0.30;

  // A few cells flicker like a bad connection.
  let flick = step(0.972, hash21(id + floor(t * 3.0)));
  energy += flick * 0.85;

  // Scan sweep travelling up the lattice. Driven by the cell centre, not the
  // pixel, so it lights whole cells instead of slicing bands through them.
  let sweep = fract(t * 0.17 * params.sweep) * 1.4 - 0.7;
  energy += pow(max(1.0 - abs(cell.y - sweep) * 9.0, 0.0), 2.0) * 0.9;

  energy *= params.charge;

  // `hexDist` reaches 0.5 on every edge of the cell, so distance-inside is 0.5 - hd.
  let edge = 0.5 - hexDist(gv);
  // Screen-space derivative keeps the rim one pixel wide at any zoom, instead of
  // a band that fattens as the lattice scales up.
  let w = max(fwidth(edge), 0.0008) * 1.5;
  let outer = smoothstep(0.0, w, edge - 0.020);
  let inner = smoothstep(0.0, w, edge - 0.070);
  let border = outer - inner;   // the hairline ring
  let fill = inner;             // the plate inside it

  // Phosphor ramp: dim teal at rest, cyan-white at full charge. A small share of
  // cells run on the pink signal channel instead, so the lattice is not monotone.
  let odd = step(0.90, hash21(id * 1.7 + 4.0));
  let cool = mix(vec3f(0.06, 0.42, 0.36), vec3f(0.78, 1.00, 0.92), smoothstep(0.0, 1.1, energy));
  let hot = mix(vec3f(0.45, 0.10, 0.24), vec3f(1.00, 0.55, 0.72), smoothstep(0.0, 1.1, energy));
  let tint = mix(cool, hot, odd);

  var col = vec3f(0.003, 0.010, 0.011);
  // The lattice is always faintly drawn, energy or not: a dark grid still reads as structure.
  col += vec3f(0.05, 0.22, 0.19) * border * 0.55;
  col += tint * fill * energy * 0.30;
  col += tint * border * (0.35 + energy * 2.6);

  // Cheap bloom: a wide soft copy of the same energy field, no second pass needed.
  col += tint * energy * energy * 0.20;

  // Depth fade toward the frame edges so the lattice reads as a plane in space.
  col *= 0.35 + 0.65 * smoothstep(1.5, 0.15, length(p * vec2f(0.85, 1.15)));

  col = filmic(col * 1.35);
  return vec4f(col + dither(uv, params.res), 1.0);
}
