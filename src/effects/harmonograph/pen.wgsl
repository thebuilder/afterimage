// Where the harmonograph's pen is at pendulum time tau. Two pendulums swing the
// pen across the paper, each a sum of two decaying sines, and the paper table
// turns slowly beneath it. Shared by the drawing pass and the present pass.
//
// Everything is given as it stands at the start of the frame (tau = shape.w),
// since a push from the pointer changes each pendulum's swing from then on.

export struct Swing {
  freq: vec4f, // x1, x2, y1, y2 in radians per unit of tau
  phase: vec4f, // each pendulum's phase at the start of the frame
  amp: vec4f, // and its amplitude
  shape: vec4f, // damping, table turn, scale, the tau the frame starts at
  centre: vec4f, // xy centre on screen, z the table's angle at the start, w unused
}

export fn penAt(s: Swing, tau: f32) -> vec2f {
  let t = tau - s.shape.w;
  let e = exp(-s.shape.x * t);
  let w = sin(s.freq * t + s.phase) * s.amp;
  let q = vec2f(w.x + w.y, w.z + w.w) * e;
  let a = s.centre.z + s.shape.y * t;
  let r = vec2f(cos(a) * q.x - sin(a) * q.y, sin(a) * q.x + cos(a) * q.y);
  return s.centre.xy + r * s.shape.z;
}
