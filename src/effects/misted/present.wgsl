// Draw the window: a city at night behind glass. Where the glass is clear the
// lights are crisp bokeh; where it is fogged they spread into a soft glow and
// the surface is beaded with tiny droplets. Wiped edges gather water.
import { filmic, dither } from "../../shaders/common.wgsl";

struct View {
  texel: vec2f,
  time: f32,
  drips: f32,
  aspect: f32,
  _pad: f32,
}
@group(0) @binding(0) var state: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> view: View;

struct Lit {
  sharp: vec3f,
  soft: vec3f,
}

fn hash11(n: f32) -> f32 {
  return fract(sin(n * 127.1) * 43758.5453);
}

fn hash22(p: vec2f) -> vec2f {
  let q = vec2f(dot(p, vec2f(127.1, 311.7)), dot(p, vec2f(269.5, 183.3)));
  return fract(sin(q) * 43758.5453);
}

/// The same drip path the step pass clears, so the bead sits on its trail.
fn dripHead(col: f32, cols: f32, t: f32) -> vec2f {
  let h = hash11(col * 1.7 + 3.0);
  let speed = 0.035 + 0.07 * hash11(col * 3.1 + 9.0);
  let y = fract(t * speed + h) * 2.6 - 0.25;
  let lurch = y + 0.02 * sin(y * 40.0 + h * 30.0);
  let x = (col + 0.5 + 0.28 * sin(y * 11.0 + h * 50.0)) / cols;
  return vec2f(x, lurch);
}

fn tint(h: f32) -> vec3f {
  if (h < 0.42) { return vec3f(1.0, 0.56, 0.22); } // sodium
  if (h < 0.70) { return vec3f(1.0, 0.86, 0.68); } // warm white
  if (h < 0.84) { return vec3f(1.0, 0.20, 0.14); } // tail lights
  if (h < 0.95) { return vec3f(0.30, 0.78, 0.98); } // shop signs
  return vec3f(0.98, 0.34, 0.72); // one neon
}

/// One layer of lights on a jittered grid. Each light is a crisp bokeh disc
/// for the clear glass and a wide glow for the fogged glass, computed together.
fn layer(p: vec2f, scale: f32, seed: f32, drift: f32, gain: f32, density: f32) -> Lit {
  let q = p * scale + vec2f(view.time * drift, seed * 13.0);
  let cell = floor(q);
  var out = Lit(vec3f(0.0), vec3f(0.0));
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let id = cell + vec2f(f32(i), f32(j));
      let h = hash22(id + seed);
      // Lights crowd toward the street and thin out up in the towers.
      let wy = (id.y - seed * 13.0 + 0.5) / scale;
      let keep = density * smoothstep(0.75, -0.35, wy);
      if (h.x > keep) { continue; }
      let pos = id + 0.5 + (hash22(id + seed + 7.0) - 0.5) * 0.7;
      let d = length(q - pos);
      // Fewer, dimmer lights in the lower left, where the title sits.
      let world = (pos - vec2f(view.time * drift, seed * 13.0)) / scale;
      let corner = vec2f(-0.5 * view.aspect, -0.5);
      let calm = smoothstep(0.2, 0.8, length((world - corner) * vec2f(0.8, 1.2)));
      let c = tint(h.y) * gain * mix(0.25, 1.0, calm) * (0.4 + 0.9 * hash11(h.x * 91.0 + seed));
      let r = 0.15 + 0.15 * h.y;
      // A bokeh disc with a faintly brighter rim, the way lens blur renders a point.
      let disc = smoothstep(r, r * 0.8, d) * (0.75 + 0.35 * smoothstep(r * 0.4, r, d));
      out.sharp += c * (disc * 1.25 + 0.16 * exp(-d * d / (r * r * 6.0)));
      out.soft += c * 0.32 * exp(-d * d / 0.16);
    }
  }
  return out;
}

/// A skyline of towers with lit windows, behind the street lights. Returns the
/// crisp facade and, in w, what the fog makes of it: an even warm glow.
fn towers(p: vec2f) -> vec4f {
  let w = 0.085;
  let strip = floor(p.x / w);
  let h = hash22(vec2f(strip, 4.0));
  let top = -0.12 + 0.62 * h.x * h.x + 0.06 * h.y;
  let inside = smoothstep(top + 0.002, top - 0.002, p.y);
  // Windows: a grid per tower, each lit or dark, some warm, some cool.
  let cell = vec2f(0.0085, 0.0125);
  let q = (p - vec2f(strip * w, 0.0)) / cell;
  let wc = floor(q);
  let wh = hash22(wc + strip * 17.0);
  let frame = step(abs(fract(q.x) - 0.5), 0.3) * step(abs(fract(q.y) - 0.5), 0.28);
  let edge = step(1.0, wc.x) * step(wc.x, w / cell.x - 2.0);
  let litFrac = 0.18 + 0.4 * h.y;
  let lit = step(wh.x, litFrac) * frame * edge;
  let warm = mix(vec3f(1.0, 0.72, 0.42), vec3f(0.7, 0.85, 1.0), step(0.8, wh.y));
  let facade = vec3f(0.018, 0.02, 0.032) + warm * lit * (0.35 + 0.5 * wh.y);
  return vec4f(facade * inside, 0.0);
}

/// What fog makes of the towers: their average window light, blurred across
/// neighbouring towers so no edge survives.
fn towerGlow(p: vec2f) -> f32 {
  var g = 0.0;
  for (var k = -2; k <= 2; k++) {
    let x = p.x + f32(k) * 0.03;
    let h = hash22(vec2f(floor(x / 0.085), 4.0));
    let top = -0.12 + 0.62 * h.x * h.x + 0.06 * h.y;
    g += (0.18 + 0.4 * h.y) * smoothstep(top + 0.06, top - 0.08, p.y);
  }
  return g * 0.2 * 0.09;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let asp = vec2f(view.aspect, 1.0);
  let p = vec2f((uv.x - 0.5) * view.aspect, 0.5 - uv.y);
  let res = 1.0 / view.texel;

  let clear = textureSampleLevel(state, samp, uv, 0.0).r;
  let fog = 1.0 - smoothstep(0.08, 0.75, clear);

  // The night behind the glass.
  var bg = mix(vec3f(0.012, 0.014, 0.03), vec3f(0.05, 0.03, 0.045), smoothstep(0.5, -0.5, p.y));
  bg += vec3f(0.10, 0.05, 0.025) * smoothstep(-0.1, -0.6, p.y);
  let far = layer(p, 13.0, 1.0, 0.0, 0.55, 0.55);
  let mid = layer(p, 6.0, 2.0, 0.05, 0.9, 0.45);
  let near = layer(p, 2.6, 3.0, -0.07, 1.25, 0.35);
  let city = towers(p);
  let backdrop = select(bg, city.rgb, dot(city.rgb, vec3f(1.0)) > 0.0);
  let sharp = backdrop + far.sharp * 0.8 + mid.sharp + near.sharp;
  let soft = bg * 0.8 + vec3f(1.0, 0.7, 0.45) * towerGlow(p) + far.soft * 0.8 + mid.soft + near.soft;
  let glow = dot(soft, vec3f(0.3, 0.5, 0.2));

  // Fogged glass scatters the light into a pale haze that glows where the
  // city is bright behind it.
  var misted = soft * 0.85 + vec3f(0.03, 0.034, 0.045) + vec3f(0.85, 0.88, 0.95) * glow * 0.16;

  // Tiny droplets bead the fog. Each one is a little lens: brighter, with a
  // glint on its upper side and a dark edge.
  let g = p * 150.0;
  let gc = floor(g);
  let gh = hash22(gc + 5.0);
  let gd = length(g - gc - 0.5 - (gh - 0.5) * 0.5);
  let rr = 0.16 + 0.22 * gh.x;
  let bead = smoothstep(rr, rr - 0.08, gd);
  let glint = smoothstep(0.12, 0.0, length(g - gc - 0.5 - (gh - 0.5) * 0.5 - vec2f(-0.3, 0.3) * rr));
  misted = mix(misted, soft * 1.35 + 0.02, bead * 0.6);
  misted += vec3f(0.8, 0.85, 1.0) * glint * bead * (0.06 + glow * 0.8);

  var col = mix(sharp, misted, fog);

  // Water gathers along the edge of a wipe, so the boundary reads as wet.
  let ridge = smoothstep(0.08, 0.3, clear) * smoothstep(0.7, 0.35, clear);
  col += (soft * 0.5 + 0.025) * ridge * (0.4 + 0.8 * bead);

  // Drip beads, each sitting on the head of its own clear trail.
  let cols = max(10.0, floor(26.0 * view.aspect));
  let dc = floor(uv.x * cols);
  if (hash11(dc * 5.3 + 1.0) < 0.22 * view.drips) {
    let head = dripHead(dc, cols, view.time);
    let dd = (uv - head) * asp;
    let drop = smoothstep(0.0075, 0.005, length(dd * vec2f(1.0, 0.8)));
    let spec = smoothstep(0.0028, 0.0, length(dd - vec2f(-0.002, -0.0025)));
    col = mix(col, sharp * 1.4 + 0.03, drop * 0.85) + vec3f(0.9) * spec * 0.8;
  }

  col *= 1.0 - 0.45 * dot(uv - 0.5, uv - 0.5);
  col = filmic(col * 1.1);
  col += dither(uv, res);
  return vec4f(col, 1.0);
}
