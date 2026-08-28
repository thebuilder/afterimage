// Wormhole: a perspective tunnel. The whole image is one inverse-radius
// projection, so nothing is raymarched and the depth is exact.
import { fbmSimplex2d } from "@vgpu/wgsl-std/noise/simplex";
import { centered, filmic, dither, hash21, palette, rot2 } from "./common.wgsl";

struct Params {
  res: vec2f,
  mouse: vec2f,
  time: f32,
  speed: f32,
  twist: f32,
  flare: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var p = centered(uv, params.res);
  let t = params.time;
  let m = (params.mouse - 0.5) * vec2f(1.0, -1.0);

  // Steering: the vanishing point follows the pointer, and drifts on its own.
  let centre = m * 0.35 + vec2f(sin(t * 0.13) * 0.06, cos(t * 0.11) * 0.05);
  p -= centre;

  let r = max(length(p), 0.0008);
  let a = atan2(p.y, p.x);

  // 1/r is depth. A point at radius r on screen sits at distance 1/r down the
  // tube, which is the whole projection: near the centre, r is small and the
  // wall is arbitrarily far away.
  let depth = 1.0 / r;
  let z = depth * 0.85 + t * params.speed * 2.0;
  // The tube twists as it recedes.
  let theta = a + depth * params.twist * 0.05 + t * 0.08;

  // Wall texture in (angle, depth). Cylindrical coordinates make it seamless
  // around the tube without any wrapping seam to hide.
  let PANELS = 24.0;
  let wall = vec2f(theta * PANELS / 6.283185307, z);
  var cell = floor(wall);
  // atan2 cuts at +/-pi, and across that cut the angular index jumps by exactly
  // PANELS. Wrapping it makes the two sides of the cut hash to the same panel,
  // which is what removes the vertical seam running out of the throat.
  cell.x = cell.x - PANELS * floor(cell.x / PANELS);
  let g = fract(wall) - 0.5;
  let id = hash21(cell);

  let grime = fbmSimplex2d(wall * 1.4 + vec2f(0.0, 0.0), 4, 2.2, 0.55);
  let panel = 1.0 - smoothstep(0.40, 0.48, max(abs(g.x), abs(g.y)));
  let seam = smoothstep(0.40, 0.50, max(abs(g.x), abs(g.y)));

  // Panels light up in bands travelling down the tube.
  let lit = pow(max(sin(cell.y * 0.7 - t * params.speed * 1.6 + id * 6.2831853) * 0.5 + 0.5, 0.0), 8.0);

  let hue = 0.55 + id * 0.12 + z * 0.012;
  let tint = palette(hue,
    vec3f(0.42, 0.38, 0.52),
    vec3f(0.45, 0.34, 0.42),
    vec3f(1.0, 1.0, 1.0),
    vec3f(0.05, 0.22, 0.58));

  var col = vec3f(0.0);
  col += tint * panel * (0.020 + 0.10 * (grime * 0.5 + 0.5));
  col += vec3f(0.28, 0.55, 0.85) * seam * 0.16;
  col += tint * lit * panel * 3.2;

  // Fog: everything far down the tube washes out toward the throat colour.
  let fog = 1.0 - exp(-depth * 0.16);
  col = mix(col, vec3f(0.012, 0.020, 0.055), fog);

  // The throat. This is the brightest thing in frame and the reason the eye
  // reads depth at all.
  let throat = pow(max(1.0 - r * 3.4, 0.0), 3.0);
  col += vec3f(0.55, 0.85, 1.00) * throat * 1.6 * params.flare;
  col += vec3f(1.00, 0.62, 0.85) * pow(max(1.0 - r * 8.0, 0.0), 2.0) * 2.2 * params.flare;
  // Streaks radiating out of it.
  let streak = pow(max(0.5 + 0.5 * sin(a * 14.0 + t * 0.7), 0.0), 6.0);
  col += vec3f(0.60, 0.80, 1.0) * streak * exp(-r * 3.2) * 0.45 * params.flare;

  col = filmic(col * 1.25);
  col *= 0.62 + 0.38 * smoothstep(1.35, 0.10, length((uv - 0.5) * vec2f(1.1, 1.0)));
  return vec4f(col + dither(uv, params.res), 1.0);
}
