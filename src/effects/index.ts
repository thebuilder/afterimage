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
      headline: "The lower left. The kill rate climbs toward that corner until nothing survives, so the growth breaks into scattered spots and then a calm dark shore under the title.",
      nearest: "Iridescent Silk, the other surface lit as relief. Silk is a folded sheet in motion; this surface is grown, and it keeps rebuilding its own structure.",
      risks: "Fine detail everywhere fights type, which is why the lower left is kept barren. Twelve simulation steps per frame are cheap one by one but add up on a large screen.",
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
]

export const EFFECTS: readonly HeroEffect[] = ENTRIES.map((e) =>
  "wgsl" in e ? { ...e, create: fullscreen(e.wgsl, e.controls, e.renderScale) } : e
)

export type { HeroEffect } from "./types"
