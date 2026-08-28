// One additive sprite per particle, pulled straight out of the storage buffer.
// No vertex or index buffer exists: three corners are generated from vertex_index.
struct Particle {
  pos: vec2f,
  vel: vec2f,
  age: f32,
  seed: f32,
}

struct View {
  aspect: f32,
  pointSize: f32,
  intensity: f32,
  time: f32,
}

@group(0) @binding(0) var<storage, read> parts: array<Particle>;
@group(0) @binding(1) var<uniform> view: View;

struct Out {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) tint: vec3f,
  @location(2) weight: f32,
}

@vertex
fn vs_main(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Out {
  let p = parts[i];
  // A triangle that circumscribes the unit disc: cheaper than a quad, and the
  // fragment shader discards the corners anyway.
  var corners = array<vec2f, 3>(vec2f(-1.74, -1.0), vec2f(1.74, -1.0), vec2f(0.0, 2.0));
  let c = corners[v];

  let size = view.pointSize * (0.55 + 0.9 * p.seed);
  let ndc = vec2f(p.pos.x / view.aspect, p.pos.y);

  var out: Out;
  out.position = vec4f(ndc + c * size, 0.0, 1.0);
  out.local = c;

  // Fast particles run hot; slow ones stay in the cool end of the ramp.
  let speed = clamp(length(p.vel) * 0.30, 0.0, 1.0);
  let cool = vec3f(0.10, 0.45, 0.95);
  let warm = vec3f(1.00, 0.42, 0.72);
  let hot = vec3f(1.00, 0.92, 0.70);
  var tint = mix(cool, warm, smoothstep(0.10, 0.55, speed));
  tint = mix(tint, hot, smoothstep(0.60, 1.0, speed));
  out.tint = tint;

  // Fade in at birth and out at death so nothing pops.
  out.weight = smoothstep(1.0, 0.86, p.age) * smoothstep(0.0, 0.18, p.age);
  return out;
}

@fragment
fn fs_main(@location(0) local: vec2f, @location(1) tint: vec3f, @location(2) weight: f32) -> @location(0) vec4f {
  let d = dot(local, local);
  if (d > 1.0) { discard; }
  // Gaussian-ish falloff; the square keeps a bright pinpoint core.
  let a = exp(-d * 4.5);
  let e = a * a * weight * view.intensity;
  return vec4f(tint * e, e);
}
