// One step of the sand. r holds how much sand lies on each patch of the plate.
// Grains hop off wherever the plate moves and come to rest where it is still,
// so the sand drifts down the slope of the vibration toward the nodal lines.
// Every grain that leaves one patch arrives in the next: none is lost.
import { hash21 } from "../../shaders/common.wgsl";
import { plateMode } from "./mode.wgsl";


struct Sim {
  mode: vec4f, // n, m, sign, how close to resonance
  dt: f32,
  time: f32,
  bow: f32,
  seed: f32,
}
@group(0) @binding(0) var state: texture_2d<f32>;
@group(0) @binding(1) var<uniform> sim: Sim;

/// How the sand moves at u: its drift in plate widths per second (xy), and
/// how restless it is (z), since grains on a moving patch scatter.
fn motion(u: vec2f) -> vec3f {
  let g = plateMode(u, sim.mode.xyz);
  let k = sim.mode.x * sim.mode.x + sim.mode.y * sim.mode.y;
  let drive = sim.bow * sim.mode.w;
  // Down the gradient of the squared amplitude, scaled to the mode's own
  // spacing so a fine pattern forms as quickly as a coarse one.
  let v = -0.9 * drive * g.x * g.yz / (3.14159265 * k);
  let a = g.x * 0.5;
  return vec3f(v, 0.026 + 0.1 * clamp(drive, 0.0, 1.5) * a * a);
}

fn rho(c: vec2i, n: vec2i) -> f32 {
  return textureLoad(state, clamp(c, vec2i(0), n - 1), 0).r;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let n = vec2i(textureDimensions(state));
  let ic = vec2i(floor(uv * vec2f(n)));
  if (sim.seed > 0.5) {
    // A fresh sprinkle: even on the whole, a little uneven up close.
    let p = vec2f(ic);
    return vec4f(0.8 + 0.4 * hash21(p) + 0.15 * hash21(floor(p / 9.0)), 0.0, 0.0, 1.0);
  }

  let h = 1.0 / f32(n.x);
  let u = (vec2f(ic) + 0.5) * h;
  let r0 = rho(ic, n);
  let rR = rho(ic + vec2i(1, 0), n);
  let rL = rho(ic - vec2i(1, 0), n);
  let rT = rho(ic + vec2i(0, 1), n);
  let rB = rho(ic - vec2i(0, 1), n);
  // The plate's rim holds the sand in: no flow across its edge.
  let inR = f32(ic.x < n.x - 1);
  let inL = f32(ic.x > 0);
  let inT = f32(ic.y < n.y - 1);
  let inB = f32(ic.y > 0);

  // Motion at this patch and its four neighbours; each face takes the mean
  // of the two patches it divides.
  let h2 = vec2f(h, 0.0);
  let m0 = motion(u);
  let mR = 0.5 * (m0 + motion(u + h2.xy));
  let mL = 0.5 * (m0 + motion(u - h2.xy));
  let mT = 0.5 * (m0 + motion(u + h2.yx));
  let mB = 0.5 * (m0 + motion(u - h2.yx));

  // Upwind flow across each face, capped so no patch can empty in one step.
  let lim = 0.22 * h / sim.dt;
  let vR = clamp(mR.x, -lim, lim);
  let vL = clamp(mL.x, -lim, lim);
  let vT = clamp(mT.y, -lim, lim);
  let vB = clamp(mB.y, -lim, lim);
  let fR = (max(vR, 0.0) * r0 + min(vR, 0.0) * rR) * inR;
  let fL = (max(vL, 0.0) * rL + min(vL, 0.0) * r0) * inL;
  let fT = (max(vT, 0.0) * r0 + min(vT, 0.0) * rT) * inT;
  let fB = (max(vB, 0.0) * rB + min(vB, 0.0) * r0) * inB;
  var r = r0 - (fR - fL + fT - fB) * sim.dt / h;

  // Scattering across each face, so grains wander off the moving parts. A
  // deep pile also slumps, as sand cannot stand steeper than its angle of
  // repose, so heaps spread out along their line instead of towering.
  let cR = min(mR.z + 0.0025 * (r0 + rR), 0.12) * inR;
  let cL = min(mL.z + 0.0025 * (r0 + rL), 0.12) * inL;
  let cT = min(mT.z + 0.0025 * (r0 + rT), 0.12) * inT;
  let cB = min(mB.z + 0.0025 * (r0 + rB), 0.12) * inB;
  r += cR * (rR - r0) + cL * (rL - r0) + cT * (rT - r0) + cB * (rB - r0);

  return vec4f(max(r, 0.0), 0.0, 0.0, 1.0);
}
