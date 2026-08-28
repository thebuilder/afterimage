import type { Control, HeroEffect, Wgsl } from "./types"
import { fullscreen } from "./fullscreen"

import auroraWgsl from "@/shaders/aurora.wgsl"
import chromeWgsl from "@/shaders/chrome.wgsl"
import hexgridWgsl from "@/shaders/hexgrid.wgsl"
import arcsWgsl from "@/shaders/arcs.wgsl"
import blackholeWgsl from "@/shaders/blackhole.wgsl"
import mandelbulbWgsl from "@/shaders/mandelbulb.wgsl"
import silkWgsl from "@/shaders/silk.wgsl"
import rainWgsl from "@/shaders/rain.wgsl"
import prismWgsl from "@/shaders/prism.wgsl"
import truchetWgsl from "@/shaders/truchet.wgsl"
import mandalaWgsl from "@/shaders/mandala.wgsl"
import wormholeWgsl from "@/shaders/wormhole.wgsl"
import oceanWgsl from "@/shaders/ocean.wgsl"
import cloudsWgsl from "@/shaders/clouds.wgsl"
import terrainWgsl from "@/shaders/terrain.wgsl"

import { createFlux } from "./flux/pipeline"
import fluxAdvect from "./flux/advect.wgsl"
import fluxSplat from "./flux/splat.wgsl"
import fluxFade from "./flux/fade.wgsl"
import fluxPresent from "./flux/present.wgsl"

import { createReaction } from "./reaction/pipeline"
import reactionSeed from "./reaction/seed.wgsl"
import reactionStep from "./reaction/step.wgsl"
import reactionPresent from "./reaction/present.wgsl"

import { createInk } from "./ink/pipeline"
import inkStep from "./ink/step.wgsl"
import inkPresent from "./ink/present.wgsl"

import { createBoids } from "./boids/pipeline"
import boidsFlock from "./boids/flock.wgsl"
import boidsDraw from "./boids/draw.wgsl"
import boidsPresent from "./boids/present.wgsl"

import { createLattice } from "./lattice/pipeline"
import latticeMesh from "./lattice/mesh.wgsl"
import latticePresent from "./lattice/present.wgsl"

/** Terse control literal. `key` has to match the WGSL `Params` member for single-pass effects. */
const ctl = (
  key: string,
  label: string,
  min: number,
  max: number,
  step: number,
  value: number
): Control => ({ key, label, min, max, step, value })

/**
 * A single-pass entry carries its shader instead of a `create`; the adapter is
 * added below. Multi-pass entries build their own pipeline and bring their own.
 */
type SinglePass = Omit<HeroEffect, "create"> & { readonly wgsl: Wgsl }
type Entry = HeroEffect | SinglePass

const ENTRIES: readonly Entry[] = [
  {
    id: "flux",
    name: "Flux Field",
    tagline: "140,000 particles steered by curl noise, burned into a trail buffer.",
    description:
      "A compute pass advects every particle through the curl of a noise field, so the flow is divergence-free and the streaks braid instead of pooling. The buffer is ping-ponged, never read and written in one dispatch. A single instanced draw then spawns one additive sprite per particle straight out of storage. No vertex buffer exists. Sprites land in an HDR trail target that fades a few percent each frame, which is where the filaments come from.",
    pipeline: [
      "compute · curl-noise advection (ping-pong storage)",
      "pass 1 · fade previous trails, then additive instanced splat",
      "pass 2 · dual-radius bloom + filmic tonemap to canvas",
    ],
    techniques: ["compute shader", "storage ping-pong", "instancing", "HDR feedback", "bloom"],
    cost: "heavy",
    accent: "#ff8fc4",
    controls: [
      ctl("exposure", "Exposure", 0.2, 2.5, 0.01, 1),
      ctl("flow", "Flow", 0.1, 2.5, 0.01, 1),
      ctl("persistence", "Trail", 0.75, 0.985, 0.001, 0.92),
    ],
    create: (setup) =>
      createFlux(
        setup,
        { advect: fluxAdvect, splat: fluxSplat, fade: fluxFade, present: fluxPresent },
        { count: 140_000 }
      ),
  },
  {
    id: "blackhole",
    wgsl: blackholeWgsl,
    name: "Event Horizon",
    tagline: "Photons integrated through a gravity well, one geodesic per pixel.",
    description:
      "Each pixel launches a photon and steps it through the deflection term −1.5·h²·r̂/r⁵, with the specific angular momentum held constant. That single term is enough to produce the photon ring at 1.5 r_s and to lift the far side of the accretion disk up over the shadow. Where a ray crosses the equatorial plane the march interpolates back to the exact crossing point, which keeps the disk edge clean, and relativistic beaming brightens the side rotating toward the camera.",
    pipeline: ["single pass · 180-step geodesic integration per pixel"],
    techniques: ["ray integration", "gravitational lensing", "relativistic beaming", "procedural stars"],
    cost: "heavy",
    accent: "#ffbc57",
    controls: [
      ctl("disk", "Disk", 0.2, 2.0, 0.01, 1),
      ctl("spin", "Orbit", 0, 4, 0.01, 1),
      ctl("tilt", "Tilt", 0, 1, 0.01, 0.38),
    ],
  },
  {
    id: "ocean",
    wgsl: oceanWgsl,
    name: "Deep Water",
    tagline: "A sum-of-sines sea solved by Newton iteration against the ray.",
    description:
      "Six travelling sines, each shaped by exp(sin−1) so the crests sharpen and the troughs flatten, and each dragging the domain along its own direction so the octaves never line up into a grid. The surface is not marched: the ray starts on the flat plane and five Newton steps pull it onto the water, which converges everywhere a sphere tracer would need fifty steps. The normal footprint widens with distance, because a 220-power specular lobe on a surface that changes faster than a pixel aliases into static.",
    pipeline: ["single pass · Newton-solved heightfield, procedural sky, sun glitter"],
    techniques: ["heightfield ray solve", "Gerstner-style waves", "fresnel", "subsurface"],
    cost: "medium",
    accent: "#8dbdf5",
    controls: [
      ctl("swell", "Swell", 0.2, 2.2, 0.01, 1),
      ctl("wind", "Chop", 0, 2.5, 0.01, 1),
      ctl("sun", "Sun height", 0, 1, 0.01, 0.35),
    ],
  },
  {
    id: "terrain",
    wgsl: terrainWgsl,
    name: "Ridgeline",
    tagline: "Ridged multifractal terrain, marched coarse and bisected fine.",
    description:
      "Folding each noise octave with 1−|n| turns the rolling hills of plain fbm into creases, and weighting every octave by the previous one keeps the detail on the ridges and off the valley floors, roughly where erosion leaves it. The march grows its step with distance and then bisects the bracketing interval nine times, because a step fine enough for the near ground would never reach the horizon. Aerial perspective does the rest.",
    pipeline: ["single pass · growing-step march, 9-step bisection refine, aerial perspective"],
    techniques: ["ridged multifractal", "bisection refine", "slope shading", "atmospheric scattering"],
    cost: "heavy",
    accent: "#ffbc57",
    controls: [
      ctl("altitude", "Altitude", 0, 1.4, 0.01, 0.5),
      ctl("ruggedness", "Erosion", 0, 1, 0.01, 0.8),
      ctl("haze", "Haze", 0.2, 2.5, 0.01, 1),
    ],
  },
  {
    id: "reaction",
    name: "Membrane",
    tagline: "A Gray-Scott reaction diffusing across the frame, twelve steps a frame.",
    description:
      "Two chemicals live in the red and green channels of an HDR ping-pong pair. Twelve simulation passes run per displayed frame, each a nine-point Laplacian plus the Gray-Scott reaction term. A five-point stencil grows the pattern along the pixel axes and comes out looking woven. Feed and kill rates drift across the frame, so one image holds several regimes at once: mitosis in one corner, coral in another. The final pass reads the chemical field as a height map and lights it.",
    pipeline: [
      "pass 1..12 · Gray-Scott step, ping-pong rgba16float",
      "pass 13 · gradient → normal, lit as a membrane",
    ],
    techniques: ["ping-pong targets", "multi-pass sim", "float targets", "gradient shading"],
    cost: "medium",
    accent: "#86fadd",
    controls: [
      ctl("feed", "Feed", 0.02, 0.06, 0.0005, 0.0367),
      ctl("kill", "Kill", 0.045, 0.07, 0.0005, 0.0605),
      ctl("relief", "Relief", 0.3, 2, 0.01, 1),
    ],
    create: (setup) =>
      createReaction(setup, {
        seed: reactionSeed,
        step: reactionStep,
        present: reactionPresent,
      }),
  },
  {
    id: "ink",
    name: "Ink",
    tagline: "Semi-Lagrangian fluid with vorticity confinement. Drag it.",
    description:
      "Velocity lives in the red and green channels, dye in blue. Each step traces backwards along the velocity to find what arrives at a texel, which is unconditionally stable in a way that pushing forwards is not, then adds a confinement force pointing along the curl gradient to put back the eddies advection keeps smearing out. There is no pressure projection: skipping the Jacobi solve costs incompressibility, which looks like dye that spreads slightly too eagerly, and buys one pass per step instead of twenty.",
    pipeline: [
      "pass 1..3 · advect + vorticity confinement + injection",
      "pass 4 · dye gradient shading",
    ],
    techniques: ["semi-Lagrangian advection", "vorticity confinement", "float ping-pong", "pointer forces"],
    cost: "medium",
    accent: "#b890ff",
    controls: [
      ctl("swirl", "Vorticity", 0, 3, 0.01, 1),
      ctl("dissipation", "Dissipation", 0.05, 2, 0.01, 0.5),
      ctl("dye", "Dye", 0, 2.5, 0.01, 1),
    ],
    create: (setup) => createInk(setup, { step: inkStep, present: inkPresent }),
  },
  {
    id: "lattice",
    name: "Lattice",
    tagline: "Real geometry, a real vertex stage, and a real depth buffer.",
    description:
      "The only effect here that is not a fullscreen pass. An icosphere from vgpu/scene becomes vertex and index buffers, and the vertex stage displaces each point along its normal by 3D noise sampled at a quantised position, so a whole triangle shares one displacement and the sphere breaks into plates. The fragment stage takes its normal from how world position changes across the 2×2 quad rather than from the interpolated vertex normal, which is what keeps the facets flat. Surfaces have no depth attachment, so the scene renders to an offscreen depth target and comes across in a second pass.",
    pipeline: [
      "pass 1 · indexed draw into an offscreen rgba16float + depth target",
      "pass 2 · composite and bloom onto the canvas",
    ],
    techniques: ["scene geometry", "vertex displacement", "depth target", "screen-space normals"],
    cost: "medium",
    accent: "#8dbdf5",
    controls: [
      ctl("morph", "Displace", 0, 0.7, 0.01, 0.35),
      ctl("facets", "Facets", 2, 20, 0.5, 7),
      ctl("spin", "Spin", 0, 4, 0.01, 1),
    ],
    create: (setup) => createLattice(setup, { mesh: latticeMesh, present: latticePresent }),
  },
  {
    id: "boids",
    name: "Murmuration",
    tagline: "1,400 birds, every one checking every other, settling into a mill.",
    description:
      "Classic Reynolds flocking in a compute pass: cohesion toward the local centroid, alignment with the local heading, separation weighted by inverse distance. Every bird tests every other, which is the wrong algorithm above a few thousand but beats a spatial hash here with no grid to build and a straight run through coalesced memory. Left alone the flock finds its torus state and mills; the pointer scatters it, and it reforms. The separation term has to be averaged over the neighbour count, or it grows with density and blows the flock into a shell against the walls.",
    pipeline: [
      "compute · O(n²) flocking, ping-pong storage",
      "pass 1 · instanced oriented darts into an HDR buffer",
      "pass 2 · bloom and composite",
    ],
    techniques: ["compute shader", "n-body flocking", "instancing", "alpha blending"],
    cost: "heavy",
    accent: "#8dbdf5",
    controls: [
      ctl("cohesion", "Cohesion", 0, 2.5, 0.01, 1),
      ctl("separation", "Separation", 0, 2.5, 0.01, 1),
      ctl("speed", "Speed", 0.3, 2.5, 0.01, 1),
    ],
    create: (setup) =>
      createBoids(setup, { flock: boidsFlock, draw: boidsDraw, present: boidsPresent }),
  },
  {
    id: "clouds",
    wgsl: cloudsWgsl,
    name: "Cumulus",
    tagline: "Volumetric raymarch, lit by a second march toward the sun.",
    description:
      "Forty-six steps through a 3D noise slab, each one taking four more steps toward the sun to work out how much light survives to it. Coverage subtracts a constant before the clamp, which is what turns one noise field into anything from wisps to overcast. Two details do most of the work: the march span is capped, because a near-horizontal ray crosses unbounded slab and accumulates an opaque wall, and the first sample is dithered per pixel, because uniform starts put the step pattern on screen as banding.",
    pipeline: ["single pass · 46-step volume march, 4-step light march per sample"],
    techniques: ["volumetric raymarch", "Beer-Lambert", "forward scattering", "blue-noise offset"],
    cost: "heavy",
    accent: "#e9f6f1",
    controls: [
      ctl("coverage", "Coverage", 0.15, 0.85, 0.01, 0.42),
      ctl("density", "Density", 0.3, 2.5, 0.01, 1),
      ctl("sun", "Sun height", 0, 1, 0.01, 0.4),
    ],
  },
  {
    id: "chrome",
    wgsl: chromeWgsl,
    name: "Liquid Chrome",
    tagline: "Six metaballs melted together and mirrored in a procedural studio.",
    description:
      "A polynomial smooth-minimum joins six orbiting spheres, so they melt rather than intersect, and the raymarcher finds the surface from that distance field. The environment is what makes it read as metal: a dome with hard-edged strip lights, a warm key, a cold kicker. Swap in a smooth gradient and the same geometry renders as plastic. Chrome needs something crisp to reflect.",
    pipeline: ["single pass · sphere-traced SDF, ~88 steps, environment reflection"],
    techniques: ["signed distance fields", "smooth minimum", "fresnel", "procedural HDRI"],
    cost: "medium",
    accent: "#8dbdf5",
    controls: [
      ctl("melt", "Melt", 0, 1, 0.01, 0.47),
      ctl("spin", "Spin", 0, 3, 0.01, 1),
      ctl("exposure", "Exposure", 0.3, 2, 0.01, 1),
    ],
  },
  {
    id: "prism",
    wgsl: prismWgsl,
    name: "Prism",
    tagline: "A Voronoi fracture lit as cut glass, each shard refracting its own way.",
    description:
      "Every shard hashes to a facet angle and a thickness, and refracts the backdrop by a constant offset, because a flat facet bends everything behind it the same way. Each channel bends by a slightly different amount, which is the chromatic fringing. The seam is not the distance to the nearest cell centre, which says nothing about where a border is, but the gap between the two nearest, which goes to zero exactly on it.",
    pipeline: ["single pass · Voronoi cells, per-shard refraction, chromatic split"],
    techniques: ["Voronoi", "refraction offset", "chromatic aberration", "per-cell hashing"],
    cost: "light",
    accent: "#c4b5ff",
    controls: [
      ctl("shards", "Shards", 2, 18, 0.1, 7),
      ctl("refraction", "Refraction", 0, 1, 0.01, 0.35),
      ctl("chroma", "Dispersion", 0, 3, 0.01, 1),
    ],
  },
  {
    id: "mandelbulb",
    wgsl: mandelbulbWgsl,
    name: "Fractal Monolith",
    tagline: "A power-8 Mandelbulb with soft shadows and orbit-trap colour.",
    description:
      "Ten iterations of z → zⁿ + c in spherical coordinates, with the running derivative giving a distance estimate the raymarcher can trust. The exponent breathes, so the fractal reorganises itself instead of just spinning. The hit epsilon scales with distance to match the pixel footprint. A fixed threshold either speckles at the silhouette or eats detail up close. Colour comes from an orbit trap: how close the iteration came to the origin, which separates the exposed lobes from the cold recesses inside them.",
    pipeline: ["single pass · distance-estimated raymarch, soft shadows, 5-tap AO"],
    techniques: ["distance estimation", "orbit traps", "soft shadows", "ambient occlusion"],
    cost: "heavy",
    accent: "#ffbc57",
    controls: [
      ctl("power", "Power", 3, 12, 0.1, 8),
      ctl("spin", "Spin", 0, 4, 0.01, 1),
      ctl("glow", "Glow", 0.2, 2, 0.01, 1),
    ],
  },
  {
    id: "aurora",
    wgsl: auroraWgsl,
    name: "Aurora Veil",
    tagline: "Three noise-driven drapes hanging from a wandering ribbon.",
    description:
      "Each curtain hangs from a top edge whose position is fbm over x, sharp along that edge and dissolving downward. Brighter field lines reach further down, which is what stops the bottom from looking like a cropped rectangle, and shearing the whole sheet in x by y makes the lines converge with altitude. Colour follows real emission: magenta fringe at the top, oxygen green below.",
    pipeline: ["single pass · three layered fbm drapes over a star field"],
    techniques: ["fbm noise", "domain shear", "layered parallax", "additive emission"],
    cost: "light",
    accent: "#b890ff",
    controls: [
      ctl("brightness", "Brightness", 0.2, 2.2, 0.01, 1),
      ctl("drift", "Drift", 0.1, 3, 0.01, 1),
      ctl("fringe", "Fringe", 0, 1, 0.01, 0.5),
    ],
  },
  {
    id: "wormhole",
    wgsl: wormholeWgsl,
    name: "Wormhole",
    tagline: "One inverse-radius projection. No marching, and the depth is exact.",
    description:
      "A point at radius r on screen is a point at distance 1/r down the tube, and that single substitution is the whole projection. Panels are addressed in angle and depth, which makes them seamless around the tube. Almost: atan2 cuts at ±π and the angular index jumps by exactly the panel count across the cut, so it has to be wrapped, or a hard seam runs out of the throat for the whole animation.",
    pipeline: ["single pass · inverse-radius tunnel projection, cylindrical panels"],
    techniques: ["perspective by inverse radius", "cylindrical mapping", "depth fog"],
    cost: "light",
    accent: "#86fadd",
    controls: [
      ctl("speed", "Speed", 0, 2, 0.01, 0.5),
      ctl("twist", "Twist", 0, 4, 0.01, 1),
      ctl("flare", "Flare", 0, 2.5, 0.01, 1),
    ],
  },
  {
    id: "silk",
    wgsl: silkWgsl,
    name: "Iridescent Silk",
    tagline: "Thin-film interference over a twice-warped height field.",
    description:
      "One strong low-frequency warp bends the field into broad folds; a weaker second one adds the creases. The surface normal comes from the slope of that field, and the colour from thin-film interference, three cosines at RGB path lengths. Where the sheet turns faster than a pixel, the shader fades the interference bands toward their own average. That is what removes the rainbow speckle a naive per-pixel cosine leaves behind.",
    pipeline: ["single pass · domain-warped fbm, analytic normal, thin-film shading"],
    techniques: ["domain warping", "thin-film interference", "analytic normals", "band anti-aliasing"],
    cost: "medium",
    accent: "#c4b5ff",
    controls: [
      ctl("folds", "Fold scale", 0.8, 5, 0.01, 2.1),
      ctl("film", "Film", 0.3, 3, 0.01, 1),
      ctl("sheen", "Sheen", 0.2, 2, 0.01, 1),
    ],
  },
  {
    id: "arcs",
    wgsl: arcsWgsl,
    name: "Tesla Arc",
    tagline: "Bolts that re-fire on their own beat, drawn in polar space.",
    description:
      "Each bolt is a path in polar coordinates: a low-frequency term steers it outward in a lazy S, and a separate high-frequency term nudges the angle just enough to kink it. Putting the detail in the steering term instead collapses every arc into a spiral. Separating the two scales is the whole trick. Bolts live for a beat, then re-fire somewhere else.",
    pipeline: ["single pass · 7 polar filaments, 1/d² core plus corona"],
    techniques: ["polar domain", "fbm paths", "inverse-square glow", "temporal beats"],
    cost: "light",
    accent: "#8dbdf5",
    controls: [
      ctl("energy", "Energy", 0.2, 2.2, 0.01, 1),
      ctl("chaos", "Chaos", 0, 2.5, 0.01, 1),
      ctl("beat", "Fire rate", 0.2, 4, 0.01, 1.15),
    ],
  },
  {
    id: "mandala",
    wgsl: mandalaWgsl,
    name: "Mandala",
    tagline: "A noise field folded through a kaleidoscope until it has symmetry.",
    description:
      "The fold reflects each wedge rather than merely wrapping it. A wrap leaves a visible cut on every spoke; a mirror makes the two sides of the cut agree, and the seams close. Twisting by radius before the fold shears the wedge into spirals, and a thin bright line drawn exactly where the fbm crosses zero gives the figure its filigree.",
    pipeline: ["single pass · polar fold, radial twist, warped fbm"],
    techniques: ["kaleidoscopic fold", "radial twist", "cosine palette", "zero-crossing lines"],
    cost: "light",
    accent: "#b890ff",
    controls: [
      ctl("segments", "Segments", 3, 24, 1, 10),
      ctl("twist", "Twist", -2, 2, 0.01, 0.5),
      ctl("zoom", "Zoom", 0.5, 4, 0.01, 1.6),
    ],
  },
  {
    id: "truchet",
    wgsl: truchetWgsl,
    name: "Truchet",
    tagline: "Quarter arcs that join into one circuit, with light running along it.",
    description:
      "Every tile picks one of two arc pairs from a hash. Picking the same pair everywhere gives a grid of circles; alternating them is what makes a maze. The tile returns the arc-length position along whichever arc is nearer, not just the distance, and that is what lets a pulse travel through a junction instead of restarting at every tile edge.",
    pipeline: ["single pass · Truchet tiling, per-tile phase, arc-length pulses"],
    techniques: ["Truchet tiles", "arc-length parametrisation", "per-cell hashing", "glow falloff"],
    cost: "light",
    accent: "#86fadd",
    controls: [
      ctl("scale", "Tile scale", 3, 20, 0.1, 9),
      ctl("flow", "Flow", 0, 4, 0.01, 1.4),
      ctl("glow", "Charge", 0, 2.5, 0.01, 1),
    ],
  },
  {
    id: "hexgrid",
    wgsl: hexgridWgsl,
    name: "Hex Reactor",
    tagline: "A lattice charged by travelling wavefronts and a scan sweep.",
    description:
      "A hex grid is two offset rectangular lattices; the nearer candidate wins, which gives both the cell id and the local offset in a handful of instructions. Building that id from the lattice index matters: recovering it as position minus offset leaves a few ulps of per-pixel jitter, and any per-cell function sharp enough to matter turns that jitter into bands inside the cell. The rim width comes from the screen-space derivative, so it stays a pixel wide at any zoom.",
    pipeline: ["single pass · dual-lattice hex tiling, per-cell energy"],
    techniques: ["hex tiling", "screen-space derivatives", "wavefronts", "per-cell hashing"],
    cost: "light",
    accent: "#86fadd",
    controls: [
      ctl("charge", "Charge", 0.2, 2.2, 0.01, 1),
      ctl("density", "Cell density", 5, 26, 0.5, 11),
      ctl("sweep", "Sweep", 0, 4, 0.01, 1),
    ],
  },
  {
    id: "rain",
    wgsl: rainWgsl,
    name: "Datastream",
    tagline: "Three planes of dot-matrix glyphs, falling at their own speeds.",
    description:
      "Each glyph is a 5×7 dot matrix whose cells switch on from hash bits, so nobody had to draw the font. The id alone picks the character. Columns run at their own speed with their own tail length, characters churn on their own clock, and three planes at different densities parallax against the pointer. A scanline mask and a slow roll bar finish it as a tube.",
    pipeline: ["single pass · 3 glyph planes, procedural dot-matrix font, CRT mask"],
    techniques: ["procedural glyphs", "hash fonts", "depth parallax", "CRT emulation"],
    cost: "light",
    accent: "#86fadd",
    controls: [
      ctl("density", "Density", 0.4, 2.2, 0.01, 1),
      ctl("speed", "Fall speed", 0.1, 3, 0.01, 1),
      ctl("bleed", "Phosphor", 0, 2.5, 0.01, 1),
    ],
  },
]

export const EFFECTS: readonly HeroEffect[] = ENTRIES.map((e) =>
  "wgsl" in e ? { ...e, create: fullscreen(e.wgsl, e.controls) } : e
)

export type { HeroEffect } from "./types"
