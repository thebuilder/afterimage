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
    category: "Particles",
    tagline: "A river of light shaped by invisible currents.",
    summary:
      "Thousands of particles drift through a flow field that never repeats, and each one leaves a fading trail. Turn up Flow to twist the current, or Trail to let the paths linger.",
    explanation: [
      { title: "Move", body: "Every particle follows a current that keeps changing." },
      { title: "Leave a trace", body: "Each new frame blends into the fading one before it." },
      { title: "Add light", body: "Bloom tints the stacked trails and softens them into filaments." },
    ],
    technical: {
      insight: "All 140,000 particles move in a single step on the GPU.",
      pipeline: [
        "compute · curl-noise advection (ping-pong storage)",
        "pass 1 · fade previous trails, then additive instanced splat",
        "pass 2 · dual-radius bloom + filmic tonemap to canvas",
      ],
      techniques: [
        "compute shader",
        "storage ping-pong",
        "instancing",
        "HDR feedback",
        "bloom",
      ],
      notes:
        "A compute pass advects every particle through the curl of a noise field, so the flow is divergence-free and the streaks braid instead of pooling. The buffer is ping-ponged, never read and written in one dispatch. A single instanced draw then spawns one additive sprite per particle straight out of storage. No vertex buffer exists. Sprites land in an HDR trail target that fades a few percent each frame, which is where the filaments come from.",
      source: "src/effects/flux",
    },
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
        // Quality scales area, so the population follows it squared: a tile at
        // 0.85 draws into ~72% of the pixels and gets ~72% of the particles,
        // which keeps the density of the streaks the same as the hero's. The
        // floor keeps a tile from thinning out into visible specks, and the
        // pipeline divides sprite energy by the count, so exposure is unmoved.
        { count: Math.max(30_000, Math.round(140_000 * Math.min(1, setup.quality) ** 2)) }
      ),
  },
  {
    id: "blackhole",
    wgsl: blackholeWgsl,
    name: "Event Horizon",
    category: "Space",
    tagline: "Light bends around a black hole and its burning disk.",
    summary:
      "Light cannot travel straight this close to a black hole, so the far side of the disk curves up and over the shadow. Orbit moves the camera, Tilt changes the angle you watch from.",
    explanation: [
      { title: "Bend", body: "Each pixel follows a ray of light as gravity pulls it off course." },
      { title: "Cross the disk", body: "Where a ray meets the disk, it picks up its colour." },
      { title: "Brighten", body: "The side of the disk spinning toward you comes out brighter." },
    ],
    technical: {
      insight: "Every pixel traces its own path around the hole.",
      pipeline: [
        "single pass · 180-step geodesic integration per pixel",
      ],
      techniques: [
        "ray integration",
        "gravitational lensing",
        "relativistic beaming",
        "procedural stars",
      ],
      notes:
        "Each pixel launches a photon and steps it through the deflection term −1.5·h²·r̂/r⁵, with the specific angular momentum held constant. That single term is enough to produce the photon ring at 1.5 r_s and to lift the far side of the accretion disk up over the shadow. Where a ray crosses the equatorial plane the march interpolates back to the exact crossing point, which keeps the disk edge clean, and relativistic beaming brightens the side rotating toward the camera.",
      source: "src/shaders/blackhole.wgsl",
    },
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
    category: "Water",
    tagline: "A restless ocean catches the last light of the day.",
    summary:
      "Six wave trains cross at different angles and speeds, and the sun scatters off every crest. Swell sets the wave height, Chop the fine texture riding on top.",
    explanation: [
      { title: "Stack waves", body: "Six travelling waves add up into an uneven sea." },
      { title: "Meet the surface", body: "A few steps close in on the exact point where your view hits the water." },
      { title: "Catch the sun", body: "The angle of each crest decides its reflection and its foam." },
    ],
    technical: {
      insight: "The shader solves where your view meets the waves.",
      pipeline: [
        "single pass · Newton-solved heightfield, procedural sky, sun glitter",
      ],
      techniques: [
        "heightfield ray solve",
        "Gerstner-style waves",
        "fresnel",
        "subsurface",
      ],
      notes:
        "Six travelling sines, each shaped by exp(sin−1) so the crests sharpen and the troughs flatten, and each dragging the domain along its own direction so the octaves never line up into a grid. The surface is not marched: the ray starts on the flat plane and five Newton steps pull it onto the water, which converges everywhere a sphere tracer would need fifty steps. The normal footprint widens with distance, because a 220-power specular lobe on a surface that changes faster than a pixel aliases into static.",
      source: "src/shaders/ocean.wgsl",
    },
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
    category: "Landscape",
    tagline: "An endless mountain range forming out of noise and haze.",
    summary:
      "Noise folded back on itself becomes ridges, valleys and a snow line, and distance does the rest. Erosion sharpens the ridges, Haze sets how far you can see.",
    explanation: [
      { title: "Fold noise", body: "Folding noise turns smooth hills into sharp ridges." },
      { title: "Find the ground", body: "The view steps forward until it meets the surface." },
      { title: "Add air", body: "Distant peaks fade into the colour of the sky." },
    ],
    technical: {
      insight: "None of the terrain is stored. It is worked out where you look.",
      pipeline: [
        "single pass · growing-step march, 9-step bisection refine, aerial perspective",
      ],
      techniques: [
        "ridged multifractal",
        "bisection refine",
        "slope shading",
        "atmospheric scattering",
      ],
      notes:
        "Folding each noise octave with 1−|n| turns the rolling hills of plain fbm into creases, and weighting every octave by the previous one keeps the detail on the ridges and off the valley floors, roughly where erosion leaves it. The march grows its step with distance and then bisects the bracketing interval nine times, because a step fine enough for the near ground would never reach the horizon. Aerial perspective does the rest.",
      source: "src/shaders/terrain.wgsl",
    },
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
    category: "Simulation",
    tagline: "A living pattern grows, divides and hardens into relief.",
    summary:
      "Two chemicals spread through each other and one converts the other where they meet. Feed and Kill shift that balance, which is the difference between spots, mazes and coral.",
    explanation: [
      { title: "Spread", body: "Both chemicals diffuse across the frame, at different speeds." },
      { title: "React", body: "Where they meet, one turns into the other." },
      { title: "Light it", body: "The shader reads how much is left as height, and lights it from the side." },
    ],
    technical: {
      insight: "Two invented chemicals react and spread across the image.",
      pipeline: [
        "pass 1..12 · Gray-Scott step, ping-pong rgba16float",
        "pass 13 · gradient → normal, lit as a membrane",
      ],
      techniques: [
        "ping-pong targets",
        "multi-pass sim",
        "float targets",
        "gradient shading",
      ],
      notes:
        "Two chemicals live in the red and green channels of an HDR ping-pong pair. Twelve simulation passes run per displayed frame, each a nine-point Laplacian plus the Gray-Scott reaction term. A five-point stencil grows the pattern along the pixel axes and comes out looking woven. Feed and kill rates drift across the frame, so one image holds several regimes at once: mitosis in one corner, coral in another. The final pass reads the chemical field as a height map and lights it.",
      source: "src/effects/reaction",
    },
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
    category: "Fluid",
    tagline: "Drag through the fluid and watch colour curl behind you.",
    summary:
      "Dye rises through a fluid that carries and folds it. Drag anywhere to push the fluid, and Vorticity decides how tightly it curls behind your hand.",
    explanation: [
      { title: "Look back", body: "Every point asks where its colour was a moment ago." },
      { title: "Add spin", body: "A small force puts back the eddies that would otherwise smear away." },
      { title: "Light the dye", body: "The shader reads the dye as a surface and shades its edges." },
    ],
    technical: {
      insight: "Each frame traces the fluid backwards to find where its colour came from.",
      pipeline: [
        "pass 1..3 · advect + vorticity confinement + injection",
        "pass 4 · dye gradient shading",
      ],
      techniques: [
        "semi-Lagrangian advection",
        "vorticity confinement",
        "float ping-pong",
        "pointer forces",
      ],
      notes:
        "Velocity lives in the red and green channels, dye in blue. Each step traces backwards along the velocity to find what arrives at a texel, which is unconditionally stable in a way that pushing forwards is not, then adds a confinement force pointing along the curl gradient to put back the eddies advection keeps smearing out. There is no pressure projection: skipping the Jacobi solve costs incompressibility, which looks like dye that spreads slightly too eagerly, and buys one pass per step instead of twenty.",
      source: "src/effects/ink",
    },
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
    category: "Geometry",
    tagline: "A faceted sphere breaks apart and rebuilds itself.",
    summary:
      "Noise pushes a sphere's surface in and out, and sampling that noise in steps snaps it into plates. Displace sets how far they travel, Facets how large they are.",
    explanation: [
      { title: "Push the surface", body: "Noise moves every point of the sphere along its normal." },
      { title: "Break into plates", body: "Sampling in steps makes whole triangles move together." },
      { title: "Light the faces", body: "Each plate takes its shading from the direction it now faces." },
    ],
    technical: {
      insight: "The only effect here built from real geometry rather than a full-screen shader.",
      pipeline: [
        "pass 1 · indexed draw into an offscreen rgba16float + depth target",
        "pass 2 · composite and bloom onto the canvas",
      ],
      techniques: [
        "scene geometry",
        "vertex displacement",
        "depth target",
        "screen-space normals",
      ],
      notes:
        "The only effect here that is not a fullscreen pass. An icosphere from vgpu/scene becomes vertex and index buffers, and the vertex stage displaces each point along its normal by 3D noise sampled at a quantised position, so a whole triangle shares one displacement and the sphere breaks into plates. The fragment stage takes its normal from how world position changes across the 2×2 quad rather than from the interpolated vertex normal, which is what keeps the facets flat. Surfaces have no depth attachment, so the scene renders to an offscreen depth target and comes across in a second pass.",
      source: "src/effects/lattice",
    },
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
    category: "Flocking",
    tagline: "A flock scatters, circles and finds its shape again.",
    summary:
      "Every bird follows three rules about its neighbours, and the shape of the flock is only ever what those rules add up to. Drag through it to scatter them.",
    explanation: [
      { title: "Look around", body: "Each bird takes in every other bird near it." },
      { title: "Steer", body: "It moves toward the group, matches their heading, and keeps its distance." },
      { title: "Settle", body: "Left alone, the flock finds a slow circling shape and holds it." },
    ],
    technical: {
      insight: "Every bird reacts to the position and heading of every other bird.",
      pipeline: [
        "compute · O(n²) flocking, ping-pong storage",
        "pass 1 · instanced oriented darts into an HDR buffer",
        "pass 2 · bloom and composite",
      ],
      techniques: [
        "compute shader",
        "n-body flocking",
        "instancing",
        "alpha blending",
      ],
      notes:
        "Classic Reynolds flocking in a compute pass: cohesion toward the local centroid, alignment with the local heading, separation weighted by inverse distance. Every bird tests every other, which is the wrong algorithm above a few thousand but beats a spatial hash here with no grid to build and a straight run through coalesced memory. Left alone the flock finds its torus state and mills; the pointer scatters it, and it reforms. The separation term has to be averaged over the neighbour count, or it grows with density and blows the flock into a shell against the walls.",
      source: "src/effects/boids",
    },
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
    category: "Atmosphere",
    tagline: "Clouds gather, thin and catch the sun from within.",
    summary:
      "Your view walks through a volume of noise and gathers light as it goes. Coverage decides how much sky fills in, Density how solid it becomes.",
    explanation: [
      { title: "Step through", body: "The view takes many small steps through a layer of cloud." },
      { title: "Measure the light", body: "At every step it looks toward the sun to see how much survives." },
      { title: "Build up", body: "The steps stack into shape, shadow, and a bright rim." },
    ],
    technical: {
      insight: "Nothing here is solid. Each pixel is hundreds of samples added up.",
      pipeline: [
        "single pass · 46-step volume march, 4-step light march per sample",
      ],
      techniques: [
        "volumetric raymarch",
        "Beer-Lambert",
        "forward scattering",
        "blue-noise offset",
      ],
      notes:
        "Forty-six steps through a 3D noise slab, each one taking four more steps toward the sun to work out how much light survives to it. Coverage subtracts a constant before the clamp, which is what turns one noise field into anything from wisps to overcast. Two details do most of the work: the march span is capped, because a near-horizontal ray crosses unbounded slab and accumulates an opaque wall, and the first sample is dithered per pixel, because uniform starts put the step pattern on screen as banding.",
      source: "src/shaders/clouds.wgsl",
    },
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
    category: "Material",
    tagline: "Molten forms merge beneath hard studio light.",
    summary:
      "Six spheres orbit and fuse where they come close. Melt sets how readily they join, Spin how fast the whole mass turns under the lights.",
    explanation: [
      { title: "Merge", body: "Where two spheres approach, the surface between them fills in." },
      { title: "Find the skin", body: "The view steps forward until it touches that surface." },
      { title: "Reflect", body: "The metal shows a studio that exists only inside the shader." },
    ],
    technical: {
      insight: "The metal look comes from what the surface reflects, not from its colour.",
      pipeline: [
        "single pass · sphere-traced SDF, ~88 steps, environment reflection",
      ],
      techniques: [
        "signed distance fields",
        "smooth minimum",
        "fresnel",
        "procedural HDRI",
      ],
      notes:
        "A polynomial smooth-minimum joins six orbiting spheres, so they melt rather than intersect, and the raymarcher finds the surface from that distance field. The environment is what makes it read as metal: a dome with hard-edged strip lights, a warm key, a cold kicker. Swap in a smooth gradient and the same geometry renders as plastic. Chrome needs something crisp to reflect.",
      source: "src/shaders/chrome.wgsl",
    },
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
    category: "Glass",
    tagline: "A field of glass shards bends the image into colour.",
    summary:
      "Scattered points break the frame into shards, and each one bends what lies behind it its own way. Dispersion pushes the colours further apart.",
    explanation: [
      { title: "Shatter", body: "Scattered points divide the frame into cells." },
      { title: "Bend", body: "Each shard offsets whatever sits behind it." },
      { title: "Split", body: "Red, green and blue bend by slightly different amounts." },
    ],
    technical: {
      insight: "Each shard gets its angle from a number derived from its own position.",
      pipeline: [
        "single pass · Voronoi cells, per-shard refraction, chromatic split",
      ],
      techniques: [
        "Voronoi",
        "refraction offset",
        "chromatic aberration",
        "per-cell hashing",
      ],
      notes:
        "Every shard hashes to a facet angle and a thickness, and refracts the backdrop by a constant offset, because a flat facet bends everything behind it the same way. Each channel bends by a slightly different amount, which is the chromatic fringing. The seam is not the distance to the nearest cell centre, which says nothing about where a border is, but the gap between the two nearest, which goes to zero exactly on it.",
      source: "src/shaders/prism.wgsl",
    },
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
    category: "Fractal",
    tagline: "An impossible structure turns inside an endless fractal.",
    summary:
      "One equation, repeated, decides whether a point sits inside the shape or outside it. Power changes that equation, and the whole structure reorganises around it.",
    explanation: [
      { title: "Repeat", body: "A point goes through the same equation ten times over." },
      { title: "Measure", body: "How fast it escapes says how far the nearest surface is." },
      { title: "Walk", body: "The view steps exactly that far, then asks again." },
    ],
    technical: {
      insight: "The surface is never built. Each step works out how far away it still is.",
      pipeline: [
        "single pass · distance-estimated raymarch, soft shadows, 5-tap AO",
      ],
      techniques: [
        "distance estimation",
        "orbit traps",
        "soft shadows",
        "ambient occlusion",
      ],
      notes:
        "Ten iterations of z → zⁿ + c in spherical coordinates, with the running derivative giving a distance estimate the raymarcher can trust. The exponent breathes, so the fractal reorganises itself instead of just spinning. The hit epsilon scales with distance to match the pixel footprint. A fixed threshold either speckles at the silhouette or eats detail up close. Colour comes from an orbit trap: how close the iteration came to the origin, which separates the exposed lobes from the cold recesses inside them.",
      source: "src/shaders/mandelbulb.wgsl",
    },
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
    category: "Light",
    tagline: "Curtains of light drift above a field of stars.",
    summary:
      "Sheets of light hang from a wandering line and dissolve as they fall. Fringe decides how much magenta rides along the top edge.",
    explanation: [
      { title: "Hang a sheet", body: "A drifting line sets the top edge of each curtain." },
      { title: "Fall away", body: "Brightness fades downward, and the brighter rays reach further." },
      { title: "Colour by height", body: "Magenta sits at the top, green fills in underneath." },
    ],
    technical: {
      insight: "The colours follow real emission: magenta high up, oxygen green below.",
      pipeline: [
        "single pass · three layered fbm drapes over a star field",
      ],
      techniques: [
        "fbm noise",
        "domain shear",
        "layered parallax",
        "additive emission",
      ],
      notes:
        "Each curtain hangs from a top edge whose position is fbm over x, sharp along that edge and dissolving downward. Brighter field lines reach further down, which is what stops the bottom from looking like a cropped rectangle, and shearing the whole sheet in x by y makes the lines converge with altitude. Colour follows real emission: magenta fringe at the top, oxygen green below.",
      source: "src/shaders/aurora.wgsl",
    },
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
    category: "Tunnel",
    tagline: "A luminous tunnel twists toward a vanishing point.",
    summary:
      "Distance down the tunnel is simply the inverse of distance from the centre of the screen. Twist wrings the walls, Flare feeds the light at the far end.",
    explanation: [
      { title: "Invert", body: "A point near the centre reads as a point far away." },
      { title: "Wrap", body: "Panels run around the tube and away along its length." },
      { title: "Fade", body: "Everything deep in the tunnel washes toward its glow." },
    ],
    technical: {
      insight: "Nothing is traced. One division turns a flat image into depth.",
      pipeline: [
        "single pass · inverse-radius tunnel projection, cylindrical panels",
      ],
      techniques: [
        "perspective by inverse radius",
        "cylindrical mapping",
        "depth fog",
      ],
      notes:
        "A point at radius r on screen is a point at distance 1/r down the tube, and that single substitution is the whole projection. The shader addresses panels in angle and depth, which should leave no seam around the tube. It leaves one anyway. atan2 cuts at ±π, and the angular index jumps by exactly the panel count across that cut, so it has to be wrapped or a hard seam runs out of the throat for the whole animation.",
      source: "src/shaders/wormhole.wgsl",
    },
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
    category: "Fabric",
    tagline: "Folded fabric shifts through oil-slick colour.",
    summary:
      "A folded surface catches light as a thin film, so its colour depends on the angle you catch it from. Film sets the thickness, Fold scale the size of the folds.",
    explanation: [
      { title: "Fold", body: "Noise bends the surface into broad folds, then into finer creases." },
      { title: "Find the slope", body: "How steeply the surface turns gives it its direction." },
      { title: "Interfere", body: "Light off a thin film cancels at some colours and adds at others." },
    ],
    technical: {
      insight: "The colour is interference, the same effect as oil on water.",
      pipeline: [
        "single pass · domain-warped fbm, analytic normal, thin-film shading",
      ],
      techniques: [
        "domain warping",
        "thin-film interference",
        "analytic normals",
        "band anti-aliasing",
      ],
      notes:
        "One strong low-frequency warp bends the field into broad folds; a weaker second one adds the creases. The surface normal comes from the slope of that field, and the colour from thin-film interference, three cosines at RGB path lengths. Where the sheet turns faster than a pixel, the shader fades the interference bands toward their own average. That is what removes the rainbow speckle a naive per-pixel cosine leaves behind.",
      source: "src/shaders/silk.wgsl",
    },
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
    category: "Electricity",
    tagline: "Electric filaments strike, fade and fire again.",
    summary:
      "Bolts leave the core, wander outward and burn out, and new ones fire somewhere else. Chaos decides how wildly they kink on the way.",
    explanation: [
      { title: "Aim", body: "Each bolt picks a direction and pushes out from the core." },
      { title: "Kink", body: "A slow wobble steers it; a fast one breaks it into angles." },
      { title: "Burn out", body: "Bolts live for a beat, then fire again somewhere else." },
    ],
    technical: {
      insight: "The slow wobble and the fast one have to stay separate, or every bolt curls into a spiral.",
      pipeline: [
        "single pass · 7 polar filaments, 1/d² core plus corona",
      ],
      techniques: [
        "polar domain",
        "fbm paths",
        "inverse-square glow",
        "temporal beats",
      ],
      notes:
        "Each bolt is a path in polar coordinates: a low-frequency term steers it outward in a lazy S, and a separate high-frequency term nudges the angle just enough to kink it. Putting the detail in the steering term instead collapses every arc into a spiral. Separating the two scales is the whole trick. Bolts live for a beat, then re-fire somewhere else.",
      source: "src/shaders/arcs.wgsl",
    },
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
    category: "Pattern",
    tagline: "Noise folds into a precise, endlessly changing symmetry.",
    summary:
      "A shapeless noise field is folded into one wedge and mirrored around the circle. Segments sets how many wedges, Twist shears them into spirals.",
    explanation: [
      { title: "Fold", body: "The fold cuts the image into wedges and mirrors each one." },
      { title: "Twist", body: "Rotating by distance from the centre shears the wedge into a spiral." },
      { title: "Draw", body: "A bright line marks exactly where the noise crosses zero." },
    ],
    technical: {
      insight: "The noise underneath has no symmetry at all. The fold is what creates it.",
      pipeline: [
        "single pass · polar fold, radial twist, warped fbm",
      ],
      techniques: [
        "kaleidoscopic fold",
        "radial twist",
        "cosine palette",
        "zero-crossing lines",
      ],
      notes:
        "The fold reflects each wedge rather than merely wrapping it. A wrap leaves a visible cut on every spoke; a mirror makes the two sides of the cut agree, and the seams close. Twisting by radius before the fold shears the wedge into spirals, and a thin bright line drawn exactly where the fbm crosses zero gives the figure its filigree.",
      source: "src/shaders/mandala.wgsl",
    },
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
    category: "Circuit",
    tagline: "A glowing circuit redraws itself across a tiled maze.",
    summary:
      "Every tile holds two arcs, and which pair it picks decides the whole maze. Light then runs along whatever path the tiles happen to form.",
    explanation: [
      { title: "Tile", body: "Each tile picks one of two pairs of arcs." },
      { title: "Join", body: "The arcs meet at the tile edges, so paths carry on across the grid." },
      { title: "Pulse", body: "Light travels along each path and straight through its junctions." },
    ],
    technical: {
      insight: "Turn every tile the same way and the maze becomes a grid of circles.",
      pipeline: [
        "single pass · Truchet tiling, per-tile phase, arc-length pulses",
      ],
      techniques: [
        "Truchet tiles",
        "arc-length parametrisation",
        "per-cell hashing",
        "glow falloff",
      ],
      notes:
        "Every tile picks one of two arc pairs from a hash. Picking the same pair everywhere gives a grid of circles; alternating them is what makes a maze. The tile returns the arc-length position along whichever arc is nearer, not just the distance, and that is what lets a pulse travel through a junction instead of restarting at every tile edge.",
      source: "src/shaders/truchet.wgsl",
    },
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
    category: "Grid",
    tagline: "Hexagonal cells charge in waves beneath a scanning beam.",
    summary:
      "Waves travel out from the centre and from your pointer, charging cells as they pass. A beam sweeps up the lattice on a clock of its own.",
    explanation: [
      { title: "Tile", body: "Two offset grids together make a hexagonal one." },
      { title: "Charge", body: "A cell lights as a wavefront reaches it." },
      { title: "Sweep", body: "A separate beam runs up the lattice, lighting whole rows." },
    ],
    technical: {
      insight: "A hexagonal grid is two rectangular grids. Whichever is nearer wins.",
      pipeline: [
        "single pass · dual-lattice hex tiling, per-cell energy",
      ],
      techniques: [
        "hex tiling",
        "screen-space derivatives",
        "wavefronts",
        "per-cell hashing",
      ],
      notes:
        "A hex grid is two offset rectangular lattices; the nearer candidate wins, which gives both the cell id and the local offset in a handful of instructions. Building that id from the lattice index matters: recovering it as position minus offset leaves a few ulps of per-pixel jitter, and any per-cell function sharp enough to matter turns that jitter into bands inside the cell. The rim width comes from the screen-space derivative, so it stays a pixel wide at any zoom.",
      source: "src/shaders/hexgrid.wgsl",
    },
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
    category: "Terminal",
    tagline: "Layers of glyphs fall through a worn phosphor display.",
    summary:
      "Columns of characters fall at their own speeds across three layers, the nearest moving fastest. Density sets how tightly the columns pack together.",
    explanation: [
      { title: "Draw glyphs", body: "A number switches on the dots in a small grid to make each character." },
      { title: "Fall", body: "Every column runs at its own speed, with its own tail length." },
      { title: "Age", body: "Scanlines and a slow rolling bar finish it as a tube." },
    ],
    technical: {
      insight: "The glyphs come out of bits rather than a stored font.",
      pipeline: [
        "single pass · 3 glyph planes, procedural dot-matrix font, CRT mask",
      ],
      techniques: [
        "procedural glyphs",
        "hash fonts",
        "depth parallax",
        "CRT emulation",
      ],
      notes:
        "Each glyph is a 5×7 dot matrix whose cells switch on from hash bits, so nobody had to draw the font. The id alone picks the character. Columns run at their own speed with their own tail length, characters churn on their own clock, and three planes at different densities parallax against the pointer. A scanline mask and a slow roll bar finish it as a tube.",
      source: "src/shaders/rain.wgsl",
    },
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
