// The snow on the bench. Per texel: r = depth of snow (1 = as it fell),
// g = the depth it fell to, kept to refill toward.
// A fingertip dug through it leaves a rounded trench with the snow it pushed
// aside heaped along both sides; new snow slowly fills every mark back in.
import { laidSnow, slat } from "./bench.wgsl";

struct Dig {
  seg: vec4f,     // the fingertip's centre last frame and this frame
  aspect: f32,
  radius: f32,    // fingertip radius, screen heights
  touching: f32,
  init: f32,
  refill: f32,    // fraction of the way back to fresh this frame
  _p0: f32,
  _p1: f32,
  _p2: f32,
}
@group(0) @binding(0) var state: texture_2d<f32>;
@group(0) @binding(1) var<uniform> dig: Dig;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let size = vec2i(textureDimensions(state));
  let ip = clamp(vec2i(uv * vec2f(size)), vec2i(0), size - 1);
  let p = vec2f(uv.x * dig.aspect, 1.0 - uv.y);
  if (dig.init > 0.5) {
    let d = laidSnow(p);
    return vec4f(d, d, 0.0, 1.0);
  }
  let old = textureLoad(state, ip, 0);
  let fresh = old.g;
  if (fresh <= 0.0) { return old; }
  // Disturbed snow slumps: what sticks up or is dug out evens a little with
  // its neighbours every frame, so overlapping strokes stay smooth instead of
  // keeping every texel-sized step. Only the change from fresh snow slumps,
  // so the wind drift and the rounded slat edges stay as they fell.
  var dev = old.r - fresh;
  var nsum = 0.0;
  var nw = 0.0;
  let offs = array<vec2i, 4>(vec2i(1, 0), vec2i(-1, 0), vec2i(0, 1), vec2i(0, -1));
  for (var i = 0; i < 4; i++) {
    let n = textureLoad(state, clamp(ip + offs[i], vec2i(0), size - 1), 0);
    if (n.g > 0.0) {
      nsum += n.r - n.g;
      nw += 1.0;
    }
  }
  if (nw > 0.0) { dev = mix(dev, nsum / nw, 0.12); }
  // New snow settles everywhere, and heaps sink back as they settle.
  var d = fresh + dev * (1.0 - dig.refill);
  if (dig.touching > 0.5) {
    let rf = dig.radius;
    let a = dig.seg.xy;
    let ab = dig.seg.zw - a;
    let tt = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-10), 0.0, 1.0);
    let off = p - a - ab * tt;
    let k = length(off) / rf;
    if (k < 2.2) {
      // The trench: down to a thin film at the middle, round walls.
      let floorD = 0.04;
      let wall = smoothstep(0.25, 1.0, k);
      d = min(d, mix(floorD, max(fresh, 0.3), wall * wall));
      // What was dug out is pushed out to the sides as a soft ridge, more the
      // further the finger moved this frame. Its strength turns smoothly with
      // the angle to the stroke: full beside it, nothing straight ahead or
      // behind, so neither the fingertip's rounded end nor the segment's
      // ends leave steps or ribs.
      let mlen = length(ab);
      let moved = mlen / rf;
      let side = select(0.0, 1.0 - pow(abs(dot(off / max(length(off), 1e-6), ab / max(mlen, 1e-6))), 2.0), mlen > 1e-6);
      let hk = (k - 1.35) / 0.35;
      // Heaps grow less readily the taller they already are.
      let room = 1.0 - smoothstep(0.0, 0.4, d - fresh);
      d += exp(-hk * hk) * min(moved, 1.5) * 0.08 * side * room;
    }
  }
  return vec4f(d, fresh, 0.0, 1.0);
}
