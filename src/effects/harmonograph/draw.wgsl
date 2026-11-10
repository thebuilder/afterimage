// One frame of drawing: the pen's path since the last frame, laid onto the
// sheet as ink. Pixels far from the pen just keep what the sheet holds.
import { penAt, Swing } from "./pen.wgsl";

struct Draw {
  swing: Swing,
  box: vec4f, // where the pen went this frame, in screen units: min xy, max xy
  res: vec2f,
  tau0: f32,
  tau1: f32,
  weight: f32,
  fade: f32,
  down: f32, // 1 while the pen is on the paper
  _p0: f32,
}
@group(0) @binding(0) var sheet: texture_2d<f32>;
@group(0) @binding(1) var<uniform> draw: Draw;

const STEPS: i32 = 24;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let n = vec2i(textureDimensions(sheet));
  let ic = clamp(vec2i(uv * vec2f(n)), vec2i(0), n - 1);
  var ink = textureLoad(sheet, ic, 0).r * draw.fade;

  let aspect = draw.res.x / max(draw.res.y, 1.0);
  let p = vec2f((uv.x - 0.5) * aspect, 0.5 - uv.y);
  let px = 1.0 / draw.res.y;
  let pad = 4.0 * px + 0.004 * draw.weight;
  if (draw.down < 0.5 || any(p < draw.box.xy - pad) || any(p > draw.box.zw + pad)) {
    return vec4f(ink, 0.0, 0.0, 1.0);
  }

  // Distance to this frame's stretch of path. Both of its ends are cut flat,
  // since the stretches before and after ink right up to them: a round end
  // would lay ink twice at every join and bead the line.
  var best = 1e3;
  var speed = 0.0;
  var a = penAt(draw.swing, draw.tau0);
  for (var i = 1; i <= STEPS; i++) {
    let b = penAt(draw.swing, mix(draw.tau0, draw.tau1, f32(i) / f32(STEPS)));
    let pa = p - a;
    let ba = b - a;
    let l2 = max(dot(ba, ba), 1e-12);
    let hr = dot(pa, ba) / l2;
    if (!(i == 1 && hr < 0.0) && !(i == STEPS && hr > 1.0)) {
      let h = clamp(hr, 0.0, 1.0);
      let d = length(pa - ba * h);
      if (d < best) {
        best = d;
        speed = sqrt(l2);
      }
    }
    a = b;
  }
  // Ink pools where the pen slows, so turns and the dying middle draw darker.
  let slow = clamp(0.0016 / max(speed * f32(STEPS), 1e-5), 0.0, 1.0);
  let w = (0.55 + 0.35 * slow) * px * 1.15 * draw.weight + 0.0003 * draw.weight;
  let cover = smoothstep(w + px * 0.75, w - px * 0.75, best);
  ink += cover * (0.5 + 0.35 * slow) * (1.0 - 0.45 * min(ink, 1.0));
  return vec4f(min(ink, 2.0), 0.0, 0.0, 1.0);
}
