// Initial chemical state: A saturated everywhere, B injected in blobs.
import { hash21 } from "../../shaders/common.wgsl";
import { simplex2d } from "@vgpu/wgsl-std/noise/simplex";

struct Seed {
  res: vec2f,
  time: f32,
  _pad: f32,
}
@group(0) @binding(0) var<uniform> seed: Seed;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = (uv - 0.5) * vec2f(seed.res.x / max(seed.res.y, 1.0), 1.0) * 2.0;

  // A handful of soft discs plus a noise field: a single point seed takes
  // thousands of steps to fill the frame, this fills it in a few hundred.
  var b = 0.0;
  for (var i = 0; i < 7; i++) {
    let fi = f32(i);
    let c = (vec2f(hash21(vec2f(fi, 1.0 + seed.time)), hash21(vec2f(fi, 9.0 + seed.time))) - 0.5) * 1.7;
    b += smoothstep(0.22, 0.02, length(p - c));
  }
  b += smoothstep(0.55, 0.95, simplex2d(p * 3.5 + seed.time)) * 0.9;

  return vec4f(1.0, clamp(b, 0.0, 1.0), 0.0, 1.0);
}
