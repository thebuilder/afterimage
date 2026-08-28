// Trail decay: the previous frame, dimmed and pulled very slightly toward the
// centre so old streaks drift as they die.
struct Fade {
  decay: f32,
  zoom: f32,
}
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> fade: Fade;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let c = (uv - 0.5) * fade.zoom + 0.5;
  let prev = textureSampleLevel(src, samp, c, 0.0);
  return vec4f(prev.rgb * fade.decay, prev.a * fade.decay);
}
