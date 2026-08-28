// A subdivided icosphere displaced along its normals, drawn as real geometry
// through a real vertex stage into a depth target.
import { fbmSimplex3d } from "@vgpu/wgsl-std/noise/simplex";

struct Camera { viewProjection: mat4x4f }
struct Model { model: mat4x4f }
struct Shape {
  time: f32,
  morph: f32,
  facets: f32,
  glow: f32,
}

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> model: Model;
@group(0) @binding(2) var<uniform> shape: Shape;

struct Out {
  @builtin(position) position: vec4f,
  @location(0) world: vec3f,
  @location(1) rounded: vec3f,
  @location(2) height: f32,
}

@vertex
fn vs_main(@location(0) position: vec3f, @location(1) normal: vec3f) -> Out {
  // Quantising the sample point is what makes the surface facet: a whole
  // triangle that samples one cell gets one displacement, so the sphere breaks
  // into plates instead of rippling smoothly.
  let cell = max(shape.facets, 1.0);
  let q = floor(position * cell + 0.5) / cell;
  let n = fbmSimplex3d(q * 1.35 + vec3f(0.0, shape.time * 0.22, shape.time * 0.09), 4, 2.1, 0.55);

  let displaced = position * (1.0 + n * shape.morph);
  let world = (model.model * vec4f(displaced, 1.0)).xyz;

  var out: Out;
  out.position = camera.viewProjection * vec4f(world, 1.0);
  out.world = world;
  out.rounded = (model.model * vec4f(normal, 0.0)).xyz;
  out.height = n;
  return out;
}

@fragment
fn fs_main(
  @location(0) world: vec3f,
  @location(1) rounded: vec3f,
  @location(2) height: f32
) -> @location(0) vec4f {
  // The true facet normal, from how world position changes across the 2x2 quad.
  // Taking it from the interpolated vertex normal would shade the plates as a
  // smooth ball and throw the whole faceting away.
  var n = normalize(cross(dpdx(world), dpdy(world)));
  let view = normalize(-world + vec3f(0.0, 0.0, 4.2));
  if (dot(n, view) < 0.0) { n = -n; }

  let key = normalize(vec3f(0.55, 0.72, 0.42));
  let rim = normalize(vec3f(-0.70, 0.10, 0.55));

  let dif = max(dot(n, key), 0.0);
  let fres = pow(1.0 - max(dot(n, view), 0.0), 3.0);
  let spec = pow(max(dot(reflect(-key, n), view), 0.0), 60.0);

  // Ridges run warm, hollows run cold.
  let k = clamp(height * 1.4 + 0.5, 0.0, 1.0);
  let cold = vec3f(0.06, 0.30, 0.52);
  let warm = vec3f(1.00, 0.58, 0.30);
  let base = mix(cold, warm, smoothstep(0.35, 0.85, k));

  var col = base * (0.14 + 0.95 * dif);
  col += vec3f(0.16, 0.34, 0.62) * max(dot(normalize(rounded), rim), 0.0) * 0.4;
  col += vec3f(0.45, 0.85, 1.00) * fres * 1.5 * shape.glow;
  col += vec3f(1.0, 0.94, 0.86) * spec * 1.3;

  return vec4f(col, 1.0);
}
