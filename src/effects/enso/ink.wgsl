// The ink on the sheet. Per texel: r = pigment still wet and moving, g =
// pigment settled into the fibres, b = water. The brush lays down ink and
// water; wet ink soaks sideways along the fibres while the water lasts, and
// settles, a little more at the drying edge, so blooms get a darker rim.
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
    return vec4f(0.0);
  }
  let c = at(ip, size);
  let n0 = at(ip + vec2i(1, 0), size);
  let n1 = at(ip - vec2i(1, 0), size);
  let n2 = at(ip + vec2i(0, 1), size);
  let n3 = at(ip - vec2i(0, 1), size);
  let perm = permeability(p);

  // Water spreads a little into the sheet and dries.
  let wetHere = smoothstep(0.02, 0.25, c.b);
  var b = c.b;
  var r = c.r;
  var g = c.g;
  let nb = array<vec4f, 4>(n0, n1, n2, n3);
  for (var i = 0; i < 4; i++) {
    let o = nb[i];
    let kb = 0.22 * perm * smoothstep(0.03, 0.3, max(o.b, c.b));
    b += kb * (o.b - c.b);
    // Wet pigment moves only where both sides are wet.
    let kr = 0.24 * perm * min(wetHere, smoothstep(0.02, 0.25, o.b));
    r += kr * (o.r - c.r);
  }
  b *= exp(-sim.dt * 0.5);

  // Pigment settles: slowly while wet, all of it once dry, more at the
  // drying front where the water thins out.
  let edge = clamp(length(vec2f(n0.b - n1.b, n2.b - n3.b)) * 6.0, 0.0, 1.0);
  let settle = clamp(sim.dt * (0.5 + 6.0 * (1.0 - wetHere) + 5.0 * edge), 0.0, 1.0);
  g += r * settle;
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
    if (dist < w + sim.texel) {
      let inside = 1.0 - smoothstep(w - sim.texel, w + sim.texel, dist);
      // Across the brush: which bristle this is, and whether it still has ink.
      let v = (dir.x * pa.y - dir.y * pa.x) / w;
      let id = floor((v * 0.5 + 0.5) * 38.0);
      let hb = phash(vec2f(id, sim.stroke.w));
      let u = sim.stroke.z + h;
      let skip = pnoise(vec2f(u * 9.0, id * 3.7 + sim.stroke.w)) - 0.5;
      let ink = smoothstep(-0.06, 0.06, load * 1.25 - 0.12 + skip * 0.5 - hb);
      // The belly of the brush carries more than its edge.
      let belly = 1.0 - 0.35 * v * v;
      let amount = inside * ink * belly * (0.55 + 0.6 * load) * (0.7 + 0.3 * phash(vec2f(id, 7.0)));
      r = max(r, amount * 1.3);
      b = max(b, inside * (0.08 + sim.wet * (0.35 + 0.65 * ink)));
    }
  }

  return vec4f(r * sim.fade, g * sim.fade, b, 1.0);
}
