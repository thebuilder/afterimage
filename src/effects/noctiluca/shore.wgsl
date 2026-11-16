// The night shore shared by the glow sim and the picture: where the beach
// meets the sea, and where each breaking wave and its swash are right now.
// Positions are in screen heights; s runs out to sea from the waterline, u
// runs along the beach.

export const WAVES: i32 = 3;
export const PERIOD: f32 = 7.5;
/// How far offshore a crest starts, in screen heights.
export const REACH: f32 = 1.3;
/// The part of a wave's cycle spent travelling in; the rest is swash.
export const ARRIVE: f32 = 0.6;

/// (s, u) for a point p, given the direction out to sea and a point on the
/// waterline. The waterline wanders a little so the beach is not a ruler.
export fn shore(p: vec2f, sea: vec2f, origin: vec2f) -> vec2f {
  let d = p - origin;
  let u = dot(d, vec2f(-sea.y, sea.x));
  let s = dot(d, sea) + 0.03 * sin(u * 2.3 + 0.7) + 0.012 * sin(u * 5.9 + 2.1);
  return vec2f(s, u);
}

fn whash(n: f32) -> f32 {
  return fract(sin(n * 91.7 + 13.1) * 43758.5453);
}

/// Wave i's cycle position (fract) and which wave it is (floor), at u along the
/// beach. Crests are slightly curved and oblique, so they break in a run.
export fn cycle(i: i32, u: f32, t: f32, surf: f32) -> vec2f {
  let ph = t * (0.75 + 0.25 * surf) / PERIOD + f32(i) / f32(WAVES) + 0.15
    + 0.035 * sin(u * 1.3 + 0.4) + 0.015 * sin(u * 3.7 + 2.0);
  return vec2f(fract(ph), floor(ph) * f32(WAVES) + f32(i));
}

/// How far up the beach (as a positive distance) wave i's swash has run.
export fn runup(i: i32, u: f32, t: f32, surf: f32) -> f32 {
  let c = cycle(i, u, t, surf);
  if (c.x < ARRIVE) { return 0.0; }
  let q = (c.x - ARRIVE) / (1.0 - ARRIVE);
  let size = 0.7 + 0.6 * whash(c.y);
  return (0.07 + 0.06 * surf) * size * sin(3.14159 * pow(q, 0.55));
}

/// The water's edge: as far up the beach as any swash has reached right now.
export fn edge(u: f32, t: f32, surf: f32) -> f32 {
  var e = 0.0;
  for (var i = 0; i < WAVES; i++) {
    e = max(e, runup(i, u, t, surf));
  }
  return -e - 0.004;
}

/// Wave i's front: (position in s, how hard it is breaking 0..1). Offshore it
/// is the crest; once it reaches the waterline it is the leading edge of the
/// swash, live only while that is still running up the beach.
export fn front(i: i32, u: f32, t: f32, surf: f32) -> vec2f {
  let c = cycle(i, u, t, surf);
  if (c.x < ARRIVE) {
    let x = REACH * pow(1.0 - c.x / ARRIVE, 1.3);
    return vec2f(x, 0.12 + 0.88 * smoothstep(0.55, 0.12, x));
  }
  let q = (c.x - ARRIVE) / (1.0 - ARRIVE);
  let qq = pow(q, 0.55);
  let size = 0.7 + 0.6 * whash(c.y);
  let up = (0.07 + 0.06 * surf) * size * sin(3.14159 * qq);
  // Breaking fades as the swash slows and stops at the top of its run.
  return vec2f(-up, smoothstep(0.5, 0.15, qq));
}
