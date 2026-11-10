// Where the harmonograph's pen is at pendulum time tau. Two pendulums swing the
// pen across the paper, each a sum of two decaying sines, and the paper table
// turns slowly beneath it. Shared by the drawing pass and the present pass.

export struct Swing {
  freq: vec4f, // x1, x2, y1, y2 in radians per unit of tau
  phase: vec4f, // each pendulum's phase at tau = shape.w, so retuning never jumps the pen
  amp: vec4f,
  shape: vec4f, // damping, table turn, scale, the tau the phases belong to
  centre: vec4f, // xy centre on screen, zw unused
}

export fn penAt(s: Swing, tau: f32) -> vec2f {
  let e = exp(-s.shape.x * tau);
  let w = sin(s.freq * (tau - s.shape.w) + s.phase) * s.amp;
  let q = vec2f(w.x + w.y, w.z + w.w) * e;
  let a = s.shape.y * tau;
  let r = vec2f(cos(a) * q.x - sin(a) * q.y, sin(a) * q.x + cos(a) * q.y);
  return s.centre.xy + r * s.shape.z;
}
