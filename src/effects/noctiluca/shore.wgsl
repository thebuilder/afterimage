// The night shore shared by the glow sim and the picture. The camera stands
// on the beach, one unit above the sand, looking out to sea. World points on
// the ground are (x, z): x across the view, z distance ahead. s is distance out
// to sea from the resting waterline, u runs along the beach.

export const WAVES: i32 = 3;
export const PERIOD: f32 = 7.5;
/// The waterline's resting distance from the camera.
export const SHORE: f32 = 4.2;
/// How far out a crest starts, in s.
export const REACH: f32 = 16.0;
/// The part of a wave's cycle spent travelling in; the rest is swash.
export const ARRIVE: f32 = 0.62;
/// The part of a cycle the swash spends running up the sand.
export const RUN: f32 = 0.2;

/// Ground point (x, z) under screen point p, and whether there is one (below
/// the horizon). p is in screen heights with y up; the camera's focal length
/// and height are both 1.
export fn ground(p: vec2f, horizon: f32, aspect: f32) -> vec3f {
  let dy = horizon - p.y;
  if (dy <= 0.0005) { return vec3f(0.0, 4000.0, 0.0); }
  let z = 1.0 / dy;
  return vec3f((p.x - 0.5 * aspect) * z, z, 1.0);
}

/// Screen point of a world point at height h above the ground.
export fn toScreen(x: f32, z: f32, h: f32, horizon: f32, aspect: f32) -> vec2f {
  let zz = max(z, 0.05);
  return vec2f(0.5 * aspect + x / zz, horizon - (1.0 - h) / zz);
}

/// How far the waterline wanders toward or away from the camera at u.
export fn wander(u: f32) -> f32 {
  return 0.35 * sin(u * 0.33 + 0.7) + 0.15 * sin(u * 0.91 + 2.1);
}

export fn shoreS(x: f32, z: f32) -> f32 {
  return z - SHORE + wander(x);
}

fn whash(n: f32) -> f32 {
  return fract(sin(n * 91.7 + 13.1) * 43758.5453);
}

/// Wave i's cycle position (fract) and which wave it is (floor), at u. Crests
/// are slightly curved, so they break in a run along the beach.
export fn cycle(i: i32, u: f32, t: f32, surf: f32) -> vec2f {
  let ph = t * (0.75 + 0.25 * surf) / PERIOD + f32(i) / f32(WAVES) + 0.2
    + 0.04 * sin(u * 0.23 + 0.4) + 0.02 * sin(u * 0.61 + 2.0);
  return vec2f(fract(ph), floor(ph) * f32(WAVES) + f32(i));
}

export fn waveSize(c: vec2f) -> f32 {
  return 0.75 + 0.5 * whash(c.y);
}

/// How far up the sand a wave's swash runs at most.
export fn runupMax(size: f32, surf: f32) -> f32 {
  return (0.7 + 0.6 * surf) * size;
}

/// Wave i at u: x = where its front is in s (the crest offshore, the swash's
/// leading edge once ashore, negative up the sand), y = how hard it is
/// breaking 0..1, z = height of its face, w = how far up the sand its water
/// reaches (0 until it arrives).
///
/// The crest arrives at exactly the speed the swash sets off at, and the swash
/// slows evenly to a stop at the top of its run, then drains back, so the
/// front never jumps.
export fn wave(i: i32, u: f32, t: f32, surf: f32) -> vec4f {
  let c = cycle(i, u, t, surf);
  let size = waveSize(c);
  let R = runupMax(size, surf);
  let vA = 2.0 * R / RUN;
  if (c.x < ARRIVE) {
    let w = c.x / ARRIVE;
    let b = clamp(vA * ARRIVE / REACH, 0.15, 0.95);
    let x = REACH * (1.0 - w) * (b + (1.0 - b) * (1.0 - w));
    let brk = smoothstep(6.5, 1.8, x);
    let h = size * (0.08 + 0.34 * smoothstep(14.0, 3.5, x)) * mix(0.3, 1.0, smoothstep(0.4, 3.0, x)) * smoothstep(0.3, 2.6, x);
    return vec4f(x, brk, h, 0.0);
  }
  let tau = c.x - ARRIVE;
  if (tau < RUN) {
    let up = vA * tau - 0.5 * (vA / RUN) * tau * tau;
    return vec4f(-up, 1.0 - tau / RUN, 0.0, up);
  }
  let q = clamp((tau - RUN) / (1.0 - ARRIVE - RUN), 0.0, 1.0);
  let up = R * (1.0 - q * q * (3.0 - 2.0 * q));
  return vec4f(-up, 0.0, 0.0, up);
}

/// The water's edge in s: as far up the sand as any swash reaches right now.
export fn edge(u: f32, t: f32, surf: f32) -> f32 {
  var e = 0.0;
  for (var i = 0; i < WAVES; i++) {
    e = max(e, wave(i, u, t, surf).w);
  }
  return -e - 0.02;
}
