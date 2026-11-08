// The standing wave on a square plate with free edges, clamped at its centre.
// Shared by the sand step and the present pass, so the sand settles exactly
// where the drawing says the plate is still.

const PI: f32 = 3.14159265;

/// Displacement of mode (n, m, s) at u in 0..1, and its gradient in u.
/// Returns (f, df/dx, df/dy). s is +1 or -1: the two ways the pair combines.
export fn plateMode(u: vec2f, mode: vec3f) -> vec3f {
  let n = mode.x * PI;
  let m = mode.y * PI;
  let s = mode.z;
  let cnx = cos(n * u.x);
  let snx = sin(n * u.x);
  let cmy = cos(m * u.y);
  let smy = sin(m * u.y);
  let cmx = cos(m * u.x);
  let smx = sin(m * u.x);
  let cny = cos(n * u.y);
  let sny = sin(n * u.y);
  let f = cnx * cmy + s * cmx * cny;
  let fx = -n * snx * cmy - s * m * smx * cny;
  let fy = -m * cnx * smy - s * n * cmx * sny;
  return vec3f(f, fx, fy);
}
