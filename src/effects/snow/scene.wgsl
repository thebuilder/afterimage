// The bench seen from above: teak slats under a fresh fall of snow, a low
// winter sun throwing the long blue shadow of a bare tree across it, snow
// still falling, a few dry leaves, and whatever a fingertip has written.
import { GAP, benchXY, gfbm, ghash, gnoise, slat } from "./bench.wgsl";
import { filmic } from "../../shaders/common.wgsl";

struct View {
  res: vec2f,
  aspect: f32,
  time: f32,
  sun: vec4f,      // direction toward the sun (unit), strength
  finger: vec4f,   // fingertip x, y, radius, how present its shadow is
  crown: vec4f,    // bounding box of the tree's shadow: min x, min y, max x, max y
  seg: array<vec4f, 64>,   // tree shadow segments: a.xy, b.xy (already cast onto the bench)
  segW: array<vec4f, 64>,  // their radii at a and b, and penumbra at a and b
  flake: array<vec4f, 40>, // x, y, height above the snow, size
  leaf: array<vec4f, 4>,   // x, y, turn, size
  depth: f32,      // snow thickness, screen heights
  flakes: f32,     // how many flakes are live
  _p0: f32,
  _p1: f32,
}
@group(0) @binding(0) var state: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> view: View;

const GAP_H: f32 = -0.06;

fn toUv(p: vec2f) -> vec2f {
  return vec2f(p.x / view.aspect, 1.0 - p.y);
}

/// Snow depth as seen: what is left after digging, plus the ridge of pushed
/// snow just outside a trench, where the blurred dug-out amount exceeds
/// what was dug right there.
fn snowD(p: vec2f) -> f32 {
  let v = textureSampleLevel(state, samp, toUv(p), 0.0);
  let dug = max(v.g - v.r, 0.0);
  return v.r + 0.6 * max(v.b - dug, 0.0);
}

fn heightAt(p: vec2f) -> f32 {
  return select(GAP_H, snowD(p) * view.depth, slat(p).x > 0.0);
}

fn cover(d: f32, w: f32) -> f32 {
  return clamp(0.5 - d / w, 0.0, 1.0);
}

fn sunColor() -> vec3f {
  return vec3f(1.0, 0.84, 0.66) * view.sun.w;
}

fn skyColor() -> vec3f {
  return vec3f(0.48, 0.6, 0.84) * 0.6;
}

/// Sun visibility over the bench's own relief: slat edges, trenches, heaps.
fn reliefShadow(p: vec2f, h0: f32) -> f32 {
  let L = view.sun.xyz;
  let lxy = normalize(L.xy);
  let slope = L.z / max(length(L.xy), 1e-4);
  var vis = 1.0;
  var t = 0.0016;
  for (var i = 0; i < 14; i++) {
    let h = heightAt(p + lxy * t);
    let ray = h0 + t * slope;
    vis = min(vis, clamp((ray - h) / (0.0006 + t * 0.08) + 0.5, 0.0, 1.0));
    t *= 1.36;
  }
  return vis;
}

/// The shadow of a bare tree standing off screen toward the sun: every limb
/// and twig cast onto the bench along the sun's direction, the penumbra
/// widening with how high the branch is above the snow.
fn treeShadow(p: vec2f) -> f32 {
  let bb = view.crown;
  if (p.x < bb.x || p.y < bb.y || p.x > bb.z || p.y > bb.w) { return 0.0; }
  var sh = 0.0;
  for (var i = 0; i < 64; i++) {
    let s = view.seg[i];
    let w = view.segW[i];
    if (w.x <= 0.0) { continue; }
    let ab = s.zw - s.xy;
    let t = clamp(dot(p - s.xy, ab) / max(dot(ab, ab), 1e-9), 0.0, 1.0);
    let d = length(p - s.xy - ab * t);
    let r = mix(w.x, w.y, t);
    let blur = mix(w.z, w.w, t);
    // A thin twig high up casts only a faint, wide shadow.
    let strength = clamp(r / (blur * 0.6 + r), 0.0, 1.0);
    sh = max(sh, cover(d - r, blur + r * 0.3) * mix(0.35, 1.0, strength));
  }
  return sh * 0.9;
}

/// A dry leaf (stem down, unit size): its outline, below 0 inside, and veins.
fn leafShape(q: vec2f) -> vec2f {
  let r = length(q);
  let ang = atan2(q.x, q.y);
  let lobe = pow(abs(cos(ang * 2.5)), 0.55);
  let lower = smoothstep(2.2, 2.9, abs(ang));
  var edge = (0.42 + 0.58 * lobe) * (1.0 - 0.55 * lower);
  edge *= 1.0 + 0.05 * sin(ang * 34.0);
  let tip = round(ang / 1.2566) * 1.2566;
  let vein = smoothstep(0.035, 0.0, abs(sin(ang - tip)) * r) * step(r, edge * 0.92);
  let stem = smoothstep(0.03, 0.0, abs(q.x)) * step(q.y, 0.0) * step(-0.55, q.y);
  return vec2f(min(r - edge, select(1.0, -0.01, stem > 0.5)), max(vein, stem));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = vec2f(uv.x * view.aspect, 1.0 - uv.y);
  let pxw = 1.5 / view.res.y;
  let L = view.sun.xyz;
  let sl = slat(p);
  let tex = 1.0 / vec2f(textureDimensions(state));
  let e = max(tex.y, 0.0012);

  // Light blocked by things above the bench: the tree, the fingertip, flakes.
  var block = treeShadow(p);
  let off = L.xy / max(L.z, 0.1);
  if (view.finger.w > 0.0) {
    let fp = p + off * 0.03 - view.finger.xy;
    let fd = length(fp * vec2f(1.0, 0.8)) - view.finger.z * 1.1;
    block = max(block, cover(fd, 0.02) * 0.45 * view.finger.w);
  }
  let nf = i32(view.flakes);
  for (var i = 0; i < 40; i++) {
    if (i >= nf) { break; }
    let f = view.flake[i];
    let sp = p + off * f.z - f.xy;
    let fd = length(sp) - f.w * 0.8;
    block = max(block, cover(fd, f.w + f.z * 0.05) * 0.35);
  }
  let sunLit = 1.0 - block;

  var col: vec3f;
  if (sl.x <= 0.0) {
    // A gap between slats: deep, with old snow far below in the dark.
    let q = benchXY(p);
    let below = 0.55 + 0.45 * gfbm(q * 30.0);
    let inner = smoothstep(0.0, GAP * 0.45, -sl.x);
    // Snow on the ground far below, mostly in the slats' shade.
    let lit = smoothstep(0.45, 0.6, gnoise(q * vec2f(6.0, 40.0))) * 0.25;
    col = mix(vec3f(0.16, 0.12, 0.09) * 0.3, (skyColor() * 0.75 + sunColor() * lit * 0.3) * below, inner);
    // The slat's own side catches a little light at the sunward edge.
    col += sunColor() * 0.03 * smoothstep(0.004, 0.0, -sl.x) * sunLit;
  } else {
    let d = snowD(p);
    let hC = d * view.depth;
    let hx = heightAt(p + vec2f(e, 0.0)) - heightAt(p - vec2f(e, 0.0));
    let hy = heightAt(p + vec2f(0.0, e)) - heightAt(p - vec2f(0.0, e));
    // Clamp the slope at the slat edge, where the gap is a cliff.
    let g = clamp(vec2f(hx, hy) / (2.0 * e), vec2f(-3.0), vec2f(3.0));
    // Fine crystal relief.
    let micro = vec2f(gnoise(p * 900.0) - 0.5, gnoise(p * 900.0 + 7.0) - 0.5) * 0.35 + vec2f(gnoise(p * 260.0) - 0.5, gnoise(p * 260.0 + 3.0) - 0.5) * 0.25;
    let N = normalize(vec3f(-g + micro * smoothstep(0.1, 0.4, d), 1.0));
    // Hollows sit in their own shade: compare with the snow around.
    let r2 = 0.007;
    let ring = (heightAt(p + vec2f(r2, 0.0)) + heightAt(p - vec2f(r2, 0.0)) + heightAt(p + vec2f(0.0, r2)) + heightAt(p - vec2f(0.0, r2))) * 0.25;
    let cav = clamp((hC - max(ring, 0.0)) / (view.depth * 0.35), -1.0, 0.6);
    let ao = 0.72 + 0.28 * (cav + 1.0) / 1.6;
    let vis = reliefShadow(p, hC + 0.0004) * sunLit;
    // Snow: light soaks in and comes back out, so even the far side of a
    // ridge glows a little; in shade it takes the blue of the sky.
    let wrap = clamp((dot(N, L) + 0.25) / 1.25, 0.0, 1.0);
    var snow = vec3f(0.93, 0.94, 0.96) * (sunColor() * wrap * vis + skyColor() * ao * (0.6 + 0.4 * N.z));
    // Light scattered deep in a trench comes out blue.
    snow += vec3f(0.12, 0.3, 0.6) * 0.18 * (1.0 - smoothstep(0.1, 0.9, d)) * (0.4 + 0.6 * vis);
    // Glints: a few crystals turned just right flash white.
    let gc = floor(p / 0.0021);
    let gh = ghash(gc);
    let gpos = (gc + 0.2 + 0.6 * vec2f(ghash(gc + 3.1), ghash(gc + 5.7))) * 0.0021;
    let gn = normalize(vec3f(ghash(gc + 1.3) - 0.5, ghash(gc + 2.9) - 0.5, 0.35));
    let refl = reflect(-L, gn);
    let tw = 0.55 + 0.45 * sin(view.time * (0.7 + gh * 1.4) + gh * 40.0);
    let glint = pow(max(refl.z, 0.0), 60.0) * step(0.7, gh) * smoothstep(0.0012, 0.0003, length(p - gpos)) * vis * tw;
    snow += sunColor() * glint * 2.5 * smoothstep(0.2, 0.5, d);

    // Where the snow is thin the wood shows through, wet and dark.
    let q = benchXY(p);
    let grain = gnoise(vec2f(q.x * 14.0, q.y * 420.0)) * 0.6 + gnoise(vec2f(q.x * 3.0, q.y * 90.0)) * 0.4;
    var wood = mix(vec3f(0.2, 0.14, 0.1), vec3f(0.36, 0.27, 0.19), grain) * mix(0.55, 1.0, smoothstep(0.0, 0.006, sl.x));
    let wet = 0.6;
    let wspec = pow(max(reflect(-L, vec3f(0.0, 0.0, 1.0)).z, 0.0), 8.0) * 0.0;
    let woodCol = wood * (1.0 - wet * 0.45) * (sunColor() * max(L.z, 0.0) * vis + skyColor() * 0.8) + skyColor() * 0.06 * wet + wspec;
    let film = smoothstep(0.03, 0.22, d);
    col = mix(woodCol, snow, film);

    // Dry leaves, sunk a little and dusted with snow.
    for (var i = 0; i < 4; i++) {
      let lf = view.leaf[i];
      if (lf.w <= 0.0) { continue; }
      let c = cos(lf.z);
      let s = sin(lf.z);
      let o = (p - lf.xy) / lf.w;
      let lq = vec2f(c * o.x + s * o.y, -s * o.x + c * o.y);
      let sh = leafShape(lq);
      let lcov = cover(sh.x, pxw * 1.5 / lf.w);
      if (lcov > 0.0) {
        var lc = mix(vec3f(0.36, 0.17, 0.07), vec3f(0.55, 0.32, 0.12), gnoise(lq * 3.0 + f32(i)));
        lc *= 0.85 + 0.25 * gnoise(p * 700.0);
        lc = mix(lc, lc * 0.55, sh.y * 0.7);
        var lcol = lc * (sunColor() * max(L.z, 0.2) * vis + skyColor() * 0.7);
        let dust = smoothstep(0.55, 0.75, gfbm(p * 180.0 + f32(i) * 5.0));
        lcol = mix(lcol, snow, dust * 0.85);
        col = mix(col, lcol, lcov);
      }
    }
  }

  // Falling flakes: soft, larger and blurrier the nearer they are to us.
  for (var i = 0; i < 40; i++) {
    if (i >= nf) { break; }
    let f = view.flake[i];
    let blur = f.w * (0.6 + f.z * 6.0);
    let fd = length(p - f.xy) - f.w * 0.5;
    let a = cover(fd, blur) * (0.9 - f.z * 0.9);
    col = mix(col, vec3f(0.95, 0.96, 1.0) * (sunColor() * 0.55 + skyColor() * 0.9), a);
  }

  let vig = 1.0 - 0.35 * dot(uv - 0.5, uv - 0.5);
  var outc = filmic(col * 0.86 * vig);
  outc += (ghash(uv * view.res + fract(view.time)) - 0.5) / 255.0;
  return vec4f(outc, 1.0);
}
