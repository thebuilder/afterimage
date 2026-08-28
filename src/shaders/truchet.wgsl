// Truchet: quarter-arc tiles that join into one continuous circuit, with light
// running along the wire.
import { centered, filmic, dither, hash21, rot2 } from "./common.wgsl";
import { simplex2d } from "@vgpu/wgsl-std/noise/simplex";

struct Params {
  res: vec2f,
  mouse: vec2f,
  time: f32,
  scale: f32,
  flow: f32,
  glow: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

/// Distance to the two arcs of one Truchet tile, plus the arc-length position
/// along whichever arc is nearer. Position is what lets the pulse travel through
/// a junction instead of restarting at every tile edge.
fn tile(g: vec2f, flip: f32) -> vec2f {
  // `flip` swaps which pair of corners the arcs connect. Every tile picking the
  // same pair gives a grid of circles; alternating them is what makes a maze.
  var p = g;
  if (flip > 0.5) { p.x = -p.x; }

  // Two quarter circles of radius 0.5 centred on opposite corners.
  let dA = abs(length(p - vec2f(0.5, 0.5)) - 0.5);
  let dB = abs(length(p + vec2f(0.5, 0.5)) - 0.5);

  if (dA < dB) {
    let a = atan2(p.y - 0.5, p.x - 0.5);
    return vec2f(dA, (a + 3.14159265) / 1.5707963);
  }
  let b = atan2(p.y + 0.5, p.x + 0.5);
  return vec2f(dB, b / 1.5707963);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = centered(uv, params.res);
  let t = params.time;
  let m = (params.mouse - 0.5) * vec2f(1.0, -1.0);

  // Slow drift and a lazy rotation so the circuit is never axis-aligned.
  let q = rot2(0.18 + sin(t * 0.05) * 0.10) * p * params.scale + vec2f(t * 0.06, t * 0.03);
  let cell = floor(q);
  let g = fract(q) - 0.5;

  let flip = step(0.5, hash21(cell));
  let r = tile(g, flip);
  let d = r.x;
  let along = r.y;

  // Each tile has its own phase, so the pulses do not march in lockstep.
  let phase = hash21(cell + 31.7) * 6.2831853;
  let travel = along * 1.2 + hash21(cell) * 4.0 - t * params.flow;
  let pulse = pow(max(sin(travel * 2.2 + phase) * 0.5 + 0.5, 0.0), 14.0);

  // Field noise decides which parts of the circuit are powered at all.
  let power = smoothstep(-0.15, 0.75, simplex2d(q * 0.28 + vec2f(-t * 0.09, t * 0.05)));
  // The pointer energises whatever it is near.
  let near = smoothstep(0.85, 0.0, length(p - m * 0.9));

  let w = max(fwidth(d), 0.0006);
  let wire = 1.0 - smoothstep(0.030 - w, 0.030 + w, d);
  let halo = exp(-d * 26.0);

  let live = clamp(power + near * 0.8, 0.0, 1.4);
  let hot = pulse * live * params.glow;

  var col = vec3f(0.004, 0.012, 0.014);
  col += vec3f(0.05, 0.24, 0.22) * wire * (0.25 + live * 0.55);   // the trace itself
  col += vec3f(0.35, 1.00, 0.86) * wire * hot * 1.9;              // light in the trace
  col += vec3f(0.10, 0.55, 0.50) * halo * live * 0.30;            // bleed onto the board
  col += vec3f(1.00, 0.42, 0.62) * halo * pow(hot, 1.5) * 0.55;   // pink where it saturates

  col = filmic(col * 1.3);
  col *= 0.55 + 0.45 * smoothstep(1.35, 0.10, length((uv - 0.5) * vec2f(1.1, 1.0)));
  return vec4f(col + dither(uv, params.res), 1.0);
}
