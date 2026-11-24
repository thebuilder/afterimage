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

import { createHarmonograph } from "./harmonograph/pipeline"
import harmonographDraw from "./harmonograph/draw.wgsl"
import harmonographPresent from "./harmonograph/present.wgsl"

import { createMoire } from "./moire/pipeline"
import moireWgsl from "./moire/moire.wgsl"

import { createLido } from "./lido/pipeline"
import lidoSim from "./lido/sim.wgsl"
import lidoPresent from "./lido/present.wgsl"

import { createSurvey } from "./survey/pipeline"
import surveySculpt from "./survey/sculpt.wgsl"
import surveyPresent from "./survey/present.wgsl"

import { createVigil } from "./vigil/pipeline"
import vigilWgsl from "./vigil/vigil.wgsl"

import { createMeadow } from "./meadow/pipeline"
import meadowSpring from "./meadow/spring.wgsl"
import meadowPresent from "./meadow/present.wgsl"
import { createNoctiluca } from "./noctiluca/pipeline"
import noctilucaSim from "./noctiluca/sim.wgsl"
import noctilucaPresent from "./noctiluca/present.wgsl"
import { createKintsugi } from "./kintsugi/pipeline"
import kintsugiFlow from "./kintsugi/flow.wgsl"
import kintsugiPresent from "./kintsugi/present.wgsl"
import { createFolio } from "./folio/pipeline"
import folioWgsl from "./folio/folio.wgsl"
import { createCalibre } from "./calibre/pipeline"
import calibreWgsl from "./calibre/calibre.wgsl"
import { createEnso } from "./enso/pipeline"
import ensoInk from "./enso/ink.wgsl"
import ensoPresent from "./enso/present.wgsl"
import { createLanterns } from "./lanterns/pipeline"
import lanternsWgsl from "./lanterns/lanterns.wgsl"
import { createEbru } from "./ebru/pipeline"
import ebruMarble from "./ebru/marble.wgsl"
import ebruPresent from "./ebru/present.wgsl"
import { createFocus } from "./focus/pipeline"
import focusLens from "./focus/lens.wgsl"
import focusStill from "./focus/still.wgsl"
import { createKoi } from "./koi/pipeline"
import koiPond from "./koi/pond.wgsl"
import koiWater from "./koi/water.wgsl"

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
    touch: "drag",
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
    touch: "drag",
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
    touch: "drag",
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
  {
    id: "harmonograph",
    name: "Harmonograph",
    published: "2026-11-10",
    category: "Drawing",
    tagline: "Two pendulums swing a pen across cream paper, and a sweep of your hand flings it wide.",
    summary:
      "A Victorian drawing machine: two pendulums swing a pen over a sheet of laid paper on a slowly turning table. Each swing dies away, so the pen spirals inward through dozens of loops and leaves a fine figure in blue-black ink, darker where lines cross. When the swing has died, the sheet clears and a new figure begins. Moving the pointer pushes the pendulums in the direction you move, so the pen flies out on a new path and the figure carries your gesture as it winds back in. Speed sets how fast the pen moves, Weight the line, and Damping how quickly each swing dies.",
    explanation: [
      { title: "Swing the pendulums", body: "Each axis is driven by two pendulums at nearly the same rate. Their sum beats slowly, and x against y in a simple ratio, such as two to three, sets the figure." },
      { title: "Let it die away", body: "Every swing loses a little energy each cycle, so the loops shrink toward the middle, and the paper table turns slowly beneath the pen so they never retrace." },
      { title: "Give it a push", body: "Moving the pointer adds to the pendulums' velocity in the direction you move. The pen stays where it is but sets off on a wider, new path, and the damping winds it back in." },
      { title: "Lay the ink", body: "Each frame only the pixels near the pen's path are touched. The stretch the pen covered is inked with flat ends, so frames join without beads, and ink pools darker where the pen slows." },
    ],
    rationale: {
      idea: "A pendulum drawing machine that traces a fine, ever-tightening figure in ink on cream paper, and that you can push.",
      firstSeconds: "A small steel pen is already moving, sweeping big confident loops across the paper; within ten seconds dozens of fine lines have built up into a symmetrical, woven figure.",
      interaction: "The pointer pushes the pendulums the way a hand would: sweep across the paper and the pen is flung wide in that direction at once, then winds back into the figure. The sheet keeps every push, so each drawing is a record of how you handled the machine.",
      headline: "The empty paper on the left. The figure is drawn right of centre and never leaves its circle, and dark type on cream is the easiest headline there is.",
      nearest: "Ink, the other effect where ink lands on paper. Ink is a fluid that blooms and drifts; here a single precise line is laid by machinery, nothing moves once drawn, and the picture is made of time.",
      risks: "A shader redrawing the whole curve every frame would be slow, so the sheet keeps the ink and only the pixels near this frame's stretch of path do any work. A push that moved the pen would draw a jump, so it changes only the pendulums' velocity, never their position. Round line ends would bead every join, so both ends are cut flat.",
    },
    technical: {
      insight: "Keeping the drawing in a texture and inking only the stretch of path the pen covered this frame makes an endlessly growing figure cost almost nothing, however many loops it holds.",
      pipeline: [
        "cpu · each pendulum's amplitude and phase carried frame by frame; pointer movement added to their velocity as a push; sheet timing and the box the pen swept this frame",
        "fragment · ink pass on a screen-sized half-float sheet: pixels outside the swept box copy through; the rest measure distance to 24 flat-ended segments of the path and add ink",
        "fragment · laid paper, ink darkening as it crosses itself with a faint bleed, and a steel pen with its shadow",
      ],
      techniques: [
        "harmonograph",
        "decaying Lissajous curves",
        "persistent ink buffer",
        "bounding-box culling",
        "segment distance fields",
        "impulse on an oscillator",
      ],
      notes:
        "Each axis is the sum of two damped sines at nearly equal frequency, so the axis beats slowly, and the axes run in a simple ratio that changes from sheet to sheet; the whole is rotated by a slowly turning table. Each pendulum's amplitude and phase are carried on the CPU and passed as they stand at the start of the frame. Pointer movement, turned into the table's frame, is added to the pendulums' velocity: position and new velocity give a new amplitude and phase, capped so the pen stays on the paper, and the pen swings off on the new path without a jump. The ink lives in an rgba16float ping-pong buffer at screen resolution, capped at 2400 pixels. Each frame the CPU evaluates the pen at 25 points over the frame's stretch of pendulum time and passes their bounding box; pixels outside it copy their ink and return. Inside, the shader measures distance to the 24 segments, cutting the first and last flat so neighbouring frames never ink the same spot twice, and adds coverage scaled up where the pen moves slowly. When the swing has died away, the pen lifts, the sheet fades out over a second and a half, and a new sheet begins with fresh phases and the next ratio.",
      source: "src/effects/harmonograph",
    },
    accent: "#1d2550",
    controls: [
      ctl("speed", "Speed", 0.4, 2.5, 0.01, 1),
      ctl("weight", "Weight", 0.5, 2.5, 0.01, 1),
      ctl("damping", "Damping", 0.5, 2.5, 0.01, 1),
    ],
    create: (setup) => createHarmonograph(setup, { draw: harmonographDraw, present: harmonographPresent }),
  },
  {
    id: "moire",
    name: "Moiré",
    published: "2026-11-11",
    category: "Optics",
    tagline: "Two sheets of printed rings on a light table, and broad fringes that swing with the slightest move.",
    summary:
      "Two clear acetate sheets, each printed with hundreds of fine concentric rings, lie on a warm light table, one on top of the other. Where the rings cross, big soft fringes appear that are printed on neither sheet. The top sheet slides with your hand, and because a shift of a single ring width moves every fringe across the disc, the smallest movement sends them sweeping. Pitch sets how fine the rings are, Scale how much larger the top sheet's rings are than the bottom's.",
    explanation: [
      { title: "Print the rings", body: "Each sheet is a set of concentric rings, drawn from the distance to its centre. The lines are box-filtered over each pixel, so they stay crisp up close and fade to an even grey where they get finer than a pixel." },
      { title: "Stack the sheets", body: "Light from the table passes through the bottom ink and then the top, so the two multiply. Where rings fall between each other the light is blocked; where they line up it gets through. That slow alternation is the moiré." },
      { title: "Slide the top one", body: "The pointer moves the top sheet a small fraction of its own travel, on a stiff spring. Two sets of rings with offset centres make fringes shaped like hyperbolas, and every ring width of offset adds another pair." },
    ],
    rationale: {
      idea: "Two acetate sheets of fine printed rings on a light table, where the picture you see is the interference between them and not on either sheet.",
      firstSeconds: "Crisp and graphic: a dark disc of hairline rings on warm white, with soft fringes already slowly turning through it as the top sheet drifts.",
      interaction: "The pointer slides the top sheet. Moiré magnifies motion, so a hand moving a few centimetres sends the fringes sweeping across the whole disc and reshaping, from a bow tie to a fan to a target. It feels like the pattern is far more alive than the hand that moves it.",
      headline: "The empty light table on the left. The sheets sit right of centre, and dark type on warm white is the easiest headline there is.",
      nearest: "Overprint, the other effect about inks layered on a light ground. Overprint is a riso image with misregistered colours; here nothing is drawn at all, and the only picture is the interference that two simple patterns make.",
      risks: "Fine rings alias into false moiré of the screen's own, so every line is box-filtered over its pixel footprint and fades to grey before it can. Too dark a pair of inks turns the disc into a black hole, so the lines are thinner than their gaps. It is one cheap pass with no loops, so it costs almost nothing.",
    },
    technical: {
      insight: "Moiré is a magnifier for motion: shifting one pattern by a single line width moves every fringe by a whole fringe, so a tiny input reads as a big, smooth change.",
      pipeline: [
        "cpu · sheet layout from aspect; top sheet follows the pointer at a fraction of its travel on a stiff, slightly underdamped spring, or a slow loop when idle",
        "fragment · two concentric square-wave ring sets, each box-filtered with fwidth, multiplied through the table light, with clear acetate, cut edges and a soft drop shadow",
      ],
      techniques: [
        "moiré interference",
        "box-filtered square wave",
        "analytic antialiasing",
        "multiplicative compositing",
        "damped spring",
      ],
      notes:
        "Each sheet's rings are a square wave in the distance to its centre divided by the pitch. Instead of thresholding, the shader integrates the wave over the pixel's footprint, taken from fwidth of the phase: the difference of the wave's running integral at either side divided by the width. Up close that gives crisp antialiased edges; where rings fall below a pixel it settles to the duty cycle, an even grey, so the screen grid never adds its own moiré. The table colour is multiplied by the bottom ink, then by the top ink, each at about 90 percent, so overlapping lines go nearly black and the fringes appear where the two sets fall in and out of step. The top sheet's rings are drawn a little larger, which adds circular fringes to the hyperbolic ones the offset makes. The top sheet floats above the lower one with a soft offset shadow, and both cut edges catch a hairline of light. On the CPU the top sheet's target is the lower sheet's centre plus the pointer's offset from it scaled down to about a sixth and capped, and it follows on a spring with slight overshoot.",
      source: "src/effects/moire",
    },
    accent: "#2a2f55",
    controls: [
      ctl("pitch", "Pitch", 0.6, 1.6, 0.01, 1),
      ctl("scale", "Scale", 0.97, 1.08, 0.001, 1.02),
    ],
    create: (setup) => createMoire(setup, moireWgsl),
  },
  {
    id: "lido",
    touch: "drag",
    name: "Lido",
    published: "2026-11-12",
    category: "Caustics",
    tagline: "A sunlit pool seen from above, its tiled floor laced with light, and a fingertip trailing through the water.",
    summary:
      "Looking straight down at an outdoor pool on a bright day: warm stone deck on one side, then the water, whose white mosaic floor and dark lane line are covered in a moving net of sunlight. Trail the pointer through the water and a wake spreads out behind it, bending the net and the tiles beneath it, and bouncing back off the pool wall. Left alone, a drop falls now and then. Sun sets how bright the caustics are, Depth how deep and blue the pool reads, and Wake how hard your finger pushes the water.",
    explanation: [
      { title: "Ripple the water", body: "A wave equation runs on a coarse grid twice a frame. Your fingertip presses the surface down along its path, a drop makes a sharp dimple, and the wall holds the water flat so ripples reflect off it." },
      { title: "Bend the light", body: "Where the surface is concave it focuses sunlight and where it is convex it spreads it, so each ripple shows on the floor as a ring of light and a ring of shade, worked out from the surface's curvature." },
      { title: "Lace the floor", body: "The fine net of light from the wind on the water is a cheap self-warping pattern, pushed around by the ripples' slope so your wake visibly drags it." },
      { title: "Look through", body: "The tiles are drawn where the refracted view lands, so they wobble under every ripple, then tinted by the water: red light is lost first, so deeper reads bluer." },
    ],
    rationale: {
      idea: "A sunlit lido seen from straight above, its tiled floor laced with moving light, where your fingertip trails through the water.",
      firstSeconds: "Summer at once: pale stone on the left, clear aqua water on the right, a bright net of sunlight wriggling over white tiles and a dark lane line, and now and then a drop ringing out.",
      interaction: "The pointer is a fingertip in the water. Drag it and a wake opens out behind you, the light on the floor bends and rings with it, the tiles and lane line wobble underneath, and the ripples bounce back off the pool wall.",
      headline: "The stone deck on the left, a calm, warm, nearly flat surface where dark type reads cleanly. On a phone the deck runs along the bottom.",
      nearest: "Ocean, the other water. Ocean looks across open sea at the sunset; here you look down through still, clear water, the waves are almost invisible, and what you see is the light they throw on the floor.",
      risks: "A full-resolution water sim would be heavy, so ripples run on a grid capped at 640 pixels and the caustic net is a cheap pattern rather than traced light. A wave solver leaves grid-scale chatter that curvature makes sparkle, so curvature is measured over two cells, which cannot see it. A held finger could punch a hole, so it only pushes when it moves.",
    },
    technical: {
      insight: "Caustics on a pool floor are the surface's curvature made visible: where the water is concave the light converges, so brightness goes as one over the determinant of I minus depth times the height field's Hessian.",
      pipeline: [
        "cpu · fingertip stroke, harder the faster it moves and never joined across touches; idle drops at random spots on the water; wall placement from aspect",
        "fragment × 2 · wave equation on a capped rgba16float ping-pong grid with a little velocity viscosity; pointer stroke and drops pressed in; deck cells held flat so the wall reflects",
        "fragment · gentle analytic wind waves plus the ripples' slope and two-cell curvature; self-warping caustic net displaced by the slope; focus from the curvature; refracted mosaic tiles and lane line, absorption tint, glints, travertine deck and coping",
      ],
      techniques: [
        "wave equation",
        "ping-pong simulation",
        "caustics from curvature",
        "refraction",
        "Beer-Lambert absorption",
        "procedural tiling",
      ],
      notes:
        "The water height lives in an rgba16float ping-pong buffer capped at 640 pixels on its long edge, holding the height now and a step ago, stored a hundred times larger so half floats keep the fine curvature. Each frame it takes two steps of the explicit wave equation with a small viscous term on the velocity's Laplacian, and damping; cells on the deck are clamped to zero, which makes the wall a reflecting edge. The fingertip presses a Gaussian groove along the segment it moved this frame, scaled by speed, and a drop presses a sharper dimple. The present pass reads the slope by central differences and the curvature over a two-cell stencil, which is exactly blind to the checkerboard mode the solver leaves behind. The curvature gives a focus term, one over the determinant of I minus D times the Hessian, softened. The fine net comes from a few rounds of the well-known self-warping trig map, tiled across the floor and displaced by the ripples' slope and seven gentle wind waves. Tiles and the lane line with its T are drawn in floor coordinates offset by the refracted slope, lit by the net times the focus, darkened in the band of shade under the coping, and tinted by exponential absorption that takes red first.",
      source: "src/effects/lido",
    },
    accent: "#3fb6c8",
    controls: [
      ctl("sun", "Sun", 0.3, 1.8, 0.01, 1),
      ctl("depth", "Depth", 0.5, 1.8, 0.01, 1),
      ctl("wake", "Wake", 0.3, 2.5, 0.01, 1),
    ],
    create: (setup) => createLido(setup, { sim: lidoSim, present: lidoPresent }),
  },
  {
    id: "survey",
    touch: "drag",
    name: "Survey",
    published: "2026-11-13",
    category: "Cartography",
    tagline: "A coast drawn live as a survey map, and a hand that raises islands out of the sea.",
    summary:
      "A topographic map on cream paper: pale blue sea ringed with water-lines on one side, land on the other in brown contours, every fifth one heavier, over soft hypsometric tints and hill shading. The terrain is never quite still, so ridges creep and the coast slowly redraws itself. Move the pointer and the ground under it rises: sweep over the sea and an island surfaces, ringed at once by new contours, and a loop leaves an atoll with a lagoon. What you raise slowly wears back down. Detail sets the contour interval, Lift how fast the hand raises land, and Wear how quickly it erodes.",
    explanation: [
      { title: "Shape the land", body: "The terrain is five octaves of smooth noise, each drifting its own way so the land morphs rather than slides, tilted so the sea lies on the left, plus whatever the hand has raised." },
      { title: "Raise it by hand", body: "A small grid remembers how much the pointer has lifted each spot. The hand pushes up a broad mound along its path, and each frame the raised land slumps toward its neighbours and wears a little lower." },
      { title: "Draw the lines", body: "Contours are lines at every whole multiple of the interval. Each is antialiased by how fast the height changes across the pixel, so it stays a crisp single line on steep slopes and flat ones alike." },
      { title: "Chart the sea", body: "Below sea level the same trick draws water-lines, spaced by the square root of depth so they crowd the shore and spread out to sea, under a heavy coastline and a faint graticule." },
    ],
    rationale: {
      idea: "A survey map of a coast drawn live in contour lines, where your hand raises land out of the sea.",
      firstSeconds: "Calm and cartographic: pale blue sea with fine water-lines on the left, a coast of brown contours and hill shading on the right, and the whole map slowly shifting as ridges creep and the shoreline redraws itself.",
      interaction: "The pointer lifts the ground under it. Sweep over the sea and an island surfaces within a second, ringed by new contours and water-lines; draw a loop and you get an atoll with a lagoon. Left alone, what you raised slowly wears back into the sea.",
      headline: "The open sea on the left, pale blue with only faint water-lines and the graticule. On a phone the sea fills the bottom.",
      nearest: "Raking Light, the other landscape made of lines. There the lines are raked into stone and only show in low sun; here every line is a measured height, and you change the land itself rather than the light on it.",
      risks: "Contours of a coarse grid kink at every cell, so the raised land is read through a smooth cubic lookup. Lines must stay one pixel wide at any slope, so each is antialiased by its own screen derivative. It is five noise octaves a pixel and one small grid pass, so it stays cheap. A held pointer could build an endless spire, so lift falls off as the land gets high.",
    },
    technical: {
      insight: "A contour is a line at every whole multiple of height over interval, and dividing the distance to the nearest one by its screen derivative turns any height field into crisp, evenly weighted map lines for free.",
      pipeline: [
        "cpu · pointer stroke, harder the faster it sweeps and never joined across touches; land tilt from aspect so the sea sits under the headline",
        "fragment · raised-land grid on a capped rgba16float ping-pong: slump toward neighbours, exponential wear, Gaussian lift along the stroke that saturates with height",
        "fragment · drifting five-octave terrain plus the raised land through a cubic B-spline lookup; hypsometric tints and hill shading; contours, index contours, coastline and depth-spaced water-lines, each antialiased by its own derivative; graticule and paper",
      ],
      techniques: [
        "contour lines",
        "derivative antialiasing",
        "hypsometric tinting",
        "hill shading",
        "ping-pong simulation",
        "cubic B-spline filtering",
      ],
      notes:
        "Height is the sum of a drifting terrain and a hand-raised layer. The terrain is five octaves of quintic value noise, each rotated and offset, and each drifting in its own direction at its own speed, so ridges creep and change shape; a linear tilt pushes the land to the right of wide screens and the top of narrow ones. The raised layer lives in an rgba16float ping-pong grid capped at 512 pixels on its long edge. Each frame it mixes toward the mean of its neighbours, decays exponentially, and gains a Gaussian mound along the segment the pointer covered, scaled by speed and by how far the spot still is from a cap. The present pass reads it with a four-tap cubic B-spline so its contours are smooth curves. Every line is the same function: the distance from height over spacing to the nearest whole number, divided by fwidth of that same quantity and pushed through a smoothstep, which keeps lines a fixed number of pixels wide whatever the slope. Contours use the interval, index contours five intervals, the coastline height itself, and water-lines the square root of depth, so they crowd the shore. Land takes pale hypsometric tints, green through tan to near white, and is shaded by its screen-space gradient against light from the upper left.",
      source: "src/effects/survey",
    },
    accent: "#8c5a2e",
    controls: [
      ctl("detail", "Detail", 0.6, 1.8, 0.01, 1),
      ctl("lift", "Lift", 0.3, 2.5, 0.01, 1),
      ctl("wear", "Wear", 0.2, 4, 0.01, 1),
    ],
    create: (setup) => createSurvey(setup, { sculpt: surveySculpt, present: surveyPresent }),
  },
  {
    id: "vigil",
    name: "Vigil",
    published: "2026-11-14",
    category: "Fire",
    tagline: "One candle in a dark room, and the pointer is the air around it.",
    summary:
      "A single ivory candle burns in a near-dark room. Its flame breathes and sways, and the warm light it throws flickers over the wax, the wall behind and the table beneath. The pointer is moving air: pass a hand near the flame and it bows away and sways back upright, sweep past quickly and it gutters, the room darkens, and a thin ribbon of smoke curls up before the flame steadies. Breath sets how strongly the air moves it, and Warmth the colour of the light.",
    explanation: [
      { title: "Move the air", body: "The pointer's speed is air, felt more weakly the further it passes from the flame. It pushes the flame on an underdamped spring, so it bows, overshoots and sways back through upright." },
      { title: "Shape the flame", body: "The flame is a teardrop, round at the root and drawn to a tip, bent further the higher up you go, with turbulence that grows as the air disturbs it: a blue root, a white core and an orange envelope." },
      { title: "Light the room", body: "Everything else is lit by the flame alone: the wall with a soft falloff, the wax glowing through near the top and darkening down to its foot, and a pool of light along the table." },
      { title: "Gutter and smoke", body: "A strong enough gust dims the flame and the room with it. While it struggles, smoke builds up and rises as a wandering ribbon that slowly fades once the flame recovers." },
    ],
    rationale: {
      idea: "One candle burning in a dark room, and the pointer is the air around it.",
      firstSeconds: "Still and intimate: near black, a single ivory candle right of centre, its flame breathing and swaying gently while warm light flickers over the wax and the wall.",
      interaction: "Moving the pointer moves the air. Pass a hand near the flame and it bows away and sways back; sweep past fast and it gutters, the whole room darkens, and a ribbon of smoke curls up before it steadies. It reads like real breath on a real flame.",
      headline: "The dark wall on the left, barely touched by the light, where pale type sits on near black. On a phone, the darkness above the flame.",
      nearest: "Arcs, the other light that the pointer disturbs on a dark ground. Arcs is electric filaments striking at random; this is a single soft flame with weight and sway, and its light is the only thing lighting the scene.",
      risks: "Fire can look cheap, so the flame has a blue root, a white core and an orange envelope with soft edges, and the room answers its flicker. Air from anywhere on screen would make it twitchy, so its push falls off with distance. It is one pass with a handful of noise lookups, so it costs almost nothing.",
    },
    technical: {
      insight: "A candle scene lit only by its flame reads as real when the flame's brightness and position drive every light in the frame, so one small spring and one brightness value carry the whole picture.",
      pipeline: [
        "cpu · pointer velocity as air with an inverse-cube falloff from the flame; underdamped spring for bend and stretch; flicker, gutter brightness and smoke built from the air's strength; slow idle draft and a periodic gust",
        "fragment · bent teardrop flame with noise turbulence and blue, core and envelope layers; wall, table and wax lit from the moving flame position; melt pool, wick ember, wax runs and a rising smoke ribbon; filmic tonemap",
      ],
      techniques: [
        "procedural flame",
        "damped spring",
        "subsurface glow",
        "inverse-square lighting",
        "value noise turbulence",
        "filmic tonemapping",
      ],
      notes:
        "The CPU turns the pointer's velocity, in screen units per second, into air at the flame by weighting it with an inverse-cube falloff of its distance. The air drives two damped springs: sideways bend and vertical stretch, with low damping so the flame overshoots and sways back. The air's strength also raises a flicker value that decays over half a second, lowers the brightness quickly when it passes a threshold and lets it recover slowly, and builds smoke while the flame is dim. In the shader the flame is a teardrop width profile in height, its centreline bent by the lean times height to the power 1.7 and jittered by noise in proportion to flicker; Gaussian cross-sections give an orange envelope, a narrower white core and a blue root. The light position follows the bend. The wall is near black plus a falloff from that light; the wax is a cylinder shaded across its width, lit from above with an exponential fall down its length and an orange subsurface glow near the top; the table is dark waxed wood seen at a low angle, with an oval pool of light around the foot, a soft reflection of the lit wax that fades toward the viewer, contact shade and a lit back edge. Smoke is a thin Gaussian ribbon that leaves from the flame's tip, wherever the lean has put it, then wanders with noise and widens as it rises. A filmic curve keeps the core from clipping. Narrow screens zoom out.",
      source: "src/effects/vigil",
    },
    accent: "#f0a050",
    controls: [
      ctl("breath", "Breath", 0.3, 2.5, 0.01, 1),
      ctl("warmth", "Warmth", 0, 1, 0.01, 0.5),
    ],
    create: (setup) => createVigil(setup, vigilWgsl),
  },
  {
    id: "meadow",
    name: "Meadow",
    published: "2026-11-15",
    category: "Botanical",
    tagline: "A field of tall grass at golden hour that you can run your hand through.",
    summary:
      "Low sun over a meadow: six rows of grass from hazy distance to a dark foreground, every blade outlined in gold where the light shines through it, wild oat heads nodding, pollen drifting, and gusts rolling across the field. Trail the pointer through the grass and the blades you pass are dragged along and parted around your hand, then spring back and sway past upright, so every sweep sends a wave through the field. Wind sets how hard it blows, Glow how strongly the sun comes through, and Brush how firmly your hand moves the grass.",
    explanation: [
      { title: "Plant the rows", body: "Six rows of grass, from short and dense near the horizon to tall and sparse up close. Each pixel only looks at the five blades nearest it in each row, picked by hashing which slot along the row it falls in." },
      { title: "Bend each blade", body: "A blade bends as a curve that leans more toward its tip. Its bend is the wind, a steady lean plus swells and gust fronts that roll across the field, plus whatever the hand has pushed it." },
      { title: "Remember the hand", body: "A strip of springs per row, 384 across, holds how far the grass there is pushed and how fast it is moving. The hand drags them the way it moves and parts them around it; each springs back with a little overshoot." },
      { title: "Light from behind", body: "The sun is low and behind the grass, so blades are dark shapes with gold along their edges and tips, strongest near the sun, and distant rows fade into the warm haze." },
    ],
    rationale: {
      idea: "A field of tall grass at golden hour that you can run your hand through.",
      firstSeconds: "Warm and quiet: dark grass against a low sun, gold light along every blade edge, gusts rolling across the field from left to right, and pollen drifting in the light.",
      interaction: "The pointer is a hand trailing through the grass. Blades it passes are dragged along and parted around it, then spring back and sway past upright, so a sweep leaves a wave travelling through the field behind you.",
      headline: "The clear evening sky over the left half. Down in the lower left the foreground grass is near-black shadow, so pale type reads cleanly over it too.",
      nearest: "Windwall, the other field of things that bend in the wind. Windwall is a rigid metal facade of hinged fins; here every blade is a soft curve that springs back on its own, lit from behind by a setting sun.",
      risks: "Testing every blade at every pixel would be slow, so each pixel checks only the five nearest blades in each of six rows, about thirty cheap tests. Per-blade physics would be heavy, so the hand's effect lives in a tiny 384 by 6 strip of springs. Flat silhouettes can look like clip art, so blades carry gold rims where the sun comes through and distant rows dissolve into haze.",
    },
    technical: {
      insight: "Grass only needs physics where a hand has been, and a strip of springs per row, sampled at each blade's root, gives every blade a memory of the hand for the cost of a texture lookup.",
      pipeline: [
        "cpu · pointer position and smoothed velocity in screen heights; sun placed low and right of centre",
        "fragment × 2 · spring strips, 384 by 6 rgba16float ping-pong: bend and velocity per column and row, driven by the hand's velocity and a parting push where the hand is among that row's blades",
        "fragment · golden-hour sky and sun; six rows back to front, each testing five hashed blades with wind plus spring bend, quadratic lean, slope-corrected width and oat heads; backlit gold rims, haze, pollen; filmic tonemap",
      ],
      techniques: [
        "procedural grass",
        "damped springs",
        "ping-pong simulation",
        "backlighting",
        "aerial perspective",
        "spatial hashing",
      ],
      notes:
        "Rows are defined once in a shared WGSL module: ground height, blade height, spacing and width all grow from back to front. For each row a pixel finds its slot along the row and tests that slot and two either side; each blade's root jitter, height, stiffness and whether it carries a seed head come from hashes of its slot and row. The bend is the wind at the root, a steady lean plus two travelling swells and a gust front that sweeps the field every few seconds, scaled per blade, plus the spring value at the root read from the strip texture. The blade's centreline leans by bend times height times the square of the distance up the blade, and the pixel's horizontal distance to it is divided by the slope's length so bent blades keep their width. Coverage is antialiased over a pixel. The strips are stepped twice a frame as damped springs with low damping; the hand applies a force proportional to its horizontal velocity plus a push away from its own x, weighted by a Gaussian in x and by whether its height falls between that row's roots and tips. Shading takes a hazy colour for distant rows and near black up close, plus gold weighted toward edges and tips and toward the sun.",
      source: "src/effects/meadow",
    },
    accent: "#e0a24a",
    controls: [
      ctl("wind", "Wind", 0, 2.5, 0.01, 1),
      ctl("glow", "Glow", 0.3, 1.8, 0.01, 1),
      ctl("brush", "Brush", 0.3, 2.5, 0.01, 1),
    ],
    create: (setup) => createMeadow(setup, { spring: meadowSpring, present: meadowPresent }),
  },
  {
    id: "noctiluca",
    name: "Noctiluca",
    published: "2026-11-16",
    category: "Bioluminescence",
    tagline: "A beach at night where the breaking surf glows blue, and so does your touch.",
    summary:
      "Standing on a dark beach under the stars, looking out to sea. The water is full of plankton that flash blue when disturbed, so every breaker lights up along its lip, whitewater pours glowing down its face as it collapses, the swash carries the light up the sand and drains it back, and the glow dies away in a second or two. Move the pointer over the water and it leaves a trail of thousands of blue sparks that drifts with the swash; brush the wet sand and it sparkles too. Surf sets how big and fast the waves are, Glow how bright the plankton are, and Linger how long their light lasts.",
    explanation: [
      { title: "Stand on the beach", body: "The camera stands a step up the sand looking out to sea, so every pixel below the horizon maps to a point on the ground, from the sand at your feet to the far water." },
      { title: "Roll the waves in", body: "Three waves cycle in turn. Each crest travels in, rises and breaks, then runs up the sand as swash at exactly the speed it arrived, slows to a stop and drains back, so the motion never jumps." },
      { title: "Stand the faces up", body: "A breaking wave is drawn as a face rising off the sea: a glowing lip on top, whitewater pouring down it as the wave collapses, and its back hiding the water behind it. The face shrinks and fades into the swash as it comes ashore." },
      { title: "Remember the light", body: "A small texture holds how brightly the water glows, how wet the sand is, and the pointer's own trail. Each frame the glow fades, rides up and down with the swash, and is topped up wherever a wave breaks or the pointer moves." },
      { title: "Make it sparkle", body: "The glow is drawn as a soft haze plus single points of light: a fine grid of plankton, each with its own threshold, lights once the glow there is high enough and twinkles. Two turned grids keep the sparks from lining up." },
    ],
    rationale: {
      idea: "A beach at night where the breaking surf glows blue, and so does your touch.",
      firstSeconds: "A starry sky over a black sea, and a wave rising and breaking with its whole lip lit electric blue, pouring light down its face and washing it up the sand while the next crest rolls in behind.",
      interaction: "The pointer stirs the water, and the plankton answer instantly with a trail of blue sparks that brightens the faster you move, drifts with the swash and fades over a couple of seconds. On wet sand a touch makes the stranded plankton sparkle, the way footsteps glow on a real bioluminescent beach.",
      headline: "The dark sand across the bottom third, the lower left included, and the starry sky above the horizon, both dim and nearly flat.",
      nearest: "Lido, the other water you touch. Lido is a sunlit pool seen from above whose caustics bend around a fingertip wake; here it is night at the shore, the sea is black until it is disturbed, and the light comes from the water itself.",
      risks: "Waves that stop and restart would look mechanical, so the crest arrives at the speed the swash leaves with and the swash slows evenly. Glow that lingers too long turns into a blue wash, so surf light fades in under a second and only the pointer trail lasts longer. Smooth glow would look like paint, so it is broken into sparks that must not line up at 1:1. It is one small sim pass and one picture pass.",
    },
    technical: {
      insight: "The sim only needs to hold a soft field of how much light there is; the sparkle that makes it read as living plankton is added at full resolution by thresholding that field per grid cell.",
      pipeline: [
        "cpu · pointer projected onto the ground, its segment since the last frame and smoothed speed; horizon height for wide or tall screens",
        "fragment · glow state, up to 560 px on the long edge, rgba16float ping-pong in screen space but worked out on the ground: surf glow, sand wetness and pointer trail, carried back along the swash and the pointer's drag, decayed, set off behind breaking fronts and along the pointer segment",
        "fragment · stars, sand, wet sand mirroring the glow beyond it, sea with chop and horizon haze, foam lace, three wave faces with lip, pouring whitewater and back slope, glow haze plus two rotated spark grids, filmic tonemap",
      ],
      techniques: [
        "ground-plane projection",
        "semi-Lagrangian advection",
        "ping-pong simulation",
        "analytic swash",
        "threshold sparkle",
        "shared WGSL module",
      ],
      notes:
        "The camera is one unit above the sand with a focal length of one, so a pixel's height below the horizon gives the ground distance directly and its offset from centre gives the sideways position. The shore lives in a shared WGSL module used by both passes. Distance out to sea is measured from a waterline 4.2 units ahead that wanders with two sines. Each of three waves has a phase that varies slightly along the beach, so crests break in a run. For the first 62 percent of a cycle the crest travels in from 16 units out on a curve that slows it but arrives at exactly the speed the swash sets off with: twice the run-up height over the run-up time. The swash then decelerates evenly to the top of its run and drains back on a smoothstep, so position and speed are both continuous. Face height grows as the crest nears shore and shrinks to nothing before it lands. The picture finds a pixel's crest by guessing its position along the beach from the ground under the pixel, then correcting twice against the crest; it projects the crest's top, base and back, draws the nearest face that covers the pixel, and fades a face out as it shrinks. The sim traces each texel back along the swash speed and the pointer's drag on the ground and reprojects, so glow rides with the water. Surf glow decays in a third of a second on sand and under a second in water; the pointer trail sits in its own channel and lasts about twice as long. Sparks come from two rotated grids, about 3 and 5 pixels across, each cell holding a plankton with a random threshold and twinkle rate.",
      source: "src/effects/noctiluca",
    },
    accent: "#3ad4ff",
    controls: [
      ctl("surf", "Surf", 0, 2, 0.01, 1),
      ctl("glow", "Glow", 0.3, 2, 0.01, 1),
      ctl("linger", "Linger", 0.4, 3, 0.01, 1),
    ],
    create: (setup) => createNoctiluca(setup, { sim: noctilucaSim, present: noctilucaPresent }),
  },
  {
    id: "kintsugi",
    name: "Kintsugi",
    published: "2026-11-17",
    category: "Ceramics",
    tagline: "A broken black bowl you mend with liquid gold.",
    summary:
      "A close look into a glossy black tenmoku bowl, crazed and broken along wandering fractures. Gold runs into the breaks: it arrives molten and orange, flows along the fracture and into its branches, cools to a raised polished bead, and after half a minute slowly sinks back so the bowl never fills for good. The bowl pours a little on its own; touch near any crack and gold pours from your fingertip into the network, while the pointer also carries a small lamp whose glint slides along the gold and across the glaze. Reach sets how far a pour runs, Pour how wide the pointer pours, and Shine how bright the studio light is.",
    explanation: [
      { title: "Break the bowl", body: "The fractures are the edges of a warped Voronoi pattern, with about a third of the edges left whole, so the breaks wander, branch and dead-end like a real break. A finer, fainter crazing pattern sits in the glaze but never carries gold." },
      { title: "Let the gold run", body: "A texture marks which texels lie on a fracture. Each step, gold moves one texel along the fracture from its richest neighbour, losing a little, so a pour runs a fair way and then stops. Steps are uneven on purpose, so the front creeps rather than marches." },
      { title: "Cool and fade", body: "Gold arrives hot: a heat value starts high where gold has just arrived and fades over a second or two, shading the bead from molten orange to polished gold. Set gold slowly sinks back over about half a minute." },
      { title: "Light it like a product shot", body: "The bowl's curve reflects a long strip light as a band of gloss; the gold bead's normal comes from the slope of the distance to the fracture, so it reflects the strip and the pointer's lamp as a bright line along its crest." },
    ],
    rationale: {
      idea: "A broken black bowl you mend with liquid gold.",
      firstSeconds: "A glossy black glaze with a band of studio light across it, and molten gold already running out along a fracture, branching as it goes and cooling from orange to polished gold.",
      interaction: "Touch near any crack and gold pours from your fingertip and runs off along the network, into branches you cannot see until the gold finds them. The pointer also holds a small lamp, so its glint slides along the gold and across the glaze as you move.",
      headline: "The lower left: deep black glaze, where the bowl never pours on its own and only faint crazing and open cracks show.",
      nearest: "Prism, the other Voronoi surface. Prism lights every cell as a faceted crystal; here only the cell edges matter, as fractures, and the subject is gold flowing through them over time.",
      risks: "A plain Voronoi grid reads as tiles or cells, so the pattern is warped and a third of its edges are left unbroken. Gold that only ever accumulates would end in a fully gilded bowl, so it fades back slowly. The gold flow is three cheap one-texel steps a frame on a grid at most 960 across, and the fractures are worked out once and stored.",
    },
    technical: {
      insight: "Gold only has to move one texel at a time along a precomputed one-texel line, which turns a flowing liquid into a cheap max over eight neighbours.",
      pipeline: [
        "fragment, once after each resize · fracture mask: texels within about one texel of a warped Voronoi edge",
        "fragment × 3 · gold flow, up to 960 px on the long edge, rgba16float ping-pong: gold taken from the richest fracture neighbour minus a loss per texel, heat for fresh gold, pours from the pointer and the bowl's own drip, slow fade",
        "fragment · tenmoku glaze with pooled colour, iron specks and crazing, strip-light gloss on the bowl's curve, open grooves, raised gold bead from the fracture distance field shaded by the strip light and the pointer lamp, molten heat, filmic tonemap",
      ],
      techniques: [
        "Voronoi edge distance",
        "domain warping",
        "cellular flow",
        "ping-pong simulation",
        "environment reflection",
        "distance-field bevel",
      ],
      notes:
        "Fracture distance uses the exact two-pass Voronoi edge distance on a domain-warped grid of 3.6 cells per screen height; for each candidate edge a symmetric hash of the two cells decides whether that boundary broke, and unbroken ones are skipped, which leaves dead ends and long runs. The sim stores, per texel, the gold level, whether a fracture runs through it, and heat. The mask is computed only on the first step after a resize. Each of three steps a frame, a fracture texel takes the largest gold level among its fracture neighbours minus a fixed loss, on about four steps in five, so a full pour runs roughly half a screen height before it stops. Newly fed texels get heat that decays over 1.4 seconds; once cool, gold loses 1/45 of its level per second. The pointer pours wherever it is within a small radius, and when nobody touches the bowl it drips at a random spot away from the lower left every few seconds, three times quickly at the start. The picture reads the gold from the five by five texels around each pixel, so thin lines are not halved by filtering, and draws a bead whose height is a circle profile across the fracture distance and whose normal comes from that distance's slope.",
      source: "src/effects/kintsugi",
    },
    accent: "#e0a64a",
    controls: [
      ctl("reach", "Reach", 0.4, 2, 0.01, 1),
      ctl("pour", "Pour", 0.5, 2, 0.01, 1),
      ctl("shine", "Shine", 0.3, 2, 0.01, 1),
    ],
    create: (setup) => createKintsugi(setup, { flow: kintsugiFlow, present: kintsugiPresent }),
  },
  {
    id: "folio",
    touch: "drag",
    name: "Folio",
    published: "2026-11-18",
    category: "Paper",
    tagline: "A stack of fine papers you peel back and turn.",
    summary:
      "A stack of four fine printed papers filling the screen: indigo with gold seigaiha waves, vermilion blind-embossed with interlocking circles, cream washi with long fibres and torn gold leaf, and black with a silver pinstripe. The top sheet's corner rests a little lifted. Grab any corner and peel it back: the paper rolls over a soft cylinder, shows its plain reverse, throws a shadow on the sheet below and reveals it. Let go past halfway and the sheet turns away; let go early and it falls back. Left alone, a sheet turns itself every few seconds. Foil sets how bright the metallic inks are, and Curl how tight the paper rolls.",
    explanation: [
      { title: "Roll the paper over a cylinder", body: "The fold line sits halfway between the lifted corner and where it is pulled to. Paper beyond the line wraps over a cylinder and comes back flat on top, so each pixel can be under up to three layers: the returning flap, the top of the roll, and the bottom of the roll." },
      { title: "Draw top down", body: "Each layer maps the pixel back to a point on the flat sheet and checks it is still on the paper. The first layer that lands on paper wins, its distance to the paper's edge gives a clean antialiased edge, and the next sheet shows through wherever nothing does." },
      { title: "Print the papers", body: "Every design is a distance field, so the gold lines, embossed circles, gold-leaf flakes and pinstripes are all sharp at any size. Three samples of each give a bump normal, so embossing catches the light and foil reflects a soft studio sky." },
      { title: "Shade the turn", body: "The roll darkens toward its underside, the reverse is the same paper unprinted and a little paler, and the lifted part casts one soft shadow on the sheet below." },
    ],
    rationale: {
      idea: "A stack of fine printed papers that you peel back corner by corner to reveal the next.",
      firstSeconds: "Indigo paper printed with gold waves fills the screen, its lower right corner gently lifted and breathing, and within a second it peels back on its own to show vermilion embossed paper underneath, then turns away.",
      interaction: "Grab any corner and the paper follows your hand, rolling over itself with its reverse showing and a shadow beneath. Drag far enough and let go to turn the page; let go early and it settles back. It is the one gesture everyone already knows from a real page.",
      headline: "The lower left: flat, calm paper. The resting curl and every self-turn start at the lower right corner, so the curl only passes the lower left in the last moment of a turn, when the next sheet is already showing.",
      nearest: "Overprint, the other print effect. Overprint mixes inks on one flat sheet; here the paper itself is the subject, as a physical object that bends, casts shadows and stacks.",
      risks: "A flat or rigid fold would read as a cut-out, so the paper rolls over a cylinder with shading and a soft shadow. Busy patterns at small scale look like noise, so every design is large and sharp. It is one pass of a few distance fields per pixel, light enough for phones.",
    },
    technical: {
      insight: "A page curl is a reflection across a fold line plus a short cylinder, so every pixel can be mapped back to the flat sheet in closed form, with no mesh at all.",
      pipeline: [
        "fragment · page curl over a cylinder from the dragged corner, three layers tested top down with edge antialiasing, four distance-field paper designs with bump-mapped embossing and foil, one soft shadow sample on the sheet below, filmic tonemap",
      ],
      techniques: [
        "page curl",
        "cylinder mapping",
        "distance fields",
        "bump mapping",
        "environment reflection",
        "spring-driven interaction",
      ],
      notes:
        "Let d be the unit direction from the pulled-to point back to the corner. The fold sits at the midpoint of the two minus half the roll's circumference along d, and s is a pixel's distance past it. Pixels with s at or below zero are flat paper or the returning flap, which is the sheet reflected across the fold and shifted by pi times the radius; pixels within one radius past the fold are on the roll, where asin gives the arc length to the bottom and pi minus that to the top. Layers are tested in order flap, roll top, roll bottom, flat sheet, and each one's coverage is its distance inside the paper divided by a pixel. The radius grows from 0.035 to 0.085 as the corner travels, so a small lift curls tightly. The corner follows the hand on a critically damped spring; on release it turns if it travelled more than half the width, otherwise it falls back. Self-turns follow an eased path with a sine lift and start after seven idle seconds.",
      source: "src/effects/folio",
    },
    accent: "#d4a24a",
    controls: [
      ctl("foil", "Foil", 0.3, 2, 0.01, 1),
      ctl("curl", "Curl", 0.5, 2, 0.01, 1),
    ],
    create: (setup) => createFolio(setup, folioWgsl),
  },
  {
    id: "calibre",
    touch: "drag",
    // Many layered shapes per pixel; capped so laptop GPUs stay calm.
    maxDpr: 1.25,
    name: "Calibre",
    published: "2026-11-19",
    category: "Horology",
    tagline: "A watch movement ticking under a lamp you hold.",
    summary:
      "A close look through the caseback of a mechanical watch. The round main plate is grained in overlapping circles, the bridges carry Geneva stripes and polished bevels, and the gilt wheels, blued screws and rubies sit between them. The balance swings back and forth, its hairspring breathing, and each swing lets the escape wheel go by half a tooth, so the train moves in ticks. The pointer carries a small lamp, so every finish lights up in its own way as you pass over it. Press and drag to wind the mainspring: the ratchet wheel turns and the balance swings wider, then slowly runs down. Lamp sets the brightness and Rate the speed of the beat.",
    explanation: [
      { title: "Build it in layers", body: "Everything is a 2D distance field, drawn from the plate up: barrel, three gilt wheels, the steel escape wheel and lever, the balance and hairspring, then the bridges, ratchet wheel and balance cock. Each layer first darkens what is below it with a shadow offset toward the lamp by its height." },
      { title: "Cut real teeth", body: "A wheel's teeth come from folding the angle into one tooth's sector and measuring a tapered tooth there, so a wheel of 143 teeth costs the same as one of 15. The escape wheel's teeth lean and widen into clubs, and the ratchet wheel's sawtooth measures its steep faces across, not radially, so they stay sharp." },
      { title: "Brush the metal", body: "Brushed finishes use an anisotropic highlight that runs across the grain. Perlage spots are grained in circles, Geneva stripes in shallow arcs along each band, and the ratchet wheel in rays, so each throws the lamp's light into a different shape: streaks, bands and a ring." },
      { title: "Let it tick", body: "The balance swings on a sine. Each time it passes through the middle, the escape wheel turns half a tooth with a quick ease and the lever flicks to the other side, and the wheels further up the train turn by their gear ratios. The balance's arms are blurred over the angle they cover in one frame." },
    ],
    rationale: {
      idea: "A watch movement seen through the caseback, ticking under a small lamp you hold.",
      firstSeconds: "A round movement fills the right of the screen against black velvet: gilt wheels between striped steel bridges, blue screws and red jewels, a balance wheel swinging with its blue hairspring breathing, and the train moving on in small ticks while a lamp drifts slowly across and wakes each finish in turn.",
      interaction: "The pointer is the lamp, so moving it sweeps light across the bridges, flares the grained plate into streaks and lights the jewels from the side, the way you would tilt a watch under a light. Press and drag to wind it: the ratchet wheel turns under your hand and the balance swings wider.",
      headline: "The lower left: black velvet outside the movement's round plate, which never has anything on it.",
      nearest: "Raking Light, where the pointer is also a light over a relief. There it is one stone surface under the sun; here it is a working machine with many finishes that each answer the light differently, and it keeps moving on its own.",
      risks: "Too many parts could read as clutter, so the movement keeps to one train, one escapement and three bridges, with the plate's finish quieter than the bridges. Fast parts would strobe at 60 frames a second, so the balance beats slowly and its arms are blurred over each frame. It is one pass of cheap 2D shapes, capped at 1.25x pixel density.",
    },
    technical: {
      insight: "A gear with any number of teeth is one tooth: fold the angle into a single sector and measure the distance to that tooth.",
      pipeline: [
        "fragment · perlage plate, layered distance-field wheels, escapement, balance and hairspring, bridges with Geneva stripes and finite-difference bevel normals, rubies and blued screws, per-layer lamp shadows, anisotropic and polished shading, filmic tonemap",
      ],
      techniques: [
        "distance fields",
        "angular domain folding",
        "anisotropic highlights",
        "layered shadows",
        "rotational motion blur",
        "escapement timing",
      ],
      notes:
        "All shapes are in movement units with the plate's centre fixed; the view places and scales the movement for the screen. Perlage is a grid of jittered spots; a pixel takes the latest-placed spot that covers it among the nine around it, and its grain runs in circles round that spot's centre. The anisotropic term uses the sine of the angle between the grain and the half vector, raised to a high power, plus a broad version for sheen. A fixed key light from the upper left keeps every part readable when the lamp is far away; the lamp's own light falls off with distance. Bridge bevels take their normal from a finite-difference gradient of the bridge distance and are polished. Each layer's shadow samples its own shape at the pixel offset toward the lamp by the layer's height above what is already drawn. The balance runs at 1.2 swings a second times the Rate control; winding adds to a store that sets its amplitude between about 130 and 250 degrees and runs down over a few minutes. The escape wheel's ease takes the first eighth of each beat, and the fourth, third and centre wheels follow through eight-leaf pinions.",
      source: "src/effects/calibre",
    },
    accent: "#c9a45c",
    controls: [
      ctl("lamp", "Lamp", 0.3, 2, 0.01, 1),
      ctl("rate", "Rate", 0.5, 2, 0.01, 1),
    ],
    create: (setup) => createCalibre(setup, calibreWgsl),
  },
  {
    id: "enso",
    touch: "drag",
    name: "Ensō",
    published: "2026-11-20",
    category: "Calligraphy",
    tagline: "A brush, a sheet of washi, and one circle of ink.",
    summary:
      "A sheet of warm washi paper with long fibres in it. An unseen hand paints an ensō, the Zen circle made in one stroke: heavy and wet where the brush first presses down, thinning as it travels, and running out of ink at the end so the last of it splits into dry bristle marks. A vermilion seal goes on beside it, and after a while the sheet is lifted and a new circle begins. Press and drag to paint yourself. A slow hand presses the brush harder and lays a wide, wet line; a quick one lifts it to the tip, and as the ink runs out along a stroke the bristles split. Ink sets how dark the ink is, and Brush the size of the brush.",
    explanation: [
      { title: "Model a brush", body: "Each frame the brush stamps one segment from where it was to where it is. Across the segment, the brush is split into 38 bristles, and each one keeps painting only while the brush still holds more ink than that bristle's own threshold, so a running-dry brush leaves streaks that follow the stroke." },
      { title: "Let the ink soak", body: "The sheet keeps suspended pigment, settled pigment and water per texel. Water wicks from wet paper into dry, faster along the fibres, and carries pigment with it while the fibres filter some out, so every wet stroke bleeds into a pale grey feather. Pigment settles as the water goes, a little more at the drying edge." },
      { title: "Press and speed", body: "Pressure comes from how slowly the hand moves: slow strokes press the brush down, wide and wet; quick ones lift it to a thin, drier tip. The ink load drops with the distance travelled, so long strokes end dry." },
      { title: "Paint the circle", body: "The unseen hand follows one turn of a slightly uneven circle with an ease in and out, pressing hard at the start and lifting toward the end, which leaves the gap and dry tail an ensō is known for." },
    ],
    rationale: {
      idea: "A brush paints an ensō in sumi ink on washi, and then you can paint too.",
      firstSeconds: "Warm washi paper fills the screen, and within half a second a brush begins a circle in black ink: a heavy, wet start that sweeps round, thins, and breaks into dry bristle streaks at the end, before a red seal is pressed beside it.",
      interaction: "Press and drag to paint with the brush. How you move is how it paints: slow and the brush presses down into a wide wet line, fast and it skims on its tip, and as the ink runs out the stroke splits into dry streaks, so every stroke carries your gesture.",
      headline: "The lower left: bare paper, since the circle and its seal sit to the right and only your own strokes ever reach there.",
      nearest: "Ink, the fluid one, where dragging stirs coloured dye in water. Here the ink soaks into paper and stays, and the subject is the mark itself: pressure, speed and a brush running dry.",
      risks: "A plain round line would look like a marker, so the brush has bristles that run dry, pressure from speed and a tip that settles at the start. A sheet that only fills up would end in a mess, so idle sheets are lifted and repainted. It is one cheap step on a grid no larger than 1100 across and one picture pass.",
    },
    technical: {
      insight: "Dry brush is just a threshold per bristle: give every bristle its own ink threshold and let the brush's load fall along the stroke, and the streaks appear by themselves.",
      pipeline: [
        "fragment · ink step, up to 1100 px on the long edge, rgba16float ping-pong: water wicking over eight neighbours under the stability limit, pigment carried and filtered by the flow, settling with a drying-edge boost, and the brush segment stamped with per-bristle ink",
        "fragment · washi with fibres and grain, ink as a stain from grey wash to black, wet sheen, vermilion seal, brush-tip shadow under the hover",
      ],
      techniques: [
        "ping-pong simulation",
        "pigment diffusion",
        "per-bristle dry brush",
        "pressure from speed",
        "shared WGSL module",
        "procedural paper",
      ],
      notes:
        "Each texel holds suspended pigment, settled pigment, water and the paper's wicking rate, which is worked out once when the sheet is laid. Water flows between each texel and eight others, its four neighbours and four more two texels out on the diagonals, so a bleed travels far and spreads round rather than square, in proportion to the difference, scaled by both texels' wicking, and every pairwise rate is held under the explicit diffusion limit, so the sheet cannot blow up into a growing black block. Pigment rides the flow at the concentration of the side it leaves, and the sheet filters most of it out except along the fibres, so a bleed feathers into fine grey hairs instead of blurring. Pigment settles slowly while wet, at once when dry, and faster at the drying front, which leaves a faint darker rim. The brush tops ink up rather than adding it, discounting what the paper already holds, so going over a stroke deepens it toward black without flooding. The picture treats ink as a stain, so light falls off exponentially with pigment: thin ink is a cool grey wash and only loaded or layered ink is black, and thin washes gather in the paper's grain. The brush is a capsule from last frame's point to this frame's; a pixel's signed distance across it picks one of 38 bristles, and a bristle inks while the load minus its hashed threshold, plus low-frequency noise along the stroke, stays above zero. As the load falls the brush only touches the tops of the paper's tooth, which breaks the dry end into specks of bare paper. Width follows pressure, which eases toward a value set by hand speed. On touch the canvas keeps drags in every direction, and a quick vertical flick moves the feed instead. Idle, the hand paints an ensō 2.6 seconds long, waits nine seconds, fades the sheet in about a second and a half and starts another; a sheet you painted on is left for eighteen seconds.",
      source: "src/effects/enso",
    },
    accent: "#c7402a",
    controls: [
      ctl("ink", "Ink", 0.5, 1.6, 0.01, 1),
      ctl("brush", "Brush", 0.5, 2, 0.01, 1),
    ],
    create: (setup) => createEnso(setup, { ink: ensoInk, present: ensoPresent }),
  },
  {
    id: "lanterns",
    // Many lanterns tested per pixel, twice over the lake; capped so laptop GPUs stay calm.
    maxDpr: 1.25,
    name: "Lantern Night",
    published: "2026-11-21",
    category: "Festival",
    tagline: "Paper lanterns rising from a still lake, and your hand is the warm air.",
    summary:
      "A night lake under a dark sky. Paper sky lanterns rise from boats across the water, each lit from the flame inside, swaying as they climb and slowly drifting away, while hundreds more rise as tiny sparks above the far hills. The lake mirrors all of it, broken into long streaks by slow ripples. Moving the pointer is a breath of warm air: lanterns near your hand are pushed along its path and lifted. Press to let a lantern go from under your hand, and hold to release more. Glow sets how much light the lanterns throw into the night, and Lanterns how many are released.",
    explanation: [
      { title: "Move the near lanterns on the CPU", body: "Up to 44 near lanterns are kept in a list. Each rises at a pace set by its size, sways on two slow sines, drifts away as it climbs so it shrinks, and is pushed by the air the pointer stirs. They are sorted far to near and sent to the shader as a uniform array." },
      { title: "Draw a paper lantern", body: "A lantern is a small distance field: a bag wider at the top and open at the bottom. Inside it is lit by the flame, brightest at the mouth and dimmer toward the top, with faint ribs, a darker wire ring at the mouth, a flame point and a halo in the air." },
      { title: "Fill the far sky cheaply", body: "The far lanterns are three layers of hashed cells scrolling upward, a few cells in each holding a twinkling spark. There are more just above the hills and fewer higher up, which gives the sense of a whole festival without moving a single one." },
      { title: "Mirror it in the lake", body: "Below the shore line the sky is read again at the mirrored height, shifted sideways by ripples that grow toward the viewer. Each near lantern is reflected about the water directly under it and stretched downward, so its reflection sits where it should." },
    ],
    rationale: {
      idea: "Paper sky lanterns rising from a night lake, and your hand is the warm air that carries them.",
      firstSeconds: "A dark lake under a deep blue sky, lanterns already in the air and new ones lifting off the water across the lake, glowing amber and swaying, with a haze of tiny far lanterns over the hills and every one of them mirrored in the water.",
      interaction: "Moving the pointer stirs the air, so lanterns near your hand are pushed along its path and lifted, and you can herd them. Press to release a lantern of your own from under your hand and watch it catch and climb; hold to release a stream of them.",
      headline: "The lower left: dark open water, since lanterns are released across the rest of the lake and rise away from it.",
      nearest: "Vigil, the candle, where the pointer is also air moving a flame. Vigil is one flame indoors; this is a sky full of small lights outdoors, and the pointer can add to it as well as move it.",
      risks: "Too many lights would turn into noise, so the far field is sparse and fades with height, and the near list is capped at 44. Testing every lantern for every pixel could be slow, so each lantern is skipped outside a small box around it and the effect is capped at 1.25x pixel density. A lake that only reflects specks would look busy, so the ripples are gentle and the reflection is dimmed.",
    },
    technical: {
      insight: "A crowd needs only a few individuals: 44 real lanterns in front of a hashed field of sparks reads as thousands.",
      pipeline: [
        "cpu · up to 44 lanterns: rise, sway, drift, pointer air and releases, sorted far to near into a uniform array",
        "fragment · sky with stars and hills, three hashed layers of far sparks, near lanterns as distance fields with flame and halo, lake reflection of sky and lanterns with ripples",
      ],
      techniques: [
        "uniform arrays",
        "distance fields",
        "hashed particle layers",
        "planar reflection",
        "pointer as air",
      ],
      notes:
        "Each lantern stores its position, size, the height of the water under it and a flicker phase. Its rise speed is 0.018 plus 0.9 times its size per second, its sideways velocity relaxes toward a sway of two sines, and its size shrinks by about 3.5 percent a second as it drifts off. The pointer's velocity is applied with a gaussian falloff around the hand, plus a small outward and upward push. A new lantern brightens over 0.8 seconds. Lanterns released lower on the lake are nearer, so they start larger. The far field uses cells of 70, 48 and 26 per screen height; a cell holds a spark with a probability that falls with height. In the lake, the sky is read at the mirrored height with a sideways ripple from stretched value noise, and each near lantern is reflected about its own water line and stretched 1.8 times downward.",
      source: "src/effects/lanterns",
    },
    accent: "#ff9a3c",
    controls: [
      ctl("glow", "Glow", 0.4, 2, 0.01, 1),
      ctl("count", "Lanterns", 0.3, 2, 0.01, 1),
    ],
    create: (setup) => createLanterns(setup, lanternsWgsl),
  },
  {
    id: "ebru",
    touch: "drag",
    name: "Ebru",
    published: "2026-11-22",
    category: "Marbling",
    tagline: "Drop paint on water, pull a stylus through it, and watch it marble.",
    summary:
      "A tray of dark size with paint floating on it, the way Turkish ebru paper is marbled. Drops of cream, oxblood, ochre, indigo and verdigris spread into rings, combs pull them into stripes and back again, and wide waves bend the stripes into chevrons, all with edges that stay razor sharp however thin they are drawn. Little flowers appear where a drop is laid inside another and a stylus is drawn up through them. Press to drop paint and hold to let it spread; drag to pull a stylus through the paint. Left alone, the tray is skimmed clean with a strip of paper and a new pattern begins. Drop size sets how much paint each drop carries, and Stylus how wide a line the stylus pulls.",
    explanation: [
      { title: "Every move is a map", body: "A drop of paint pushes everything around it outward without changing its area, and a stylus or comb slides the paint near it along its line. Both are exact formulas, so the tray is kept as a list of moves rather than a grid of paint." },
      { title: "Walk the list backwards", body: "For each pixel the moves are undone from newest to oldest. If the point lands inside a drop, that is its colour; otherwise it carries on, and past the oldest move it reads the tray as it was last baked." },
      { title: "Sharp at any stretch", body: "While undoing the moves, the pixel also keeps track of how much each move stretched and squeezed the space around it. That tells it exactly how many pixels wide a drop's edge is where it lands, so even edges combed hair thin are smooth." },
      { title: "Keep the list short", body: "Moves that have stopped changing are baked into a texture now and then, and the tray is only drawn again when something moves. When the pattern is still, each frame just shows it with the light on the size." },
    ],
    rationale: {
      idea: "Turkish paper marbling: drop paint on water and pull a stylus through it, with edges that stay crisp however far you comb.",
      firstSeconds: "A dark tray already marbled into rings and fine stripes of cream, oxblood, ochre and indigo, and a wide comb is being drawn down through it, bending the stripes into waves, before three small flowers are laid and pulled into tulips.",
      interaction: "Press and a drop of paint lands under your hand, pushing every ring around it outward; hold and it keeps spreading. Drag and you pull a stylus through the paint, dragging the rings into feathers and teardrops behind it. Nothing you do blurs, because every move is exact.",
      headline: "The lower left: the unseen hand drops its paint away from it so the dark size shows there, and the tray darkens toward that corner.",
      nearest: "Ink, where you drag through a fluid and colour curls. Ink is a soft, diffusing fluid simulation; Ebru never diffuses, it folds crisp flat colours into patterns, and pressing adds paint as well as moving it.",
      risks: "Replaying many moves for every pixel could be slow, so finished moves are baked into a texture, the list is capped at 40, and the tray is only redrawn while something is moving. A bake resamples the paint once, which could soften it, so only moves that have stopped are baked, and squeezed areas average over the pixel's footprint. A drag with too long a stylus step could fold the paint over itself, so each stroke's push ramps in and out over at least its own length.",
    },
    technical: {
      insight: "Marbling moves are invertible formulas, so the paint never has to be simulated: undo the moves per pixel and the pattern is exact at any resolution.",
      pipeline: [
        "fragment · bake, when the list is long: replay the oldest finished moves over the last bake into an rgba8 texture",
        "fragment · tray, only when a move changes: undo up to 40 moves per pixel, carrying the 2x2 Jacobian for antialiased drop edges and footprint-averaged reads of the bake",
        "fragment · picture: the tray with a soft reflection on the size, darker rim, stylus shadow and ring, and the paper strip that skims it",
      ],
      techniques: [
        "inverse mapping",
        "analytic Jacobians",
        "exact antialiasing",
        "baking",
        "redraw on change",
      ],
      notes:
        "A drop of radius r at c maps a point at offset v to c + v sqrt(1 - r²/|v|²) when undone, which keeps area, so a drop dropped into rings squeezes them into fine bands. A stroke from a to b slides points along its direction by 0.85 of its length times exp(-d/w) across it and a ramp along it that rises and falls over at least the stroke's length, so the push never folds the paint. A comb is a row of tines across the whole tray, shaped by a raised cosine, with a front that moves along it. A pixel whose edge coverage is partial blends the drop's colour with whatever lies beyond it. Moves are baked sixteen at a time once 28 are kept.",
      source: "src/effects/ebru",
    },
    accent: "#d89a36",
    controls: [
      ctl("drop", "Drop size", 0.5, 1.8, 0.01, 1),
      ctl("stylus", "Stylus", 0.5, 2, 0.01, 1),
    ],
    create: (setup) => createEbru(setup, { marble: ebruMarble, present: ebruPresent }),
  },
  {
    id: "focus",
    // Many lights tested per pixel; capped so laptop GPUs stay calm.
    maxDpr: 1.25,
    name: "Rack Focus",
    published: "2026-11-23",
    category: "Photography",
    tagline: "A night avenue through a fast lens, and focus follows your hand.",
    summary:
      "A long city avenue at night, seen from a balcony through a fast lens. Brick, stone, concrete and glass buildings line the avenue in perspective, some set back behind their neighbours, with cornices, window reveals and lit offices and shopfronts. Lamp posts light pools on the wet road, cars, vans, taxis and buses come and go with their bodies catching the street light, their headlights throwing beams ahead and their tail lights streaking in the reflections, signals change at the crossings, towers rise at the far end, and string lights hang across the balcony. Only one depth is ever sharp: everything else spreads into bokeh, hexagonal from the aperture blades, brighter at the rim, squeezed into cat's eyes toward the corners and fringed magenta in front of focus and green behind it. Point at anything and the lens pulls focus to it, melting the rest. Left alone, it racks slowly between the far end of the avenue, the near blocks and the bulbs. Aperture sets how shallow the focus is, and Exposure how bright the lights.",
    explanation: [
      { title: "A street in perspective", body: "The camera stands on a balcony fourteen metres up, looking down an avenue. Facades, road, lamps, cars and windows all sit at real distances in metres and are projected to the screen, so the street converges on a vanishing point as a real one does, and every light knows how far away it is." },
      { title: "The circle of confusion", body: "A light that is out of focus spreads into a disc whose radius is the aperture times how far it is from the focus distance, measured in diopters, one over the distance. A lit window is a small rectangle spread the same way. The same light spread wider is dimmer, so out-of-focus lights melt into large soft discs while the ones in focus are small and sharp." },
      { title: "Only test what can reach", body: "Along a straight row of lights, like a line of lamps or a lane of cars, the screen position is linear in one over the distance, so for each pixel the lights that can reach it lie in a narrow range of that row, found directly. Windows are found the same way on each facade, by bay and floor." },
      { title: "Buildings and cars with bodies", body: "Each building is a box on its own frontage, set back or not, so a ray walks the frontages until it meets a facade or a side wall that steps out above a lower neighbour. Window grids are box-filtered by the pixel and the disc, so far facades never stripe. A car is two convex shapes, a body and a cabin with slanted windscreens; its outline is softened by its disc, and a ray picks out roof, glass, flanks, wheels and grille for shading." },
      { title: "Draw the still part once", body: "The buildings, windows, lamps, road and skyline do not move, so they are drawn into a texture only when the focus changes. Each frame then only adds the traffic, its reflections, the signals and the swaying string lights." },
    ],
    rationale: {
      idea: "A night avenue through a fast lens where focus follows your hand, and everything else melts into bokeh.",
      firstSeconds: "Looking down a long avenue at night with the string lights across the balcony sharp and the whole street behind them melted into big soft discs; then the lens racks focus and the windows, lamps, traffic and far towers snap sharp while the bulbs swell into glowing hexagons.",
      interaction: "Point at anything, a bulb, a car, a window or the towers at the far end, and the lens pulls focus to its distance with a focus puller's ease, so you choose what is sharp and watch the rest dissolve. On touch, tap where you want it.",
      headline: "The lower left: the dark balcony parapet in front of the street, which hides the near road and stays quiet.",
      nearest: "Lantern Night, also warm lights in the dark. Lantern Night moves its lights and the pointer is air; here the lights stay put and the pointer moves the focus, so the whole picture is about the lens.",
      risks: "A city drawn cheaply would look like a diagram, so the street is a real perspective avenue with facades, shopfronts, lamp pools, lane markings, wet reflections and traffic. Bokeh can look like a filter, so the discs carry blade shape, rim, cat's eye and colour fringes, and far lights are dimmer so the vanishing point does not blow out. Testing every light would be slow, so each pixel only visits the lights that can reach it, the still street is redrawn only while focus moves, and the effect is capped at 1.25x pixel density.",
    },
    technical: {
      insight: "Depth of field for lights is exact and cheap if you gather rather than blur: every light knows its distance, so its disc is known before you draw it, and along a straight row the lights that can reach a pixel are found directly.",
      pipeline: [
        "fragment · still street, only when focus or aperture changes, rgba16float: sky and far skyline, buildings walked frontage by frontage with setbacks, side walls, cornices and filtered window grids, lamp posts, facades and road softened by their own disc, with lights hidden where a nearer building covers them, lit windows and shopfronts as blurred rectangles, street lamps and their reflections, lamp pools and lane markings",
        "fragment · picture: traffic in four lanes: car, van, taxi and bus bodies with shadows and headlight beams on the road, head and tail lights and their reflections, signals at the crossings, string lights, film shoulder and vignette",
        "cpu · focus on a critically damped spring toward the depth under the pointer, or a slow cycle when idle",
      ],
      techniques: [
        "circle of confusion",
        "gathered bokeh",
        "perspective light rows",
        "cat's eye vignetting",
        "chromatic aberration",
        "focus breathing",
      ],
      notes:
        "The camera is 14 m up with a focal factor of 1.25 screen heights; facades stand 11 m left and 21 m right, blocks are 92 m with a 17 m cross street, and the avenue runs 700 m. Windows sit on a 3.4 m by 3.6 m grid, fewer lit on the near blocks; lamps stand every 32 m on both kerbs; cars come in 26 m slots in four lanes. Disc radius is 0.07 screen heights per diopter at the default aperture, and point brightness falls as radius to the power 1.3 so large discs stay visible; far lights fade with distance to the power 1.5. Reflections are the mirrored rows stretched six times vertically. The parapet hides everything behind it with an edge softened by its own disc.",
      source: "src/effects/focus",
    },
    accent: "#ffb15c",
    controls: [
      ctl("aperture", "Aperture", 0.3, 1.6, 0.01, 1),
      ctl("exposure", "Exposure", 0.4, 2, 0.01, 1),
    ],
    create: (setup) => createFocus(setup, { still: focusStill, lens: focusLens }),
  },
  {
    id: "koi",
    // A full pond picture with ten fish per pixel; capped so laptop GPUs stay calm.
    maxDpr: 1.25,
    name: "Koi",
    published: "2026-11-24",
    category: "Pond",
    tagline: "A garden pond seen from above, and the koi come to your hand.",
    summary:
      "Looking straight down into a shallow garden pond on a bright day. Koi of several varieties, red and white kohaku, three coloured sanke and showa, gold ogon, platinum, brown chagoi, tancho with its single red crown and blue asagi, swim over a bed of river stones and weed, their fins trailing and their bodies flexing with every stroke. Sunlight breaks into caustics on the stones, the sky and the trees overhead reflect off the surface, lily pads float in one corner and ginkgo leaves drift across. Hold still over the water and the nearest fish come to look; move fast and they scatter. Press to scatter food, and they race to it and gulp at the surface. Sunlight sets the brightness of the day and Ripples how much the water moves.",
    explanation: [
      { title: "A head and a spine", body: "Each koi is a head that steers and ten points that follow it at fixed spacing, so the body bends along the path it swam. A travelling wave added on top, growing toward the tail and faster when the fish hurries, makes it swim rather than slide." },
      { title: "Simple wants, added up", body: "Every fish adds up a few pulls: a slow wander, the nearest food, a quiet hand to look at, a quick hand to flee, room from the others and the pond's edges. Turning is limited, so they arc rather than snap." },
      { title: "Ripples on a grid", body: "The water height lives on a small grid that runs the wave equation every frame. Your hand, landing food, a gulping fish and shallow swimmers all push dents into it, and the rings spread, reflect and fade." },
      { title: "Seen through moving water", body: "The slope of the ripples bends the view of the stones and fish below, focuses sunlight into caustics, and tilts the reflection of sky and trees, which grows stronger at a glancing angle." },
    ],
    rationale: {
      idea: "A sunny koi pond seen from above, where the fish come to a still hand, flee a quick one and race for food.",
      firstSeconds: "Bright water over pale stones with sunlight dancing on them, and a handful of red, white, gold and black koi gliding in slow arcs, bodies flexing; a few seconds in a pinch of food lands, rings spread and the fish swing round to gulp at it.",
      interaction: "The fish read your hand the way real koi read a person at the edge: hold still and the nearest drift over to look, move fast and they bolt, press and food lands where you pressed and they all race for it. Every move leaves ripples that bend the whole picture.",
      headline: "The lower left: the fish steer away from it on wide screens and the water there is calm stones and shade.",
      nearest: "Lido, also water seen from above with ripples and caustics. Lido is an empty pool about light; here the water is a stage for living fish that respond to you.",
      risks: "Fish drawn as ovals would look cheap, so they have tapered bodies with heads, forked tails, trailing fins, real variety patterns, scales and a sheen, and they bend along a spine. Flocks can look mechanical, so each fish has its own wander, speed and depth. Ten detailed fish per pixel could be slow, so each fish is skipped outside its bounds and the effect is capped at 1.25x pixel density.",
    },
    technical: {
      insight: "A believable fish is mostly in the spine: a head that steers plus points that follow at fixed spacing gives bending for free, and a travelling wave on top turns gliding into swimming.",
      pipeline: [
        "fragment · ripple height on a rgba16float grid of 480 on its long edge, the wave equation with damping, dents from the hand, food, gulps and shallow fish",
        "fragment · pond: refracted stones, weed and caustics, shadows of fish and leaves, koi with fins, tail, variety patterns, scales and depth tint, sky and canopy reflection with fresnel, glints, floating lily pads, ginkgo leaves and food",
        "cpu · ten-point spines, steering from wander, food, the hand, separation and the edges; food, gulps and drifting leaves",
      ],
      techniques: [
        "follow-the-leader spines",
        "steering behaviours",
        "wave equation ripples",
        "refraction",
        "caustics",
        "fresnel reflection",
      ],
      notes:
        "Nine fish on wide screens and six on phones, each with ten spine points; turn rate limited and speeds between slow cruise and a dash. The ripple step is twice the height minus the last, plus 0.24 times the Laplacian, times 0.986. Food lands four pellets at a time, auto-fed every 16 to 24 seconds when nobody is there. Fish deeper down are bluer, softer and fainter.",
      source: "src/effects/koi",
    },
    accent: "#e8552a",
    controls: [
      ctl("light", "Sunlight", 0.3, 1.6, 0.01, 1),
      ctl("ripples", "Ripples", 0.3, 2, 0.01, 1),
    ],
    create: (setup) => createKoi(setup, { water: koiWater, pond: koiPond }),
  },
]

export const EFFECTS: readonly HeroEffect[] = ENTRIES.map((e) =>
  "wgsl" in e ? { ...e, create: fullscreen(e.wgsl, e.controls, e.renderScale) } : e
)

export type { HeroEffect } from "./types"
