// The pond from above. Stones and weed on the bottom with the sun's caustics,
// the koi over them, each drawn from its swimming spine as a body with fins,
// eyes, scales and its variety's markings, tinted and softened by how deep it
// swims and bent by the ripples above. Then the surface: the sky and the
// trees overhead reflected faintly, glints of sun on the ripples, and what
// floats on top: lily pads, ginkgo leaves and the food.
import { hash21 } from "../../shaders/common.wgsl";

struct View {
  res: vec2f,
  aspect: f32,
  time: f32,
  nFish: f32,
  nItems: f32,
  light: f32,
  _p0: f32,
  spine: array<vec4f, 50>,  // ten points per fish, two per entry, head first
  fishA: array<vec4f, 10>,  // length, half width, pattern seed, depth 0..1
  fishB: array<vec4f, 10>,  // variety, fin phase, speed, gulp
  itemA: array<vec4f, 12>,  // x, y, rotation, size
  itemB: array<vec4f, 12>,  // kind (0 pad, 1 ginkgo, 2 lily flower), seed, 0, alive
  food: array<vec4f, 8>,    // x, y, fade in, alive
}
@group(0) @binding(0) var water: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> view: View;

const SUN = vec2f(-0.55, 0.65);
const WATER = vec3f(0.05, 0.085, 0.07);

var<private> px: f32;

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2f(1.0, 0.0)), u.x), mix(hash21(i + vec2f(0.0, 1.0)), hash21(i + vec2f(1.0, 1.0)), u.x), u.y);
}

/// One layer of sunlight focused by the surface: the borders of a slowly
/// moving cell pattern, warped so they wander, which is the shape real
/// caustic nets take.
fn causLayer(p: vec2f, t: f32) -> f32 {
  let q = p + 0.35 * vec2f(vnoise(p * 0.9 + t * 0.2), vnoise(p * 0.9 - t * 0.17 + 7.0));
  let ci = floor(q);
  var f1 = 9.0;
  var f2 = 9.0;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let c = ci + vec2f(f32(i), f32(j));
      let h = vec2f(hash21(c + 31.0), hash21(c + 57.0));
      let o = c + 0.5 + 0.38 * sin(t * (0.6 + 0.5 * h) + 6.2831853 * h) - q;
      let d = dot(o, o);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
  }
  return exp(-(sqrt(f2) - sqrt(f1)) * 9.0);
}

/// Sunlight on the bottom: two layers of caustics, strongest where they cross.
fn caustics(p: vec2f, t: f32) -> f32 {
  let a = causLayer(p, t);
  let b = causLayer(p * 1.37 + 4.1, t * 1.13);
  return a * 0.7 + b * 0.5 + a * b * 1.6;
}

fn heightAt(uv: vec2f) -> f32 {
  return textureSampleLevel(water, samp, uv, 0.0).r;
}

fn pt(f: i32, k: i32) -> vec2f {
  let v = view.spine[f * 5 + k / 2];
  return select(v.zw, v.xy, k % 2 == 0);
}

/// Nearest point on a fish's spine: along (0 nose, 1 tail root, beyond is
/// the tail fin), signed distance across, and the distance itself.
fn spineHit(f: i32, p: vec2f) -> vec3f {
  var best = 1e9;
  var s = 0.0;
  var lat = 0.0;
  for (var k = 0; k < 9; k++) {
    let a = pt(f, k);
    let b = pt(f, k + 1);
    let ab = b - a;
    let l2 = max(dot(ab, ab), 1e-10);
    let hmax = select(1.0, 3.0, k == 8);
    let h = clamp(dot(p - a, ab) / l2, 0.0, hmax);
    let o = p - (a + ab * h);
    let d = dot(o, o);
    if (d < best) {
      best = d;
      s = (f32(k) + h) / 9.0;
      let dir = ab * inverseSqrt(l2);
      lat = dir.x * o.y - dir.y * o.x;
    }
  }
  return vec3f(s, lat, sqrt(best));
}

fn bodyHalf(s: f32, W: f32) -> f32 {
  return W * sqrt(clamp(s / 0.16, 0.0, 1.0)) * (1.0 - 0.66 * smoothstep(0.3, 0.95, s));
}

fn tailHalf(s: f32, W: f32) -> f32 {
  return W * (0.2 + 0.95 * smoothstep(0.88, 1.14, s));
}

fn tailEnd(lat: f32, W: f32) -> f32 {
  // Two lobes with a notch between them.
  return 1.12 + 0.08 * smoothstep(0.15, 1.0, abs(lat) / (W * 1.15));
}

/// The colour of a koi's skin at body coordinates, by variety.
fn skin(variety: f32, s: f32, u: f32, seed: f32, L: f32, W: f32) -> vec3f {
  let white = vec3f(0.93, 0.9, 0.84);
  let red = vec3f(0.8, 0.16, 0.06);
  let black = vec3f(0.045, 0.045, 0.05);
  let q = vec2f(s * 6.5, u * 1.5) + seed;
  let n = vnoise(q) * 0.62 + vnoise(q * 2.3 + 4.0) * 0.38;
  let blot = smoothstep(0.47, 0.53, n) * smoothstep(0.03, 0.08, s);
  let spots = smoothstep(0.74, 0.79, vnoise(vec2f(s * 16.0, u * 4.0) + seed * 1.7)) * step(0.22, s);
  let v = i32(variety + 0.5);
  switch v {
    case 1: { return mix(mix(white, red, blot), black, spots * (1.0 - blot * 0.4)); }
    case 2: {
      let w2 = smoothstep(0.58, 0.64, vnoise(q * 0.9 + 9.0));
      return mix(mix(black, red, smoothstep(0.42, 0.48, n)), white, w2 * (1.0 - blot));
    }
    case 3: { return vec3f(0.96, 0.68, 0.2); }
    case 4: { return vec3f(0.86, 0.86, 0.82); }
    case 5: { return vec3f(0.52, 0.34, 0.19); }
    case 6: {
      let d = length(vec2f((s - 0.1) * L, u * W) / (W * 0.55));
      return mix(red, white, smoothstep(0.92, 1.02, d));
    }
    case 7: {
      let side = smoothstep(0.55, 0.75, abs(u)) + smoothstep(0.12, 0.05, s);
      return mix(vec3f(0.36, 0.45, 0.56), vec3f(0.78, 0.3, 0.12), clamp(side, 0.0, 1.0));
    }
    default: { return mix(white, red, blot); }
  }
}

/// One koi over what is behind it.
fn drawFish(f: i32, p0: vec2f, slope: vec2f, under: vec3f, sun: f32) -> vec3f {
  let A = view.fishA[f];
  let B = view.fishB[f];
  let L = A.x;
  let W = A.y;
  let depth = A.w;
  // Deeper fish are bent more by the ripples above them.
  let p = p0 + slope * (0.004 + 0.012 * depth);
  if (length(p - pt(f, 5)) > L * 0.85) { return under; }
  let hit = spineHit(f, p);
  let s = hit.x;
  let lat = hit.y;
  let soft = px * (1.0 + 4.0 * depth);
  let metal = select(0.0, 1.0, B.x > 2.5 && B.x < 4.5);

  var col = under;
  // Pectoral fins: broad translucent paddles swept back from behind the
  // head, sculling slowly.
  let sw = 0.5 + 0.25 * sin(B.y);
  let fa = normalize(vec2f(sw, 1.0));
  let fd = vec2f((s - 0.19) * L, abs(lat) - bodyHalf(0.19, W) * 0.7);
  let fx = dot(fd, fa);
  let fy = fa.x * fd.y - fa.y * fd.x;
  let Lf = L * 0.2;
  if (fx > -L * 0.02 && fx < Lf * 1.1) {
    let tt = clamp(fx / Lf, 0.0, 1.0);
    let hw = L * (0.018 + 0.05 * sqrt(tt)) * sqrt(max(0.0, 1.0 - pow(tt, 6.0)));
    let into = min(hw - abs(fy), fx + L * 0.01);
    let a = clamp(into / soft + 0.5, 0.0, 1.0);
    if (a > 0.0) {
      let rays = 1.0 - 0.12 * smoothstep(0.3, 1.0, sin(atan2(fy, fx + L * 0.03) * 40.0));
      var fc = mix(skin(B.x, 0.2, sign(lat) * 0.9, A.z, L, W), vec3f(0.92, 0.9, 0.86), 0.35 + 0.4 * tt) * rays;
      // Showa and sanke carry black at the fin root.
      fc = mix(fc, vec3f(0.04), select(0.0, 0.8, B.x > 0.5 && B.x < 2.5) * smoothstep(0.35, 0.1, tt));
      fc = mix(fc, WATER, depth * 0.5);
      col = mix(col, fc, a * (0.55 - 0.3 * tt));
    }
  }
  // Tail fin: two soft lobes, thinning to almost clear at the edge.
  if (s > 0.85) {
    let tw = tailHalf(s, W);
    let into = min((tw - abs(lat)), (tailEnd(lat, W) - s) * L);
    let a = clamp(into / soft + 0.5, 0.0, 1.0);
    if (a > 0.0) {
      let rays = 1.0 - 0.1 * smoothstep(0.4, 1.0, sin(lat / W * 26.0 / max(s - 0.8, 0.05) * 0.3));
      let tt = smoothstep(0.88, 1.18, s);
      var fc = mix(skin(B.x, 0.95, lat / W, A.z, L, W), vec3f(0.92, 0.9, 0.86), 0.3 + 0.4 * tt) * rays;
      fc = mix(fc, WATER, depth * 0.5);
      col = mix(col, fc, a * (0.62 - 0.38 * tt));
    }
  }
  // The body.
  let w = bodyHalf(s, W);
  let cov = clamp((w - hit.z) / soft + 0.5, 0.0, 1.0) * step(s, 0.999);
  if (cov > 0.0) {
    let u = lat / max(w, 1e-5);
    var c = skin(B.x, s, u, A.z, L, W);
    // Scales: a net of fine arcs, stronger on the scaled varieties.
    let g = vec2f(s * L, lat) / (W * 0.2);
    let cell = fract(vec2f(g.x, g.y + 0.5 * floor(g.x))) - 0.5;
    let scale = smoothstep(0.32, 0.5, length(cell));
    c *= 1.0 - scale * select(0.035, 0.1, (B.x > 4.5 && B.x < 5.5) || B.x > 6.5);
    // Rounded back, wet sheen along the spine, dorsal fin, eyes.
    let nz = sqrt(max(0.0, 1.0 - u * u));
    c *= 0.5 + 0.5 * nz;
    let sheen = exp(-pow(u + 0.18, 2.0) * 22.0) * (0.18 + 0.5 * metal) * smoothstep(0.05, 0.2, s);
    c += vec3f(1.0, 0.97, 0.9) * sheen;
    c *= 1.0 - 0.18 * smoothstep(W * 0.1, W * 0.04, abs(lat)) * step(0.33, s) * step(s, 0.78);
    let eye = length(vec2f((s - 0.075) * L, abs(lat) - bodyHalf(0.075, W) * 0.62)) / (W * 0.12);
    c = mix(c, vec3f(0.02, 0.02, 0.025), clamp((1.0 - eye) * W * 0.12 / soft + 0.5, 0.0, 1.0));
    // Sun through the ripples dapples the back of a shallow fish.
    c *= 0.88 + 0.28 * min(sun, 1.5) * (1.0 - depth) * view.light;
    // Depth: deeper fish sink into the green.
    c = mix(c, WATER * 1.4, depth * 0.55) * (1.0 - 0.25 * depth);
    col = mix(col, c, cov);
  }
  return col;
}

/// How much a fish's body shades the bottom.
fn fishShadow(f: i32, p: vec2f) -> f32 {
  let A = view.fishA[f];
  let L = A.x;
  let W = A.y;
  let lift = 1.0 - A.w;
  let q = p - SUN * (0.012 + 0.05 * lift);
  if (length(q - pt(f, 5)) > L * 0.85) { return 0.0; }
  let hit = spineHit(f, q);
  let soft = 0.003 + 0.02 * lift;
  let w = select(bodyHalf(hit.x, W), tailHalf(hit.x, W), hit.x > 0.9);
  let lim = select(1.0, tailEnd(hit.y, W), hit.x > 0.9);
  return smoothstep(soft, -soft, select(hit.z, abs(hit.y), hit.x > 0.9) - w) * step(hit.x, lim) * (0.55 - 0.25 * lift);
}

/// A floating item's outline: lily pad or ginkgo leaf. Returns signed
/// distance (negative inside) and the local position.
fn itemShape(i: i32, p: vec2f) -> vec3f {
  let A = view.itemA[i];
  let c = cos(A.z);
  let s = sin(A.z);
  let o = p - A.xy;
  let q = vec2f(c * o.x + s * o.y, -s * o.x + c * o.y);
  let r = A.w;
  if (view.itemB[i].x < 0.5) {
    // A lily pad: a disc with a narrow slit to its centre.
    var d = length(q) - r;
    let slit = max(abs(q.y) - (0.02 * r + q.x * 0.12), -q.x);
    d = max(d, -slit);
    return vec3f(d, q);
  }
  if (view.itemB[i].x > 1.5) {
    // A water lily in flower: two rings of pointed petals.
    let a = atan2(q.y, q.x);
    let pet = pow(abs(cos(a * 4.0)), 0.7);
    let pet2 = pow(abs(cos(a * 4.0 + 0.785)), 0.7);
    let d = length(q) - r * max(0.35 + 0.65 * pet, 0.3 + 0.55 * pet2);
    return vec3f(d, q);
  }
  // A ginkgo leaf: a fan with a notch, on a short stem.
  let a = atan2(q.x, q.y);
  let rr = length(q);
  let rim = r * (0.95 - 0.2 * exp(-a * a * 50.0));
  var d = max(rr - rim, abs(a) - 0.85);
  d = max(d, r * 0.1 - rr * (1.0 + abs(a)));
  let stem = max(abs(q.x) - r * 0.03, abs(q.y + r * 0.17) - r * 0.17);
  d = min(d, stem);
  return vec3f(d, q);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let a = view.aspect;
  px = 1.0 / view.res.y;
  let p = vec2f(uv.x * a, 1.0 - uv.y);
  let t = view.time;
  let light = view.light;

  // The surface's slope from the ripple heights.
  let ts = 1.0 / vec2f(textureDimensions(water));
  let hx = heightAt(uv + vec2f(ts.x, 0.0)) - heightAt(uv - vec2f(ts.x, 0.0));
  let hy = heightAt(uv - vec2f(0.0, ts.y)) - heightAt(uv + vec2f(0.0, ts.y));
  let slope = vec2f(hx, hy) * 0.6;

  // The bottom: rounded river stones, weed and caustics, seen through the ripples.
  let pb = p + slope * 0.03;
  // Pebbles of mixed size and stone, each a low dome lit from the sun's side.
  let warp = vec2f(vnoise(pb * 7.0), vnoise(pb * 7.0 + 5.0)) - 0.5;
  let cellP = pb / 0.042 + warp * 0.6;
  let ci = floor(cellP);
  var f1 = 9.0;
  var f2 = 9.0;
  var id = vec2f(0.0);
  var off = vec2f(0.0);
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let c = ci + vec2f(f32(i), f32(j));
      let o = c + 0.5 + 0.8 * (vec2f(hash21(c), hash21(c + 7.0)) - 0.5) - cellP;
      let d = dot(o, o);
      if (d < f1) { f2 = f1; f1 = d; id = c; off = o; } else if (d < f2) { f2 = d; }
    }
  }
  let gap = sqrt(f2) - sqrt(f1);
  let hs = hash21(id + 3.0);
  let hv = hash21(id + 9.0);
  var stone = vec3f(0.36, 0.34, 0.3);
  if (hs < 0.25) { stone = vec3f(0.45, 0.4, 0.31); }
  else if (hs < 0.45) { stone = vec3f(0.26, 0.26, 0.25); }
  else if (hs < 0.6) { stone = vec3f(0.42, 0.32, 0.24); }
  else if (hs < 0.75) { stone = vec3f(0.5, 0.48, 0.43); }
  stone *= 0.8 + 0.35 * hv;
  stone *= 0.88 + 0.24 * vnoise(pb * 90.0 + hs * 20.0);
  // Round pebbles, each a low dome lit from the sun's side, bedded in silt.
  let rad = 0.33 + 0.12 * hash21(id + 5.0);
  let rr = sqrt(f1) / rad;
  let inside = smoothstep(1.0, 0.82, rr) * smoothstep(0.0, 0.08, gap);
  let nrm = -off / rad * 0.9;
  let lit = clamp(0.8 + dot(nrm, normalize(SUN)) * 0.7, 0.3, 1.4);
  let silt = vec3f(0.2, 0.19, 0.14) * (0.8 + 0.3 * vnoise(pb * 40.0));
  var bottom = mix(silt * 0.85, stone * lit, inside);
  // A film of algae and silt, thicker in the hollows.
  let film = smoothstep(0.35, 0.8, vnoise(pb * 4.0 + 2.0) * 0.7 + (1.0 - inside) * 0.3);
  bottom = mix(bottom, vec3f(0.16, 0.2, 0.08), film * 0.6);
  // Seen through half a metre of water: softer, greener, flatter.
  bottom = mix(bottom, vec3f(dot(bottom, vec3f(0.33))) * vec3f(0.8, 1.05, 0.85), 0.35);
  // The pond deepens in places, and the stones fade into green.
  let deep = smoothstep(0.3, 0.75, vnoise(pb * 1.4 + 11.0));
  let caus = caustics(pb / 0.12 + slope * 1.6, t) + length(slope) * 0.8;
  bottom *= (0.55 + caus * 1.3 * (1.0 - 0.5 * deep)) * (0.4 + 0.6 * light);
  bottom = mix(bottom, vec3f(0.03, 0.06, 0.05), 0.2 + 0.5 * deep);

  // Shadows on the bottom: the fish, and what floats.
  var shade = 0.0;
  let nf = i32(view.nFish);
  for (var f = 0; f < nf; f++) { shade = max(shade, fishShadow(f, pb)); }
  let ni = i32(view.nItems);
  for (var i = 0; i < ni; i++) {
    let sh = itemShape(i, pb - SUN * 0.07);
    shade = max(shade, smoothstep(0.012, -0.012, sh.x) * 0.6);
  }
  var col = bottom * (1.0 - shade);
  col = mix(col, WATER, 0.2);

  // The koi, deepest first.
  for (var f = 0; f < nf; f++) { col = drawFish(f, p, slope, col, caus); }

  // The surface: sky and trees reflected faintly, and the sun glinting.
  let n = normalize(vec3f(-slope * 3.0, 1.0));
  let canopy = smoothstep(0.4, 0.75, vnoise(p * 2.2 + n.xy * 2.0 + 1.0)) * smoothstep(0.25, 0.95, p.y + 0.2 * sin(p.x * 2.0));
  let sky = mix(vec3f(0.55, 0.62, 0.66), vec3f(0.04, 0.06, 0.04), canopy);
  let fres = 0.03 + 0.5 * pow(1.0 - n.z, 2.0);
  col = mix(col, sky, fres);
  let H = normalize(vec3f(SUN * 0.6, 1.0) + vec3f(0.0, 0.0, 1.0));
  let glint = pow(max(dot(n, H), 0.0), 900.0) * 3.0 + pow(max(dot(n, H), 0.0), 120.0) * 0.08;
  col += vec3f(1.0, 0.96, 0.86) * glint * light * (1.0 - canopy * 0.8);

  // Floating on top: pads and leaves ride the ripples a little.
  let pf = p + slope * 0.004;
  for (var i = 0; i < ni; i++) {
    let sh = itemShape(i, pf);
    let cov = clamp(-sh.x / px + 0.5, 0.0, 1.0);
    // A dark wet line where the water meets the edge.
    col *= 1.0 - 0.25 * smoothstep(0.006, 0.0, sh.x) * (1.0 - cov);
    if (cov <= 0.0) { continue; }
    let q = sh.yz;
    let r = view.itemA[i].w;
    let sd = view.itemB[i].y;
    var c: vec3f;
    if (view.itemB[i].x < 0.5) {
      let ang = atan2(q.y, q.x);
      let rr = length(q) / r;
      let veins = 1.0 - 0.18 * smoothstep(0.82, 1.0, cos(ang * 21.0 + sin(rr * 6.0) * 0.4)) * smoothstep(0.1, 0.3, rr);
      c = mix(vec3f(0.09, 0.2, 0.07), vec3f(0.2, 0.33, 0.1), 0.5 + 0.5 * vnoise(q / r * 3.0 + sd));
      c = mix(c, vec3f(0.42, 0.33, 0.12), smoothstep(0.6, 0.85, vnoise(q / r * 2.0 + sd * 3.0)) * 0.6);
      c *= veins;
      c += vec3f(0.18, 0.24, 0.12) * smoothstep(0.86, 0.99, rr);
      c += vec3f(0.5, 0.55, 0.45) * pow(max(0.0, 1.0 - length(q / r - vec2f(-0.3, 0.35)) * 1.3), 3.0) * 0.35 * light;
    } else if (view.itemB[i].x > 1.5) {
      let ang = atan2(q.y, q.x);
      let rr = length(q) / r;
      let pet = pow(abs(cos(ang * 4.0)), 0.7);
      let pet2 = pow(abs(cos(ang * 4.0 + 0.785)), 0.7);
      // The inner ring stands over the outer, and each petal is paler at its tip.
      let inner = step(0.35 + 0.65 * pet, 0.3 + 0.55 * pet2 + 0.001);
      let along = rr / max(select(0.35 + 0.65 * pet, 0.3 + 0.55 * pet2, inner > 0.5), 0.3);
      c = mix(vec3f(0.92, 0.5, 0.62), vec3f(0.99, 0.9, 0.92), smoothstep(0.2, 1.0, along));
      c *= 0.82 + 0.18 * select(pet, pet2, inner > 0.5) + 0.1 * inner;
      c = mix(c, vec3f(1.0, 0.78, 0.15), smoothstep(0.2, 0.12, rr));
      c *= 0.55 + 0.45 * light;
    } else {
      let ang = atan2(q.x, q.y);
      let veins = 1.0 - 0.12 * smoothstep(0.7, 1.0, sin(ang * 60.0));
      c = mix(vec3f(0.95, 0.72, 0.12), vec3f(0.85, 0.5, 0.08), vnoise(q / r * 3.0 + sd)) * veins;
      c *= 0.85 + 0.15 * smoothstep(0.0, r, length(q));
    }
    col = mix(col, c, cov);
  }
  // Food pellets.
  for (var i = 0; i < 8; i++) {
    let fd = view.food[i];
    if (fd.w < 0.5) { continue; }
    let d = length(pf - fd.xy) - 0.0042 * fd.z;
    let cov = clamp(-d / px + 0.5, 0.0, 1.0);
    let hl = smoothstep(0.003, 0.0, length(pf - fd.xy + vec2f(0.0012, -0.0012)));
    col = mix(col, vec3f(0.36, 0.22, 0.1) + vec3f(0.3) * hl, cov);
  }

  // A soft vignette, and dither.
  col *= 1.0 - 0.35 * smoothstep(0.3, 0.9, length((uv - 0.5) * vec2f(1.0, 1.1)) * 1.25);
  col = pow(col, vec3f(0.95));
  col += (hash21(uv * view.res) - 0.5) / 255.0;
  return vec4f(col, 1.0);
}
