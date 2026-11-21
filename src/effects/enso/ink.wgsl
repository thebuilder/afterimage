// The ink on the sheet. Per texel: r = pigment still suspended in water,
// g = pigment settled into the fibres, b = water, a = how readily this bit of
// paper wicks (worked out once, when the sheet is laid).
//
// Water flows from wetter to drier texels, faster along the fibres, and
// carries suspended pigment with it, but the fibres filter some of it out on
// the way, so a bleed fades from the stroke into a pale grey feather. Pigment
// settles as the water goes, faster at the drying front, which leaves the
// faint darker rim of a real bloom. Every exchange is pairwise and below the
// explicit-diffusion limit, so nothing can grow without bound.
import { permeability, phash, pnoise } from "./paper.wgsl";

struct Sim {
  seg: vec4f,      // brush segment this frame: a.xy, b.xy, screen units
  stroke: vec4f,   // half width, ink load, arc length at a, stroke seed
  aspect: f32,
  texel: f32,      // one texel in screen heights
  dt: f32,
  fade: f32,       // multiplier for all ink this frame
  touching: f32,   // 1 while the brush touches the paper
  wet: f32,        // how much water the brush carries
  init: f32,
  _p0: f32,
}
@group(0) @binding(0) var state: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> sim: Sim;

fn at(ip: vec2i, size: vec2i) -> vec4f {
  return textureLoad(state, clamp(ip, vec2i(0), size - 1), 0);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let size = vec2i(textureDimensions(state));
  let ip = vec2i(uv * vec2f(size));
  let p = vec2f(uv.x * sim.aspect, 1.0 - uv.y);
  if (sim.init > 0.5) {
    return vec4f(0.0, 0.0, 0.0, permeability(p));
  }
  let c = at(ip, size);

  // Per frame rates, from per second ones, held under the stability limit:
  // eight exchanges of at most 0.11 each keep the total under 1. The far ring
  // (two texels out on the diagonals, which with the near ring spreads evenly
  // instead of in a square) lets a bleed travel far enough to read as a feather in
  // a second or two without needing several steps a frame.
  let step = sim.dt * 60.0;
  let kWater = 0.1 * step;
  let concC = min(c.r / max(c.b, 0.04), 3.0);

  var b = c.b;
  var r = c.r;
  var grad = vec2f(0.0);
  let offs = array<vec2i, 8>(
    vec2i(1, 0), vec2i(-1, 0), vec2i(0, 1), vec2i(0, -1),
    vec2i(2, 2), vec2i(-2, 2), vec2i(2, -2), vec2i(-2, -2)
  );
  for (var i = 0; i < 8; i++) {
    let off = offs[i];
    let wgt = 1.0;
    let o = at(ip + off, size);
    // Water only wicks where at least one side is already damp.
    let damp = smoothstep(0.01, 0.12, max(o.b, c.b));
    let k = min(kWater * 0.5 * (c.a + o.a), 0.11) * wgt * damp;
    if (i < 4) {
      grad += vec2f(off) * o.b;
    }
    let flow = k * (o.b - c.b); // > 0 flows in
    b += flow;
    // Suspended pigment rides the water, but the sheet filters most of it
    // out except along the fibres, so a bleed feathers out in fine hairs
    // instead of blurring.
    let concO = min(o.r / max(o.b, 0.04), 3.0);
    let carry = 0.08 + 0.4 * smoothstep(0.75, 1.25, 0.5 * (c.a + o.a));
    r += carry * flow * select(concC, concO, flow > 0.0);
  }
  // The sheet drinks and the air dries it, with a linear tail so it ends.
  b = max(0.0, b * exp(-sim.dt * 0.32) - sim.dt * 0.01);

  // Settling: slow while wet, everything once dry, faster at the drying front.
  let wetHere = smoothstep(0.02, 0.2, b);
  let front = clamp(length(grad) * 2.0, 0.0, 1.0) * (1.0 - smoothstep(0.15, 0.4, b));
  let settle = clamp(sim.dt * (1.0 + 7.0 * (1.0 - wetHere) + 3.0 * front), 0.0, 1.0);
  var g = c.g + r * settle;
  r -= r * settle;

  // The brush.
  if (sim.touching > 0.5) {
    let a = sim.seg.xy;
    let e = sim.seg.zw;
    let w = sim.stroke.x;
    let load = sim.stroke.y;
    let dv = e - a;
    let L = length(dv);
    let dir = select(vec2f(1.0, 0.0), dv / max(L, 1e-6), L > 1e-6);
    let pa = p - a;
    let h = clamp(dot(pa, dir), 0.0, L);
    let dist = length(pa - dir * h);
    if (dist < w * 1.4 + 2.0 * sim.texel) {
      // The hairs at the edge of a brush are uneven, so the outline is too.
      let u0 = sim.stroke.z + h;
      let side = select(0.0, 5.0, dir.x * pa.y - dir.y * pa.x > 0.0);
      let rag = 1.0 + 0.1 * (pnoise(vec2f(u0 * 60.0, side + sim.stroke.w)) - 0.5) + 0.05 * (pnoise(vec2f(u0 * 260.0, side + 2.0)) - 0.5);
      let inside = 1.0 - smoothstep(w * rag - 1.5 * sim.texel, w * rag + 1.5 * sim.texel, dist);
      // The brush wets a little beyond its ink, and the bleed runs into that.
      let damp = 1.0 - smoothstep(w * 0.95, w * 1.3, dist);
      // Across the brush: which bristle this is, and whether it still has ink.
      let v = (dir.x * pa.y - dir.y * pa.x) / w;
      let id = floor((v * 0.5 + 0.5) * 38.0);
      let hb = phash(vec2f(id, sim.stroke.w));
      let u = sim.stroke.z + h;
      let skip = pnoise(vec2f(u * 9.0, id * 3.7 + sim.stroke.w)) - 0.5;
      let ink = smoothstep(-0.06, 0.06, load * 1.25 - 0.12 + skip * 0.5 - hb);
      // A drying brush only touches the tops of the paper's tooth, so its
      // marks break up into specks of bare paper (kasure, flying white).
      let tooth = pnoise(p * 380.0) * 0.6 + pnoise(p * 1100.0) * 0.4;
      let full = smoothstep(0.3, 0.75, load);
      let catchTooth = smoothstep(0.62 - 0.5 * load, 0.72 - 0.5 * load, tooth);
      let bite = mix(catchTooth, 1.0, full);
      // The belly of the brush carries more than its edge.
      let belly = 1.0 - 0.35 * v * v;
      // A loaded brush lays near black; the ink thins to grey as it runs out.
      let streak = 0.82 + 0.18 * pnoise(vec2f(u * 40.0, id * 1.3)) ;
      let dep = inside * ink * bite * belly * (0.15 + 1.05 * load * load) * streak * (0.7 + 0.3 * phash(vec2f(id, 7.0)));
      // Topping up, not adding: ink already in the paper takes the place of
      // fresh ink, so going over a stroke darkens it a little, never floods.
      r = max(r, dep - 0.4 * g);
      b = max(b, max(inside * bite * (0.05 + sim.wet * (0.3 + 0.6 * ink)), damp * sim.wet * 0.45 * load));
    }
  }

  // Clamp everything: a sheet can always recover from one bad texel.
  return vec4f(
    clamp(r * sim.fade, 0.0, 2.0),
    clamp(g * sim.fade, 0.0, 2.5),
    clamp(b, 0.0, 1.0),
    clamp(c.a, 0.0, 2.0)
  );
}
