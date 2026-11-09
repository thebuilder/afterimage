import type { Control, HeroEffect, Wgsl } from "./types"
import { fullscreen } from "./fullscreen"

import auroraWgsl from "@/shaders/aurora.wgsl"
import chromeWgsl from "@/shaders/chrome.wgsl"
import arcsWgsl from "@/shaders/arcs.wgsl"
import blackholeWgsl from "@/shaders/blackhole.wgsl"
import silkWgsl from "@/shaders/silk.wgsl"
import prismWgsl from "@/shaders/prism.wgsl"
import truchetWgsl from "@/shaders/truchet.wgsl"
import oceanWgsl from "@/shaders/ocean.wgsl"
import harborWgsl from "@/shaders/harbor.wgsl"
import overprintWgsl from "@/shaders/overprint.wgsl"
import letterlightWgsl from "@/shaders/letterlight.wgsl"
import windwallWgsl from "@/shaders/windwall.wgsl"

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

import { createMisted } from "./misted/pipeline"
import mistedStep from "./misted/step.wgsl"
import mistedPresent from "./misted/present.wgsl"

import { createRaking } from "./raking/pipeline"
import rakingGarden from "./raking/garden.wgsl"

import { createFerro } from "./ferro/pipeline"
import ferroWgsl from "./ferro/ferro.wgsl"

import { createChladni } from "./chladni/pipeline"
import chladniStep from "./chladni/step.wgsl"
import chladniPresent from "./chladni/present.wgsl"

import { createThermo } from "./thermo/pipeline"
import thermoStep from "./thermo/step.wgsl"
import thermoPresent from "./thermo/present.wgsl"

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
type SinglePass = Omit<HeroEffect, "create"> & {
  readonly wgsl: Wgsl
  /** Draw at this fraction of the surface, on top of whatever `quality` asks for. */
  readonly renderScale?: number
}
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
    rationale: {
      idea: "A river of light made from 140,000 particles, each following a current that never repeats.",
      firstSeconds: "Slow and luminous: pink and blue filaments braid across a black field, thickening where the currents meet.",
      interaction: "The pointer is a stone in the stream. It parts the current around it, so the filaments bend away and close up again behind your hand.",
      headline: "The darker eddies between the strands, the lower left most of all, where the trails thin out over black.",
      nearest: "Murmuration, the other effect made of thousands of moving points. There each point is a bird that answers its neighbours; here the points have no will and only show the shape of the current.",
      risks: "Too much Trail turns the strands into an even haze, and pink glow on black can look generic. It is one compute step and one draw, and the particle count follows quality, so it stays fast.",
    },
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
    // 180 geodesic steps per pixel is the heaviest pass here. The disk and the
    // lensing are soft-edged, so a 0.7 render upscaled loses nothing visible.
    renderScale: 0.7,
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
    rationale: {
      idea: "A black hole seen from just above its disk, close enough that gravity bends the far side of the disk up and over the shadow.",
      firstSeconds: "Still and monumental: a dark sphere ringed by a burning disk, the camera drifting slowly around it so the lensing shifts as you watch.",
      interaction: "The pointer swings the camera around the hole and the bent disk reshapes with it, which is what shows the image is light being pulled off course.",
      headline: "The black sky either side of the disk and the lower left, where only faint stars sit.",
      nearest: "Liquid Chrome, the other single object in a dark room. Chrome bounces light off a surface; here there is no surface, only light bent by mass.",
      risks: "At 180 steps per pixel it is the heaviest single pass in the archive, so it draws at 0.7 of the screen and upscales; the disk is soft enough that nobody sees the difference. The image is also familiar from film, so it has to be exact to earn its place.",
    },
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
    rationale: {
      idea: "An open sea at the end of the day, with nothing in frame but water, sky and a low sun.",
      firstSeconds: "Calm and cinematic: a grey-green swell rolls toward you under a hazy sky, and the low sun glitters on every crest.",
      interaction: "The pointer turns your head, panning along the horizon and tipping the view, so the sun's glitter path swings across the water.",
      headline: "The pale sky above the horizon, which is even and quiet across the whole width.",
      nearest: "Lowlight Harbor, also a sea at dusk. That one is a small illustrated place in sixteen colours; this is a photographic sea with no subject but the water.",
      risks: "A sea with no subject can feel like stock footage, and too much Chop turns the sun's reflection into static. Five Newton steps instead of a full march keep it cheap.",
    },
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
    rationale: {
      idea: "A living pattern grown by two chemicals reacting, lit from the side so it reads as relief, like coral or skin.",
      firstSeconds: "Dense and organic: maze-like ridges cover the frame and creep outward, with spots dividing where the balance shifts.",
      interaction: "Moving the pointer paints fresh chemical into the medium, so new growth starts under your hand and spreads into the pattern.",
      headline: "The lower left. The pattern still runs into the corner, but there it is drawn dim and flat, so the title sits on a quiet continuation of the growth.",
      nearest: "Iridescent Silk, the other surface lit as relief. Silk is a folded sheet in motion; this surface is grown, and it keeps rebuilding its own structure.",
      risks: "Fine detail everywhere fights type, which is why it goes quiet under the title. Twelve simulation steps per frame are cheap one by one but add up on a large screen.",
    },
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
    rationale: {
      idea: "A dark fluid you can stir, where dye curls into eddies behind your hand.",
      firstSeconds: "Slow and smoky: pale plumes of dye rise through black fluid and fold into each other.",
      interaction: "Dragging pushes the fluid itself, so the dye follows your gesture and curls into vortices that keep turning after you stop. It is the most direct interaction in the archive.",
      headline: "The black fluid above and between the plumes, the lower left included, which stays empty until you stir it.",
      nearest: "Flux Field, the other current you can disturb. Flux shows a current through particle trails; here you push the fluid itself and watch it answer.",
      risks: "Left alone it relies on a gentle convection field, and if that reads as still the page looks unfinished. Skipping the pressure solve keeps it to a few cheap passes per frame.",
    },
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
    rationale: {
      idea: "A sphere of plates that breaks apart and rebuilds itself, like a small planet made of tiles.",
      firstSeconds: "Sculptural: a faceted ball turns in the centre while its plates lift and settle, catching blue and sand-coloured light.",
      interaction: "The pointer pries the shell open. Plates facing it lift clear and warm up, each by its own amount, while the camera swings to let you look into the gaps.",
      headline: "The empty dark around the sphere, the left side and lower left above all.",
      nearest: "Liquid Chrome, the other single form at centre. Chrome melts into smooth shapes; this one cracks into hard facets.",
      risks: "Bloom can blur the plates into haze, and a ball in the middle of the screen is a familiar composition. Lifting plates is done in the vertex stage, so it costs nothing extra per pixel.",
    },
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
    rationale: {
      idea: "A flock of birds at dusk, whose shape comes only from each bird watching its neighbours.",
      firstSeconds: "Calm and patient: thousands of small darts circle in a slow ring that breathes and drifts.",
      interaction: "Dragging through the flock scatters it, and you watch it find itself again, which is the rules made visible.",
      headline: "The hollow in the middle of the ring and the dark edges, which the flock rarely crosses.",
      nearest: "Flux Field, also thousands of moving points. Those follow a current; these follow each other, so the flock answers you and regroups.",
      risks: "Small bright darts on dark blue can read as screensaver stars, and the milling ring settles into the same shape every visit. Every bird checks every other, which is fine at 1,400 birds but would not scale.",
    },
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
    rationale: {
      idea: "Molten metal under hard studio light, six droplets fusing and parting as they orbit.",
      firstSeconds: "Glossy and slow: a dark chrome mass turns in a studio, strip lights sliding across it as the forms merge.",
      interaction: "The pointer moves the camera, so the reflections of the studio lights slide over the metal the way they would on a real object.",
      headline: "The dark studio left of the form, where the backdrop is smooth and even.",
      nearest: "Event Horizon, the other single object in a dark room. There light bends through empty space; here it bounces off a surface.",
      risks: "Metaballs are a familiar demo, so the studio lighting has to carry it. Eighty-eight raymarch steps per pixel is mid-weight: fine on a laptop, but not free.",
    },
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
    rationale: {
      idea: "A sheet of broken glass over a colour field, each shard bending what lies behind it its own way.",
      firstSeconds: "Bright and busy: a mosaic of violet and teal shards drifts and turns, with pale seams catching the light.",
      interaction: "The pointer pulls the refraction toward it, so the shards seem to lean as you move.",
      headline: "The lower left, where the shards stop bending and melt into the unbroken colour behind them, like a pane of smoked glass.",
      nearest: "Iridescent Silk, the other effect about colour from optics. Silk is one smooth film; this is many flat facets, and the colour comes from splitting light, not from interference.",
      risks: "Stained glass in violet and teal can read as wallpaper, and bright seams compete with type, so they fade out where the title sits. One cheap Voronoi pass, so speed is not the issue.",
    },
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
    rationale: {
      idea: "Northern lights over a quiet night sky, in the colours real auroras glow.",
      firstSeconds: "Still and cold: green curtains with magenta tops hang over a field of stars and sway slowly.",
      interaction: "The pointer sets off a substorm. The curtains above it dip, brighten, reach further down and shiver, and the three layers shift against each other for depth.",
      headline: "The dark sky low in the frame where the curtains fade out, and the lower left.",
      nearest: "Deep Water, the other open sky. That one is daylight reflected off a sea; this is light the sky gives off itself, at night.",
      risks: "Auroras are a common wallpaper, so the curtains have to stay thin and the colour true, and the storm has to stay a shiver rather than a wobble. Three noise layers keep it light.",
    },
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
    rationale: {
      idea: "A folded sheet of fabric that shifts through oil-slick colour as it moves.",
      firstSeconds: "Soft and expensive-looking: violet folds slide over each other, with green and gold rising where the creases turn.",
      interaction: "The pointer changes your viewing angle and the colour shifts with it, the way a real thin film does, so it feels like tilting the cloth.",
      headline: "The broad, flatter folds in the lower left, where the colour is most even. It is mid-tone everywhere, so the text shadow does the work.",
      nearest: "Prism, the other effect about colour from optics. There flat shards split the light; here one curved film interferes with itself.",
      risks: "Oil-slick iridescence is a common 3D trend and turns to sludge if the film is too thick. Fading the bands where they would alias stops it sparkling, and it is one pass.",
    },
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
    rationale: {
      idea: "A plasma core throwing electric bolts that strike out, burn and fire again elsewhere.",
      firstSeconds: "Tense and bright: a glowing core with violet bolts kinking outward in short bursts.",
      interaction: "The core follows the pointer lazily and drags its bolts with it, so you hold the charge in your hand.",
      headline: "The lower left, away from the core at the centre. Bolts reach the edges, but only for a beat.",
      nearest: "Aurora Veil, the other picture made of emitted light. The aurora drifts; these strike.",
      risks: "Lightning is loud, a plasma ball is a gift-shop object, and the bursts flash in a way that fights reading. Seven bolts in one pass is cheap.",
    },
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
    rationale: {
      idea: "A maze of tiles where light runs along paths nobody drew.",
      firstSeconds: "Quiet and graphic: thin teal curves cover a black field, and pulses of light travel along them.",
      interaction: "The pointer charges the circuit near it, so the paths around your hand brighten and the pulses show where they lead.",
      headline: "Anywhere, with care. The lines are thin over black, so type reads, but the pattern runs edge to edge.",
      nearest: "Windwall, the other wall of small parts that answers in waves. Windwall is physical metal catching light; this is a flat diagram where the light runs along the lines.",
      risks: "It is a pattern rather than a picture, and can read as a background texture. It is very cheap.",
    },
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
    id: "harbor",
    name: "Lowlight Harbor",
    published: "2026-11-02",
    wgsl: harborWgsl,
    category: "Pixel art",
    tagline: "A dithered harbour at dusk, its lighthouse turning through the night.",
    summary:
      "Twin lighthouse beams sweep across a pixel-art harbour and flare as they swing toward you, while the water mirrors it all and ripples wherever you hover. Palette repaints the scene by colour slot, and Resolution sets how big each pixel is.",
    explanation: [
      { title: "Build the scene", body: "Sky, moon, three ridgelines, an island and a lighthouse, all drawn from formulas at a coarse pixel grid." },
      { title: "Mirror it", body: "Below the horizon each pixel looks up at its reflection, nudged sideways row by row by the swell." },
      { title: "Snap to sixteen colours", body: "A checkerboard dither picks between the two nearest colours, so gradients become pixel art." },
    ],
    rationale: {
      idea: "A pixel-art harbour at dusk, where a lighthouse sweeps the night and the sea mirrors every pixel of it.",
      firstSeconds: "Still and nostalgic: a quiet dithered sky, a slow swell and two beams turning on their own, so it is alive before anyone touches it.",
      interaction: "The pointer stirs the water it hovers over and shifts the ridges in parallax, so the reflection breaks up and the scene gains depth.",
      headline: "The open sky above the ridges, and the dark water in the lower left where the title already sits.",
      nearest: "Deep Water, also a dusk sea. That one is a photoreal ocean; this is a small illustrated place with a story, drawn in sixteen colours.",
      risks: "Pixel art can read as a retro gimmick on a serious brand, and too fine a Resolution loses the chunky charm. It is one cheap pass, so speed is not the worry.",
    },
    technical: {
      insight: "Swapping a palette by slot number recolours the whole scene the way old consoles did, without redrawing anything.",
      pipeline: [
        "single pass · procedural scene at art-pixel resolution, mirrored water, Bayer dither, indexed palette",
      ],
      techniques: [
        "pixel quantisation",
        "Bayer ordered dither",
        "indexed palette swap",
        "planar reflection",
        "rim lighting from slope",
      ],
      notes:
        "Every fragment is snapped to its art-pixel cell first, so the whole scene evaluates once per cell and edges stay hard at any screen size. The water evaluates the scene a second time at the mirrored point, with a per-row offset and squashed ripple rings for perspective. Colour is computed loosely, then a 4x4 Bayer threshold is added and the result matched to the nearest of sixteen Dusk slots; the output is that slot's colour in whichever palette is selected, so Frost and Ember are pure lookups. Ridge rim light comes from the slope of each height function against the moon direction.",
      source: "src/shaders/harbor.wgsl",
    },
    accent: "#ffdf7a",
    controls: [
      ctl("palette", "Palette", 0, 2, 0.01, 0),
      ctl("rows", "Resolution", 90, 320, 1, 180),
      ctl("beam", "Lamp", 0, 1.6, 0.01, 1),
    ],
  },
  {
    id: "overprint",
    name: "Overprint",
    published: "2026-11-03",
    wgsl: overprintWgsl,
    category: "Print",
    tagline: "A three-ink risograph sunset, slipping out of register under your hand.",
    summary:
      "A poster printed in fluorescent pink, blue and yellow, where every tone is made of dots. Move the pointer and the three plates slide apart like loose sheets while a loupe shows the dots up close. Screen sets the dot size, Register how far the plates drift, and Ink how heavily each one prints.",
    explanation: [
      { title: "Separate", body: "The picture is drawn as three tones, one for each ink, the way a printer splits artwork into plates." },
      { title: "Screen", body: "Each tone becomes a field of dots on its own tilted grid, bigger where the ink is darker." },
      { title: "Press", body: "The inks are laid over warm paper one at a time and multiply where they overlap, slightly out of line with each other." },
    ],
    rationale: {
      idea: "A risograph poster of a sunset, printed in three fluorescent inks that slip out of register under your hand.",
      firstSeconds: "Warm and tactile: a light paper ground and bright dots, the opposite of the dark glowing heroes around it, with ripples moving on the sea.",
      interaction: "The plates part as the pointer moves, showing how the colours are built, and a loupe magnifies the dots so the print becomes the picture.",
      headline: "The bare paper in the sky and margins. Dark type reads on it like ink on a real poster.",
      nearest: "Lowlight Harbor, which also imitates an old medium and also sets a sun over water. That one is a dark screen in sixteen colours; this is ink on paper, and the only light-ground effect so far.",
      risks: "The loupe could feel like a demo trick, and a large Register makes it look broken rather than printed. Dense dots can shimmer when scaled down on a phone.",
    },
    technical: {
      insight: "Real misregistration is the whole plate moving, so each ink samples both the artwork and its dot grid through the same offset.",
      pipeline: [
        "single pass · procedural art separated into three tones, three rotated cosine halftone screens, subtractive overprint, magnifier",
      ],
      techniques: [
        "AM halftone screening",
        "cosine spot function",
        "subtractive ink mixing",
        "plate misregistration",
        "magnifier remap",
      ],
      notes:
        "Each plate uses a cosine spot function, 0.5 + 0.25(cos 2πx + cos 2πy), thresholded against the tone. It gives round dots in the highlights, a checkerboard at 50% and round holes near solid, and because it is continuous across cells there are no seams even though the tone is read per pixel. The screens sit at 75°, 15° and 45°, so overlapping inks form rosettes instead of a beat pattern. Coverage is anti-aliased with fwidth of the spot value, roughened with high-frequency noise gated by tone so blank paper stays clean, and modulated by low-frequency starvation and fine grain. Inks are transmittances multiplied over the paper in press order. The loupe remaps the print coordinate toward the pointer before anything is sampled, so it magnifies dots, grain and misregistration together.",
      source: "src/shaders/overprint.wgsl",
    },
    accent: "#fc5490",
    controls: [
      ctl("screen", "Screen", 0.4, 2.2, 0.01, 1),
      ctl("slip", "Register", 0, 4, 0.01, 1),
      ctl("gain", "Ink", 0.5, 1.8, 0.01, 1),
    ],
  },
  {
    id: "letterlight",
    name: "Letterlight",
    published: "2026-11-03",
    wgsl: letterlightWgsl,
    category: "Type",
    tagline: "A turning sculpture set entirely in letters, relit by the lamp in your hand.",
    summary:
      "A twisted column turns in a dark room, drawn only in letters: heavy capitals where the light lands, thin ones and dots where it falls away, strokes along the edges and a typed shadow on the wall. Move the pointer to carry the lamp. Type size sets how many lines of letters fill the screen, Lamp how bright it burns, and Spin how fast the sculpture turns.",
    explanation: [
      { title: "Light the form", body: "The screen is divided into letter-sized cells, and each one works out how much lamp light lands on the sculpture behind it." },
      { title: "Choose a letter", body: "Fourteen letters are lined up by how much ink they use, from a full stop to an @, and each cell takes the one that matches its brightness. Edges get a stroke that follows the outline." },
      { title: "Cast the shadow", body: "Cells that miss the sculpture look at the wall instead, where the lamp leaves a pool of dots and the sculpture blocks out its shadow." },
    ],
    rationale: {
      idea: "A slowly turning sculpture typeset entirely in letters, lit by a lamp you hold, so the light itself is written.",
      firstSeconds: "Quiet and sculptural: a twisted column turns in a dark room while a lamp drifts around it on its own, and the letters reset themselves as the light slides across each face.",
      interaction: "The pointer is the lamp. Moving it rewrites every face of the sculpture, swings its typed shadow across the wall and turns the brightest glints ember.",
      headline: "The dark left half and lower left, where the wall stays unlit until the lamp is carried there. On a phone the sculpture rises and leaves the lower half empty.",
      nearest: "Overprint, the other picture built from printed marks. There ink dots make a flat poster; here every letter is chosen for its ink to describe light on a solid form that turns.",
      risks: "ASCII art can read as a terminal novelty, so the type is soft inked letterforms on a warm dark ground, not green phosphor. Raymarching every pixel could be slow, so rays that miss a bounding sphere never march, and too much churn would read as noise, so cells only re-roll near the edge of a brightness step.",
    },
    technical: {
      insight: "Letters make a usable grey scale once they are sorted by how much ink they lay down.",
      pipeline: [
        "single pass · per-cell sphere trace of a twisted rounded box, Lambert and Phong from a moving lamp, soft wall shadow, glyph lookup from a packed 5x7 font",
      ],
      techniques: [
        "ASCII shading",
        "coverage-sorted glyph ramp",
        "bit-packed bitmap font",
        "sphere tracing",
        "soft shadows",
        "bounding-sphere culling",
      ],
      notes:
        "Every fragment snaps to the centre of its letter cell before anything is computed, so all pixels in a cell agree on one ray, one brightness and one letter. The ray is sphere-traced against a rounded box twisted along its height, but only between the entry and exit of a bounding sphere, so most of the screen never marches. The lit value picks one of fourteen glyphs sorted by pixel count, with a per-cell offset that re-rolls about once a second so cells near a step flicker between neighbours like type being reset. Where the normal turns edge-on the cell takes |, /, - or a backslash from the screen-space normal angle instead. The font is 5x7 bits packed into two u32s per glyph and read bilinearly, then thresholded, which rounds the pixel letters into soft inked forms. Missed rays hit a wall plane lit by the lamp, darkened by a short soft-shadow march toward it, and typed with only the four lightest glyphs. The lamp is placed so its pool lands under the pointer.",
      source: "src/shaders/letterlight.wgsl",
    },
    accent: "#ff7338",
    controls: [
      ctl("size", "Type size", 30, 96, 1, 52),
      ctl("lamp", "Lamp", 0.4, 1.8, 0.01, 1),
      ctl("spin", "Spin", 0, 3, 0.01, 1),
    ],
  },
  {
    id: "windwall",
    name: "Windwall",
    published: "2026-11-04",
    wgsl: windwallWgsl,
    category: "Kinetic",
    tagline: "A facade of metal fins rippling in the wind, with warm light hidden behind it.",
    summary:
      "A dark facade of hinged metal fins ripples as wind rolls across it, each fin catching the light for an instant as a gust passes. Move the pointer to blow on it: the fins lift and warm light spills out from behind. Wind sets how hard it blows, Fins how many rows cover the wall, and Glow how bright the light behind them burns.",
    explanation: [
      { title: "Blow", body: "A slow field of gusts rolls across the wall with ripples running through it, and each fin works out how far it should swing." },
      { title: "Swing", body: "Each fin hangs from its top edge, so as it lifts it gets shorter from the front and its face tilts toward the ground." },
      { title: "Catch the light", body: "The tilted face reflects a dim sky, a dark street and one low warm lamp. Only the fins at exactly the right angle flash." },
    ],
    rationale: {
      idea: "A kinetic facade of a few thousand hinged metal fins rippling in the wind, where your pointer is a gust that lifts them and lets out the warm light behind.",
      firstSeconds: "Calm and architectural: a dark wall of brushed fins, glints running along the gust fronts as the wind rolls across, and a warm glow breathing through the fins at the centre.",
      interaction: "The pointer is a gust. It lifts the fins around it so the hidden light spills out, and sends rings of glints rolling outward through the wall.",
      headline: "The lower left, where the air is calmer and the fins lie flat and dark. The upper left between gusts holds a headline too.",
      nearest: "Truchet, the other field of small repeated parts that answers in waves. Truchet is a flat diagram of light; here the parts are physical metal plates that only reflect, moved by wind you can almost feel.",
      risks: "Thousands of glints could read as noise, so the wind moves in broad gusts and the highlight is narrow enough that only the fronts catch it. Small fins can shimmer, so their size follows screen height. It is one pass with three noise lookups per pixel, so it stays light.",
    },
    technical: {
      insight: "A wall of mirrors shows the wind as light: a fin only flashes when its angle lines up with the lamp, so the glints trace the gust fronts.",
      pipeline: [
        "single pass · per-cell wind field, hinged fin projection, curved-fin reflection of a three-tone environment, backlit wall through the gaps",
      ],
      techniques: [
        "cell-space instancing",
        "simplex wind field",
        "environment reflection",
        "narrow specular lobe",
        "analytic projection",
      ],
      notes:
        "Every fragment finds its fin from floor(p * rows), so wind, flutter and gust are evaluated at the cell centre and the whole fin moves as one plate. A fin hinged at its top with swing a projects to a height of len * cos(a) hanging from its rail, which is all the geometry needed: below it, the gap shows the wall. The normal tilts down with a, takes a little per-fin yaw, and bends slightly along the fin so a highlight slides down it rather than switching the fin on. The view ray reflects into an environment of dim overcast sky, dark street and one warm key low and to the right, whose lobe is raised to the 220th power, so only fins within a few degrees of the right angle flash and gust fronts become lines of glints. The wall behind is lit by a pool under the pointer and a low glow, and shaded just under each lifted fin. The pointer adds a lift with a Gaussian falloff plus a decaying travelling ring, and the lower left gets calmer air for the title.",
      source: "src/shaders/windwall.wgsl",
    },
    accent: "#e8c9a0",
    controls: [
      ctl("wind", "Wind", 0, 2, 0.01, 1),
      ctl("fins", "Fins", 28, 80, 1, 44),
      ctl("glow", "Glow", 0, 2, 0.01, 1),
    ],
  },
  {
    id: "misted",
    // Heavy per pixel on a retina screen; capped so laptop GPUs stay calm.
    maxDpr: 1.25,
    name: "Misted",
    published: "2026-11-05",
    category: "Window",
    tagline: "A fogged window on a city at night. Wipe it to see out.",
    summary:
      "A pane of glass fogged over on a cold night, the city behind it reduced to soft blooms of light. Wipe the glass with the pointer and the lights snap into crisp bokeh, while drips slide down on their own and the fog slowly creeps back. Brush sets the size of your hand, Refog how fast the glass mists over, and Drips how often water runs.",
    explanation: [
      { title: "Remember the glass", body: "A small texture records how clear each part of the window is. Every frame the fog creeps back a little, faster in some patches than others." },
      { title: "Wipe and drip", body: "The pointer clears a soft stroke from where it was to where it is, and drips slide down their own columns, each leaving a thin clear trail." },
      { title: "Look through", body: "Clear glass shows the city as crisp bokeh; fogged glass spreads the same lights into a pale glow beaded with tiny droplets, and wiped edges gather water." },
    ],
    rationale: {
      idea: "A fogged window on a city at night that you wipe clear with your hand, and that slowly mists over again.",
      firstSeconds: "Quiet and cinematic: soft blooms of city light through misted glass, an unseen hand wiping one stroke clear to show crisp bokeh, and a drip sliding down.",
      interaction: "Wiping reveals the sharp city behind the fog, and it is the only effect where your mark stays and fades: leave and the glass forgets you over a few seconds.",
      headline: "The fog itself. Untouched glass is a soft, low-contrast surface, and the lower left sits on dark street with the lights thinned out.",
      nearest: "Prism, the other glass effect. Prism bends a fixed image through hard shards; this is a soft, wet surface that remembers where you touched it.",
      risks: "Bokeh can look like a stock photo, so the lights are a layered street with depth and drifting traffic, not a wallpaper. Wiping could get old, so drips and patchy refog keep the glass changing on its own. One small mask pass plus a cheap present keeps it fast.",
    },
    technical: {
      insight: "The window remembers only one number per texel, how clear it is, and everything you see is read from that single soft mask.",
      pipeline: [
        "step · decay the clear mask with patchy refog, stamp the pointer stroke as a capsule, clear drip heads",
        "present · three layers of procedural lights as crisp bokeh and as wide glow, mixed by the mask, droplet lenses, wet edges and drip beads",
      ],
      techniques: [
        "feedback mask",
        "capsule brush stroke",
        "procedural bokeh",
        "jittered-grid lights",
        "droplet lenses",
      ],
      notes:
        "The state is a single channel in an rgba16float ping-pong at most 720 texels on its long edge, because a slow refog is a smaller change per frame than 8 bits can hold. Each step subtracts a refog rate scaled by low-frequency noise, so the fog grows back in patches, then stamps the pointer as a capsule from the previous position to this one, which keeps fast strokes continuous. Drips are analytic: each of about 26 columns per screen height may hold one whose head follows a hashed speed with a stall and sideways wander, and both passes evaluate the same path, so the bead always sits on its trail. The city is three jittered grids of lights, each evaluated once as a bokeh disc with a slightly bright rim and once as a broad Gaussian; the mask chooses between them per pixel, which stands in for a blur without sampling anything. Fogged areas add a haze that brightens with the light behind it and a 150-per-unit grid of droplet lenses. Before the visitor moves, an unseen hand wipes one stroke across the middle so the first seconds already show the reveal.",
      source: "src/effects/misted",
    },
    accent: "#ffb36b",
    controls: [
      ctl("brush", "Brush", 0.5, 2, 0.01, 1),
      ctl("refog", "Refog", 0.2, 3, 0.01, 1),
      ctl("drips", "Drips", 0, 2.5, 0.01, 1),
    ],
    create: (setup) => createMisted(setup, { step: mistedStep, present: mistedPresent }),
  },
  {
    id: "raking",
    // Heavy per pixel on a retina screen; capped so laptop GPUs stay calm.
    maxDpr: 1.5,
    name: "Raking Light",
    published: "2026-11-06",
    category: "Garden",
    tagline: "A raked stone garden that only shows its lines when the sun is low.",
    summary:
      "Three stones sit in raked gravel, ringed by the lines a rake drew around them. Nothing in the garden moves except the sun: hold the pointer near the middle and it climbs overhead until the garden goes pale and flat, push it out to an edge and it sinks, raking long shadows across every groove. Rake sets the spacing of the lines, Depth how deep they are cut, and Drift how fast the sun circles when you let go.",
    explanation: [
      { title: "Rake the gravel", body: "The ground is a height field of rounded ridges: rings drawn round the stones, merging where stones sit close, and straight rows that stop just short of the outermost ring." },
      { title: "Place the stones", body: "Each stone is a lumpy dome standing far taller than the ridges, with a thin collar of moss where it meets the gravel." },
      { title: "Bring the sun down", body: "Every pixel looks toward the sun across the ground, and whatever rises in the way puts it in shadow. The lower the sun, the longer those shadows reach." },
    ],
    rationale: {
      idea: "A raked stone garden that is all but invisible under a high sun and comes alive in long raking shadows when you bring the sun down.",
      firstSeconds: "Calm and warm: pale gravel, three dark stones and a low sun circling slowly, so the shadows of the stones swing round like a day passing in a minute.",
      interaction: "The pointer is the sun. Near the centre it climbs overhead and the lines disappear; out toward an edge it sinks, and lines that run toward the light vanish while the ones across it leap out.",
      headline: "The open gravel on the left, where only the straight rows run and no stone sits. It flattens to an even pale field whenever the sun is high.",
      nearest: "Windwall, the other piece about light on a fixed surface. Windwall moves its fins and keeps the lamp still; here the garden never moves and the light is all you change.",
      risks: "Even rows could read as a stripe texture, so they wander, vary in depth and give way to rings around the stones, and the sand has grain so it never reads as plastic. A shadow march could get slow, so it takes sixteen growing steps over a cheap height field and stops as soon as a ray clears the tallest stone.",
    },
    technical: {
      insight: "Raking light is how conservators find hidden texture: a light skimming at a low angle turns heights too small to see into long shadows.",
      pipeline: [
        "cpu · steer the sun between a slow idle orbit and the pointer, with eased hand-over and warm low-sun colour",
        "fragment · analytic rake height field with concentric rings and domed stones, finite-difference normals, sixteen-step soft shadow march, sand and granite shading",
      ],
      techniques: [
        "height field shading",
        "soft shadow march",
        "raking light",
        "finite-difference normals",
        "eased light steering",
      ],
      notes:
        "The garden is a pure function of position. Each stone's wobbly outline gives a distance field, and the three are merged with a smooth minimum so neighbouring rings flow into one shape instead of meeting at a seam. Rings are ridges of that distance, a whole number of rake widths out, so the last ring lands exactly on the border; the straight rows, a ridge of y warped by one low-frequency simplex lookup, fade out just before it, the way a rake lifts, so the two patterns never cut across each other. Stones are lumpy domes some thirty times the height of the ridges, shaded matte with no specular, their normals roughened by two octaves of noise and their albedo mottled with grain and lichen; each few pixels of gravel tilts its normal at random so the sand has grain. Normals come from two extra height samples. The shadow marches toward the sun over the height field with steps that grow by a third each time, softened by the ray's clearance over distance, and stops once the ray climbs above the tallest stone. The sun is steered in TypeScript: it circles low on its own, follows the pointer while it is active, takes its elevation from how far out the pointer is, and eases back to the orbit over a few seconds. Exposure follows elevation, so noon reads as pale rather than white.",
      source: "src/effects/raking",
    },
    accent: "#d9c9a8",
    controls: [
      ctl("rake", "Rake", 0.6, 1.8, 0.01, 1),
      ctl("depth", "Depth", 0.3, 2, 0.01, 1),
      ctl("drift", "Drift", 0, 3, 0.01, 1),
    ],
    create: (setup) => createRaking(setup, rakingGarden),
  },
  {
    id: "ferro",
    // Heavy per pixel on a retina screen; capped so laptop GPUs stay calm.
    maxDpr: 1.25,
    name: "Ferro",
    published: "2026-11-07",
    category: "Magnetism",
    tagline: "A pool of black ferrofluid that bristles into spikes over the magnet in your hand.",
    summary:
      "A glossy black pool sits on a white plinth with a magnet beneath it. Where the field is strong enough the surface breaks into a crown of spikes, and as the magnet moves the crown follows while the rest of the pool is dragged along behind. Field sets the magnet's strength, Spikes how densely they pack, and Pull how slowly and stretchily the pool follows.",
    explanation: [
      { title: "Pour the pool", body: "The fluid is a soft blob with a rounded edge, joined by a tapering arm to wherever the magnet is, so it reaches toward it." },
      { title: "Switch on the field", body: "Spikes stand on a hexagonal grid. Each one only grows where the magnet's field at its foot passes a threshold, which is how real ferrofluid decides between smooth and spiked." },
      { title: "Light it like a product", body: "The camera looks down at an angle and every ray finds the surface by stepping down through it. The black fluid then reflects a dark studio, a big softbox and the white plinth." },
    ],
    rationale: {
      idea: "A pool of black ferrofluid on a white plinth that bristles into a crown of spikes wherever you hold the magnet.",
      firstSeconds: "Strange and tactile: a glossy black pool on clean white, its crown of spikes slowly wandering as an unseen magnet circles underneath.",
      interaction: "The pointer is the magnet. Spikes rise only where you hold it, and a quick move pulls the crown away so the pool stretches out after it, smooth and spikeless, until it catches up.",
      headline: "The bare white plinth on the left. The pool lives right of centre, and dark type on white is the easiest headline there is.",
      nearest: "Liquid Chrome, the other glossy liquid. Chrome is molten forms merging under hard light; this is a single pool that answers a field, with a structure, the spike lattice, that only appears under force.",
      risks: "Marching a height field could be slow, so only pixels whose ray can meet the pool march at all, in 64 steps and a short bisection. Top-down ferrofluid reads as bubble wrap, so the camera is tilted. A black blob could be dull, so the spikes catch a softbox and the pool trails the magnet.",
    },
    technical: {
      insight: "Ferrofluid only grows spikes above a critical field strength, so a soft threshold on the field at each spike's foot is enough to make them appear and vanish convincingly.",
      pipeline: [
        "cpu · magnet follows the pointer or an idle loop; pool centre chases it on a damped spring",
        "fragment · tilted orthographic camera, 64-step height-field march plus bisection, smooth-union pool and arm, hexagonal spike lattice gated by field strength, studio reflection with Fresnel",
      ],
      techniques: [
        "height-field ray marching",
        "bisection refinement",
        "hexagonal lattice",
        "smooth union",
        "damped spring",
        "Fresnel reflection",
      ],
      notes:
        "The pool is a signed distance: a wobbling disc at the spring-driven pool centre, smoothly unioned with a tapered capsule out to the magnet, so a fast move stretches it into an arm. Height is a narrow meniscus at the edge plus a smooth Gaussian dome, kept apart from the distance field so its creases never show in reflections, plus a heap under the magnet and the spikes: a concave cone on every cell of a hexagonal lattice, scaled by a smoothstep of the field at the cell's foot with a little per-cell jitter. The camera is orthographic and tilted 47 degrees, so each pixel's ray is a straight line from the top of the scene to the floor; it steps down that line 64 times, bisects the crossing five times, and takes normals from two extra height samples. Pixels whose ray cannot reach the pool skip the march. The surface is nearly black with a Fresnel-weighted reflection of a dark studio, a large softbox ahead and the bright plinth near the horizon. On narrow screens the camera pulls back so the pool still fits.",
      source: "src/effects/ferro",
    },
    accent: "#d8d6d0",
    controls: [
      ctl("field", "Field", 0.3, 1.8, 0.01, 1),
      ctl("spikes", "Spikes", 0.6, 1.6, 0.01, 1),
      ctl("pull", "Pull", 0.4, 2.5, 0.01, 1),
    ],
    create: (setup) => createFerro(setup, ferroWgsl),
  },
  {
    id: "chladni",
    name: "Chladni",
    published: "2026-11-08",
    category: "Sound",
    tagline: "Sand on a singing steel plate, gathering into the figure of whichever note you play.",
    summary:
      "A square steel plate is clamped at its centre and bowed into a note. Sand hops off the parts that move and comes to rest along the lines that stay still, drawing the note's figure grain by grain. Move across the screen to tune the plate: between notes the sand only shivers, and on the next one it races into a new figure. Bow sets how hard the plate is driven, Sand how much is scattered on it, and Tempo how quickly it changes note when left alone.",
    explanation: [
      { title: "Find the still lines", body: "Each note sets the plate ringing in a standing wave. Most of the plate moves up and down, but along certain lines it never moves at all." },
      { title: "Shake the sand", body: "Grains on a moving patch are tossed about and land a little further downhill of the motion, so over a few seconds they all end up on the still lines." },
      { title: "Tune between notes", body: "Only a true resonance makes the plate ring. Halfway between two notes it barely moves, so the old figure holds until the next note pulls the sand apart." },
    ],
    rationale: {
      idea: "A steel plate clamped at its centre and bowed into a note, with white sand running off the moving parts and gathering on the still lines into the note's Chladni figure.",
      firstSeconds: "The plate starts evenly dusted, and within two seconds the sand visibly crawls into a crisp, symmetric figure. Every few seconds the note changes, the figure breaks up and a new one assembles.",
      interaction: "Moving across the screen tunes the plate. You hear nothing, but you see the note: between resonances the sand only shivers, and landing on one makes it race into a new figure, so you are playing an instrument by sight.",
      headline: "The bare dark bench on the left. The plate sits right of centre and the sand is its only bright thing, so light type on the left never competes with it.",
      nearest: "Membrane, the other pattern that grows. Membrane is chemistry spreading on its own; here every grain is pushed by a physical standing wave, the figure is exact and symmetric, and it changes the moment you change the note.",
      risks: "A crossfade between pictures would read as fake, so the sand is a real simulation that never loses a grain. Grains on a pixel grid look like noise, so they sit on two tilted grids with their own sizes. Half floats leak sand on deep piles, so the state is full precision.",
    },
    technical: {
      insight: "Sand on a vibrating plate drifts down the gradient of the squared amplitude, so moving density along that gradient, conservatively, draws an exact Chladni figure without tracking a single particle.",
      pipeline: [
        "cpu · note follows the pointer across the screen, or walks the resonances on its own; resonance strength falls off between whole notes",
        "fragment × 4 · finite-volume sand step on a 512² grid: upwind drift toward the nodal lines plus scattering that grows with the plate's motion, ping-ponged in r32float",
        "fragment · blued steel plate with bevel and bolt, sand drawn as two layers of hashed grains on tilted grids, deep piles shaded as heaps with a cast shadow",
      ],
      techniques: [
        "Chladni plate modes",
        "finite-volume advection",
        "upwind scheme",
        "nonlinear diffusion",
        "ping-pong simulation",
        "hashed grain rendering",
      ],
      notes:
        "A free square plate clamped at its centre rings in modes cos(nπx)cos(mπy) ± cos(mπx)cos(nπy); the plate walks a list of ten of them, and resonance strength falls smoothly to nothing halfway between two. The sand is a density on a 512 by 512 grid. Each step moves it across every cell face with an upwind flux driven by minus the gradient of the squared amplitude, scaled to the mode's spacing, and adds scattering whose strength grows with the local motion plus a little that grows with pile depth, so heaps slump along their line. Because every face's flow leaves one cell and enters its neighbour, no sand is ever lost; the grid is r32float, since half floats round away the trickle arriving at a deep pile. Four substeps run per frame, as two pairs of passes with fixed bindings. The present pass filters the grid by hand, draws grains from two hashed grids at different tilts so no lattice shows, lets grains on moving patches flicker as they hop, and shades thick piles from the density gradient with a short cast shadow.",
      source: "src/effects/chladni",
    },
    accent: "#e8e2d6",
    controls: [
      ctl("bow", "Bow", 0.4, 1.6, 0.01, 1),
      ctl("sand", "Sand", 0.5, 2, 0.01, 1),
      ctl("tempo", "Tempo", 0.4, 2.5, 0.01, 1),
    ],
    create: (setup) => createChladni(setup, { step: chladniStep, present: chladniPresent }),
  },
  {
    id: "thermo",
    name: "Thermochrome",
    published: "2026-11-09",
    category: "Heat",
    tagline: "A black liquid crystal sheet that blooms through the spectrum wherever it is touched.",
    summary:
      "A sheet of thermochromic film over a black backing. Where it is warmed it turns rust, gold, green, blue and violet, and as it cools it runs back down the spectrum to black. Left alone, an unseen hand presses a palm print onto it now and then. Your touch is a fingertip: move slowly and it burns hot and blue, swipe quickly and it leaves only a copper line. Warmth sets how much heat a touch gives, and Cooling how fast the sheet forgets.",
    explanation: [
      { title: "Remember the heat", body: "The sheet keeps a temperature for every patch. A touch adds heat, it spreads a little sideways through the film, and it slowly bleeds away into the room." },
      { title: "Speed is temperature", body: "Each frame a fingertip gives the same heat, spread along however far it moved, so lingering burns hot and a quick swipe barely warms the film." },
      { title: "Read it as colour", body: "Liquid crystal reflects a different colour at each temperature: black when cool, then rust through to violet, and dark again past its range, so the hottest middle of a palm goes black with a rainbow rim." },
    ],
    rationale: {
      idea: "A black thermochromic sheet that holds the heat of a touch as colour, blooming through the spectrum where it is warmed and fading back to black as it cools.",
      firstSeconds: "Black, then an unseen palm presses flat and lifts, leaving a glowing handprint with a dark burnt-out middle and a rainbow rim that slowly cools from violet to rust and fades. Another print follows a few seconds later.",
      interaction: "The pointer is a warm fingertip, and how long you linger is the colour. Slow strokes burn blue and violet, quick ones leave copper lines, and every mark cools through the whole spectrum, so you are drawing with time.",
      headline: "The black sheet on the left. The unseen hand only presses right of centre, and everything it leaves fades to black, so the left stays clear.",
      nearest: "Misted, the other surface that remembers your touch. Misted wipes fog away to reveal a city behind; here nothing is revealed, the touch itself becomes the image, and its colour tells how warm and how recent it was.",
      risks: "A plain heat map would read as a thermal camera, so the palette follows real liquid crystal, including going dark again past its range. Fast pointers could leave nothing, so any touch warms the film a little. A cartoon hand would cheapen it, so the print is warmest in the palm, coolest at the fingertips, and blurs as heat spreads.",
    },
    technical: {
      insight: "Depositing a fixed amount of heat per frame along the stroke turns pointer speed into temperature for free: the slower you move, the more heat each patch of film receives.",
      pipeline: [
        "cpu · pointer strokes joined only within one gesture; an unseen hand presses a palm on a timer while nobody touches",
        "fragment · heat step on a capped grid: five-tap diffusion, exponential cooling, segment-shaped fingertip deposit, palm print from a hand SDF",
        "fragment · liquid crystal palette from heat, noise-warped lookup for ragged band edges, satin sheen and film grain",
      ],
      techniques: [
        "ping-pong simulation",
        "heat diffusion",
        "signed distance fields",
        "smooth union",
        "thermochromic palette",
        "domain warping",
      ],
      notes:
        "Heat lives in an rgba16float ping-pong buffer capped at 640 pixels on its long edge. Each frame it is mixed toward the mean of four neighbours two texels away, multiplied down by an exponential cooling term, and nudged to exactly zero. A fingertip deposits heat along the segment from the last pointer position with a Gaussian falloff, divided by the segment's length so slow strokes run hot, and never less than a small floor so a swipe still shows. The unseen hand is a smooth union of a rounded box and five capsules, mirrored for a left hand, with an extra Gaussian of warmth at the palm's centre; it only presses while the pointer is idle. The present pass maps heat through nine liquid crystal keys from black through rust, copper, gold, green, turquoise, blue and violet back to near black, and warps the lookup with slow noise so the colour bands have living edges.",
      source: "src/effects/thermo",
    },
    accent: "#3fc6b4",
    controls: [
      ctl("warmth", "Warmth", 0.4, 2, 0.01, 1),
      ctl("cool", "Cooling", 0.3, 3, 0.01, 1),
    ],
    create: (setup) => createThermo(setup, { step: thermoStep, present: thermoPresent }),
  },
]

export const EFFECTS: readonly HeroEffect[] = ENTRIES.map((e) =>
  "wgsl" in e ? { ...e, create: fullscreen(e.wgsl, e.controls, e.renderScale) } : e
)

export type { HeroEffect } from "./types"
