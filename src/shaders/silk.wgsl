// Iridescent Silk: a domain-warped height field shaded as thin film over fabric.
import { fbmSimplex2d } from "@vgpu/wgsl-std/noise/simplex";
import { centered, filmic, dither } from "./common.wgsl";

struct Params {
  res: vec2f,
  mouse: vec2f,
  time: f32,
  folds: f32,
  film: f32,
  sheen: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

/// The sheet. Two rounds of domain warping: the first bends the field into
/// folds, the second breaks those folds into the smaller creases that keep the
/// surface from looking like a lava lamp.
fn sheet(p: vec2f, t: f32) -> f32 {
  // One strong warp at low frequency bends the field into broad folds; a second,
  // much weaker one adds the creases. Warp hard at high frequency instead and the
  // sheet turns into static.
  let w1 = vec2f(
    fbmSimplex2d(p * 0.50 + vec2f(0.0, t * 0.085), 3, 2.0, 0.5),
    fbmSimplex2d(p * 0.50 + vec2f(5.2, 1.3 - t * 0.070), 3, 2.0, 0.5)
  );
  let q = p + w1 * 0.85;
  let w2 = vec2f(
    fbmSimplex2d(q * 0.95 + vec2f(1.7, t * 0.13), 2, 2.0, 0.5),
    fbmSimplex2d(q * 0.95 + vec2f(8.3, -t * 0.11), 2, 2.0, 0.5)
  );
  return fbmSimplex2d(q * 0.62 + w2 * 0.18 + vec2f(t * 0.035, 0.0), 4, 2.0, 0.5);
}

/// Thin-film interference: path difference scales with film thickness and the
/// inverse cosine of the refracted angle, and each wavelength peaks at a
/// different order. Three cosines at RGB wavelengths is the cheap version.
fn thinFilm(thickness: f32, cosTheta: f32) -> vec3f {
  let d = thickness / max(cosTheta, 0.22);
  let wl = vec3f(1.0, 1.22, 1.52);   // relative R / G / B path lengths
  return 0.5 + 0.5 * cos(6.2831853 * d / wl);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = centered(uv, params.res) * params.folds;
  let t = params.time;
  let m = (params.mouse - 0.5) * vec2f(1.0, -1.0);

  let h = sheet(p, t);
  // Finite-difference normal. The offset is tied to nothing but taste: large
  // enough to stay stable, small enough to keep the creases sharp.
  let e = 0.012;
  let hx = sheet(p + vec2f(e, 0.0), t) - sheet(p - vec2f(e, 0.0), t);
  let hy = sheet(p + vec2f(0.0, e), t) - sheet(p - vec2f(0.0, e), t);
  // Slope, not raw difference: dividing by the sample spacing keeps the normal
  // stable, and the z term has to dominate or the surface turns into RGB noise.
  let gx = hx / (2.0 * e);
  let gy = hy / (2.0 * e);
  let n = normalize(vec3f(-gx * 0.26, -gy * 0.26, 1.0));

  let view = normalize(vec3f(-m.x * 0.55, -m.y * 0.55, 1.0));
  let lightA = normalize(vec3f(0.45, 0.62, 0.65));
  let lightB = normalize(vec3f(-0.60, -0.35, 0.72));

  let cosTheta = clamp(dot(n, view), 0.0, 1.0);
  let fres = pow(1.0 - cosTheta, 3.0);

  // Film thickness varies with the fold height: crests are thin, valleys thick.
  let thickness = 1.10 * params.film + h * 1.05 + fbmSimplex2d(p * 0.30 + vec2f(t * 0.04, 0.0), 3, 2.0, 0.5) * 0.45;
  // Anti-alias the interference. Where the sheet turns fast, the film bands pack
  // tighter than a pixel; fading them toward their own average kills the rainbow
  // speckle that a per-pixel cosine produces at those edges.
  let slope = length(vec2f(gx, gy));
  let resolvable = 1.0 / (1.0 + slope * slope * 3.5);
  let film = mix(vec3f(0.5), thinFilm(thickness, cosTheta), resolvable);

  // Base cloth: a dusty violet ground for the iridescence to sit on.
  var col = mix(vec3f(0.045, 0.035, 0.075), vec3f(0.17, 0.13, 0.26), h * 0.5 + 0.5);

  let difA = max(dot(n, lightA), 0.0);
  let difB = max(dot(n, lightB), 0.0);
  col += vec3f(0.55, 0.42, 0.70) * pow(difA, 1.6) * 0.30;
  col += vec3f(0.20, 0.42, 0.62) * pow(difB, 1.8) * 0.22;

  // The iridescent sheen rides on fresnel: strongest where the sheet turns away.
  col += film * (0.22 + fres * 1.55) * (0.35 + 0.65 * pow(difA, 0.8)) * 0.85;

  // Silk specular: a long, narrow anisotropic-looking highlight along the folds.
  let hv = normalize(lightA + view);
  col += vec3f(1.0, 0.96, 1.0) * pow(max(dot(n, hv), 0.0), 90.0) * 0.9;

  col *= params.sheen;
  col = filmic(col * 1.15);
  col *= 0.70 + 0.30 * smoothstep(1.45, 0.15, length((uv - 0.5) * vec2f(1.1, 1.0)));
  return vec4f(col + dither(uv, params.res), 1.0);
}
