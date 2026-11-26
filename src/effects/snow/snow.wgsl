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

fn segDist(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let ab = b - a;
  let t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-10), 0.0, 1.0);
  return length(p - a - ab * t);
}

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
  // New snow settles everywhere, and heaps sink back as they settle.
  var d = old.r + (fresh - old.r) * dig.refill;
  if (dig.touching > 0.5) {
    let r = segDist(p, dig.seg.xy, dig.seg.zw);
    let rf = dig.radius;
    let k = r / rf;
    if (k < 2.2) {
      // The trench: down to a thin film at the middle, round walls.
      let floorD = 0.04;
      let wall = smoothstep(0.25, 1.0, k);
      d = min(d, mix(floorD, max(fresh, 0.3), wall * wall));
      // What was dug out is pushed to the sides as a soft ridge, more the
      // further the finger moved this frame.
      let moved = length(dig.seg.zw - dig.seg.xy) / rf;
      // Only beside the stroke: heaping round the fingertip's rounded end
      // every frame would leave ribs along the walls.
      let ab = dig.seg.zw - dig.seg.xy;
      let tt = dot(p - dig.seg.xy, ab) / max(dot(ab, ab), 1e-10);
      let beside = step(0.0, tt) * step(tt, 1.0);
      let hk = (k - 1.35) / 0.35;
      let heap = exp(-hk * hk) * min(moved, 1.5) * 0.09 * beside;
      d = min(d + heap, fresh + 0.45);
    }
  }
  return vec4f(d, fresh, 0.0, 1.0);
}
