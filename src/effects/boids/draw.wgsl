// One oriented dart per bird, built from vertex_index alone.
struct Bird {
  pos: vec2f,
  vel: vec2f,
}

struct View {
  aspect: f32,
  size: f32,
  glow: f32,
  time: f32,
}

@group(0) @binding(0) var<storage, read> birds: array<Bird>;
@group(0) @binding(1) var<uniform> view: View;

struct Out {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) tint: vec3f,
}

@vertex
fn vs_main(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Out {
  let b = birds[i];
  // A dart, not an isoceles triangle: the long axis is the heading, so the
  // flock's direction is readable at two pixels a bird.
  var corners = array<vec2f, 3>(vec2f(1.6, 0.0), vec2f(-0.9, 0.62), vec2f(-0.9, -0.62));
  let c = corners[v];

  let sp = length(b.vel);
  let dir = select(vec2f(1.0, 0.0), b.vel / max(sp, 1e-5), sp > 1e-5);
  let perp = vec2f(-dir.y, dir.x);
  let offset = (dir * c.x + perp * c.y) * view.size;

  let ndc = vec2f(b.pos.x / view.aspect, b.pos.y) + vec2f(offset.x / view.aspect, offset.y);

  var out: Out;
  out.position = vec4f(ndc, 0.0, 1.0);
  out.local = c;

  // Colour by speed, so the flock's shear shows up as a gradient across it.
  let k = clamp((sp - 0.15) * 2.6, 0.0, 1.0);
  out.tint = mix(vec3f(0.16, 0.62, 0.92), vec3f(1.00, 0.62, 0.42), k) * view.glow;
  return out;
}

@fragment
fn fs_main(@location(0) local: vec2f, @location(1) tint: vec3f) -> @location(0) vec4f {
  // Fade toward the tail so the darts read as motion rather than as confetti.
  let a = smoothstep(-1.0, 1.4, local.x) * (1.0 - smoothstep(0.35, 0.62, abs(local.y)));
  return vec4f(tint * a, a);
}
