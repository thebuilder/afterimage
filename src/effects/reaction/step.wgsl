// One Gray-Scott step. Red channel is chemical A, green is B.
// A' = A + (Da·∇²A − A·B² + f·(1−A))·dt
// B' = B + (Db·∇²B + A·B² − (f+k)·B)·dt
struct Sim {
  texel: vec2f,
  mouse: vec2f,
  feed: f32,
  kill: f32,
  time: f32,
  inject: f32,
  aspect: f32,
  _pad: f32,
}
@group(0) @binding(0) var state: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> sim: Sim;

/// Nine-point Laplacian. The diagonal weights matter: a five-point stencil on a
/// square grid makes the patterns grow along the axes and the result looks woven.
fn laplacian(uv: vec2f) -> vec2f {
  let t = sim.texel;
  var sum = vec2f(0.0);
  sum += textureSampleLevel(state, samp, uv + vec2f(-t.x, -t.y), 0.0).rg * 0.05;
  sum += textureSampleLevel(state, samp, uv + vec2f(0.0, -t.y), 0.0).rg * 0.20;
  sum += textureSampleLevel(state, samp, uv + vec2f(t.x, -t.y), 0.0).rg * 0.05;
  sum += textureSampleLevel(state, samp, uv + vec2f(-t.x, 0.0), 0.0).rg * 0.20;
  sum += textureSampleLevel(state, samp, uv, 0.0).rg * -1.00;
  sum += textureSampleLevel(state, samp, uv + vec2f(t.x, 0.0), 0.0).rg * 0.20;
  sum += textureSampleLevel(state, samp, uv + vec2f(-t.x, t.y), 0.0).rg * 0.05;
  sum += textureSampleLevel(state, samp, uv + vec2f(0.0, t.y), 0.0).rg * 0.20;
  sum += textureSampleLevel(state, samp, uv + vec2f(t.x, t.y), 0.0).rg * 0.05;
  return sum;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let s = textureSampleLevel(state, samp, uv, 0.0).rg;
  let lap = laplacian(uv);

  // Feed and kill vary slowly across the frame, so one image holds several
  // regimes at once: mitosis in one corner, coral in another.
  let g = (uv - 0.5) * vec2f(sim.aspect, 1.0);
  let feed = sim.feed + g.x * 0.0055 + sin(sim.time * 0.05) * 0.0012;
  let kill = sim.kill + g.y * 0.0035;

  let a = s.r;
  let b = s.g;
  let reaction = a * b * b;

  var na = a + (0.21 * lap.r - reaction + feed * (1.0 - a));
  var nb = b + (0.105 * lap.g + reaction - (feed + kill) * b);

  // The pointer paints B into the medium.
  let d = length((uv - sim.mouse) * vec2f(sim.aspect, 1.0));
  nb += sim.inject * smoothstep(0.06, 0.0, d);

  return vec4f(clamp(na, 0.0, 1.0), clamp(nb, 0.0, 1.0), 0.0, 1.0);
}
