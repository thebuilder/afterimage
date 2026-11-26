// The snow on the bench. Per texel: r = depth of snow (1 = as it fell),
// g = the depth it fell to, kept to refill toward, b = a blurred copy of how
// much has been dug out round here.
// A fingertip dug through it leaves a rounded trench; the snow it pushed
// aside shows as a ridge wherever the blurred dug-out amount is more than
// what was dug right here, which is just outside the trench's walls. That
// ridge comes from a diffusion, never from per-frame stamps, so however the
// strokes cross or double back it stays smooth. New snow slowly fills every
// mark back in.
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
  // Disturbed snow slumps a little toward its neighbours, and the dug-out
  // amount spreads into the halo the ridge is drawn from. Only the change from
  // fresh snow slumps, so wind drift and rounded slat edges stay as they fell.
  var dev = old.r - fresh;
  var nsum = 0.0;
  var nw = 0.0;
  var hsum = 0.0;
  let offs = array<vec2i, 4>(vec2i(1, 0), vec2i(-1, 0), vec2i(0, 1), vec2i(0, -1));
  for (var i = 0; i < 4; i++) {
    let n = textureLoad(state, clamp(ip + offs[i], vec2i(0), size - 1), 0);
    hsum += n.b;
    if (n.g > 0.0) {
      nsum += n.r - n.g;
      nw += 1.0;
    }
  }
  if (nw > 0.0) { dev = mix(dev, nsum / nw, 0.05); }
  // New snow settles everywhere.
  var d = fresh + dev * (1.0 - dig.refill);
  if (dig.touching > 0.5) {
    let rf = dig.radius;
    let a = dig.seg.xy;
    let ab = dig.seg.zw - a;
    let tt = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-10), 0.0, 1.0);
    let k = length(p - a - ab * tt) / rf;
    if (k < 1.0) {
      // The trench: down to a thin film at the middle, round walls.
      let wall = smoothstep(0.25, 1.0, k);
      d = min(d, mix(0.04, max(fresh, 0.3), wall * wall));
    }
  }
  let dug = clamp(fresh - d, 0.0, 1.0);
  let halo = mix(hsum * 0.25, dug, 0.035);
  return vec4f(d, fresh, halo, 1.0);
}
