// Draw the lido from above: a pale stone deck, a bullnose coping, and the
// pool, whose tiled floor is laced with caustics. The light a patch of water
// sends to the floor is focused by how the surface curves there, so the
// brightness is the inverse of how much the surface's refraction stretches
// area: 1 / det(I - D * Hessian).
import { hash21 } from "../../shaders/common.wgsl";

struct View {
  texel: vec2f,
  res: vec2f,
  wall: vec4f,   // water where dot(s, wall.xy) > wall.z; wall.w: lane centre along the wall
  time: f32,
  aspect: f32,
  sun: f32,      // caustic strength
  depth: f32,    // how deep the pool reads
}
@group(0) @binding(0) var state: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> view: View;

const TILE = 0.024;
const N_WAVES = 7;

fn h(uv: vec2f) -> f32 {
  // Stored a hundred times larger, so half floats keep the fine curvature.
  return textureSampleLevel(state, samp, uv, 0.0).r * 0.01;
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbm(p: vec2f) -> f32 {
  return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.13 + 7.1) + 0.15 * vnoise(p * 4.37 - 3.3);
}

/// A sharp, tileable net of light like sun through a rippling surface: a few
/// rounds of a self-warping trig map, after the well-known Shadertoy water
/// caustic. One unit of p is one cell of the tiling.
fn net(p: vec2f, t: f32) -> f32 {
  let q = (fract(p) - 0.5) * 6.2831853 - 250.0;
  var i = q;
  var c = 1.0;
  let inten = 0.005;
  for (var k = 0; k < 4; k++) {
    let tk = t * (1.0 - 3.5 / f32(k + 1));
    i = q + vec2f(cos(tk - i.x) + sin(tk + i.y), sin(tk - i.y) + cos(tk + i.x));
    c += 1.0 / length(vec2f(q.x / (sin(i.x + tk) / inten), q.y / (cos(i.y + tk) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 2.0);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = view.aspect;
  let s = vec2f(uv.x * aspect, 1.0 - uv.y);
  let px = 1.0 / max(view.res.y, 1.0);
  let n = view.wall.xy;
  let perp = vec2f(-n.y, n.x);
  let w = dot(s, n) - view.wall.z;

  // Wind waves: a few gentle travelling sines. They only wobble the floor and
  // nudge the caustic net; the net itself comes from net() below.
  let dirs = array<f32, N_WAVES>(0.3, 1.25, 2.2, 2.9, 3.9, 4.7, 5.6);
  let lens = array<f32, N_WAVES>(0.19, 0.13, 0.155, 0.105, 0.17, 0.085, 0.12);
  var wave = vec2f(0.0);
  for (var i = 0; i < N_WAVES; i++) {
    let a = dirs[i];
    let k = 6.2831853 / lens[i];
    let kv = vec2f(cos(a), sin(a)) * k;
    let ph = dot(kv, s) - sqrt(k) * 0.42 * view.time + f32(i) * 1.7;
    wave += (0.9 / k) * vec2f(cos(a), sin(a)) * cos(ph);
  }

  // Ripples from the simulation. Curvature is differenced over two texels,
  // which is blind to the grid-scale chatter a wave solver leaves behind.
  let ox = vec2f(view.texel.x, 0.0);
  let oy = vec2f(0.0, view.texel.y);
  let e = view.texel.y;
  let c0 = h(uv);
  let rip = vec2f(h(uv + ox) - h(uv - ox), h(uv - oy) - h(uv + oy)) / (2.0 * e);
  let hr = h(uv + 2.0 * ox);
  let hl = h(uv - 2.0 * ox);
  let hu = h(uv - 2.0 * oy);
  let hd = h(uv + 2.0 * oy);
  let hru = h(uv + 2.0 * (ox - oy));
  let hrd = h(uv + 2.0 * (ox + oy));
  let hlu = h(uv - 2.0 * (ox + oy));
  let hld = h(uv - 2.0 * (ox - oy));
  let ie2 = 0.25 / (e * e);
  let hxx = (hr + hl - 2.0 * c0) * ie2;
  let hyy = (hu + hd - 2.0 * c0) * ie2;
  let hxy = 0.25 * (hru - hrd - hlu + hld) * ie2;
  let grad = wave + rip;

  // A ripple focuses sunlight where it is concave and spreads it where it is
  // convex: brightness is 1 / det(I - D * Hessian), so rings show as light.
  let D = 0.07 * view.depth;
  let det = (1.0 - D * hxx) * (1.0 - D * hyy) - D * D * hxy * hxy;
  let focus = clamp(1.0 / sqrt(det * det + 0.01), 0.0, 4.0);

  // The caustic net on the floor, pushed about by the ripples' slope.
  let cp = s / 0.36 + rip * 0.9 * view.depth + wave * 0.6;
  let caustic = net(cp, view.time * 0.55) * view.sun;

  // The floor, seen through the water: shifted by refraction, in tiles.
  let gu = dot(grad, n);
  let gv = dot(grad, perp);
  let fp = vec2f(w, dot(s, perp)) - vec2f(gu, gv) * 0.035 * view.depth;
  let ti = floor(fp / TILE);
  let tf = fract(fp / TILE);
  let edge = min(min(tf.x, 1.0 - tf.x), min(tf.y, 1.0 - tf.y)) * TILE;
  let grout = 1.0 - smoothstep(0.0009, 0.0009 + px * 1.2, edge);
  var tile = vec3f(0.84, 0.95, 0.96) * (0.95 + 0.07 * hash21(ti));
  // A lane line in dark tiles, with the T that tells a swimmer the wall is near.
  let lane = floor(view.wall.w / TILE) - 1.0;
  let inLane = (ti.y >= lane && ti.y <= lane + 1.0 && ti.x >= 6.0) || (ti.x >= 6.0 && ti.x <= 7.0 && ti.y >= lane - 6.0 && ti.y <= lane + 7.0);
  tile = select(tile, vec3f(0.06, 0.13, 0.30) * (0.92 + 0.12 * hash21(ti + 3.1)), inLane);
  tile = mix(tile, vec3f(0.68, 0.76, 0.78), grout * 0.8);

  // The coping throws a band of shade across the floor by the wall.
  let shade = smoothstep(0.025, 0.07, w);
  let light = 0.4 + 0.75 * shade * (0.4 + 2.2 * caustic) * focus;
  let depthHere = view.depth * (0.75 + 0.5 * smoothstep(0.0, 0.9, w));
  var pool = tile * (1.0 - exp(-light * 1.25)) * 1.25 * exp(-depthHere * vec3f(0.85, 0.2, 0.12));
  // The brightest threads of the net barely lose any colour on the way down.
  pool += vec3f(0.75, 0.95, 0.95) * 0.22 * shade * smoothstep(0.25, 1.2, caustic * focus);
  // The surface itself: sky in the slopes that face away from the sun, and a
  // little sparkle where a slope faces it.
  let toward = dot(grad, normalize(vec2f(0.6, -0.55)));
  pool += vec3f(0.55, 0.75, 0.85) * 0.25 * smoothstep(0.02, 0.18, -toward);
  pool += vec3f(1.0, 0.98, 0.92) * 0.45 * smoothstep(0.22, 0.4, toward);

  // The deck: warm travertine pavers in sun, pitted and veined.
  let dp = vec2f(-w, dot(s, perp));
  let pv = dp / vec2f(0.34, 0.22);
  let pid = floor(pv + vec2f(0.0, floor(pv.x) * 0.5));
  let pf = fract(pv + vec2f(0.0, floor(pv.x) * 0.5));
  let pe = min(min(pf.x * 0.34, (1.0 - pf.x) * 0.34), min(pf.y * 0.22, (1.0 - pf.y) * 0.22));
  let joint = 1.0 - smoothstep(0.0012, 0.0012 + px * 1.5, pe);
  let vein = fbm(dp * vec2f(9.0, 40.0) + hash21(pid) * 20.0);
  let pits = smoothstep(0.88, 0.95, vnoise(dp * 180.0 + hash21(pid) * 50.0));
  var deck = vec3f(0.93, 0.88, 0.80) * (0.93 + 0.08 * hash21(pid)) * (0.93 + 0.1 * vein);
  deck *= 1.0 - 0.1 * pits;
  deck *= 1.0 - 0.3 * joint;

  // The coping: a rounded stone lip along the water, lit from above.
  let cw = 0.034;
  let k = clamp(-w / cw, 0.0, 1.0);
  let lip = smoothstep(0.0, 0.25, k) * (1.0 - smoothstep(0.85, 1.0, k));
  let round = mix(0.78, 1.06, smoothstep(0.0, 0.55, k));
  let coping = vec3f(0.95, 0.92, 0.86) * round * (0.96 + 0.06 * vein);
  deck = select(deck, coping * mix(0.86, 1.0, lip), -w < cw);
  deck *= 1.0 - 0.45 * (1.0 - smoothstep(0.0, 1.5 * px, abs(-w - cw)));

  let wmask = smoothstep(-px, px, w);
  var col = mix(deck, pool, wmask);
  col *= 1.0 - 0.08 * dot(uv - 0.5, uv - 0.5);
  col += (hash21(uv * view.res + fract(view.time) * 17.0) - 0.5) / 255.0;
  return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0);
}
