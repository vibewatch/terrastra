# Architecture Decision Records — "Terrastra"

Terrastra is an original, kid-friendly 3D toy-globe web app whose *capabilities* are comparable to the
reference product studied in [exploration report](../research/exploration-report.md). No code, models, text, images, audio or data files
from the reference were copied; only publicly observable behaviour and open data sources were used.

Status legend: **Accepted** / Proposed / Superseded.

---

## ADR-001 — Single-page WebGL client built with Vite + TypeScript + Three.js
**Status:** Accepted

**Context.** The reference is a single HTML page with ~15 MB of hand-written, unbundled JS (Three.js r128
from a CDN, globals everywhere, data inlined into the scripts). It loads in two stages and takes a long time
to become interactive on low-end devices (observed: ~60–150 s under software rendering).

**Decision.** Use Vite (ES modules, code-splitting, hashed assets), strict TypeScript, and Three.js from npm.
Feature modules (globe, layers, games, quiz, photo, ride, dex, i18n, ui) are separate ES modules with
explicit imports. The curated catalogue and cities are typed TS modules (`src/shared/data/*`), so they are shared,
type-checked, by the client, the server (validation) and the static-page generator. The large country geometry
(`/data/countries-110m.json`) is fetched at start-up.

*Implementation note (2026-10):* the production bundle is ~716 KB JS / ~205 KB gzip, including Three.js and the catalogue.

**Consequences.** + Type-safety, tree-shaking, small initial bundle, testable pure logic.
− A build step is required (acceptable: CI and `npm run build`).

## ADR-002 — Procedural low-poly "toy" models instead of hand-authored meshes
**Status:** Accepted

**Context.** The reference hand-codes ~1,400 Three.js builder functions (one per landmark/animal/vehicle).
That is not reproducible, and copying it would infringe.

**Decision.** A small *model kit* (`src/client/models/kit.ts`) of ~57 parametric builders (e.g. `lattice`, `pyramid`,
`domed`, `suspension`, `pagoda`, `mountain`, `quad`, `penguin`, `whale`, `octopus`, `wreck`, `ship`, `plane`,
`train`, `balloon`) composes each catalogue entry from a compact recipe (`model: {kind, color, accent, …}`).
New content = new data, not new code.

**Consequences.** + Thousands of items possible from data. − Less bespoke detail per item (accepted for MVP).

## ADR-003 — Country geometry from Natural Earth (via `world-atlas` TopoJSON)
**Status:** Accepted

**Decision.** Use the public-domain Natural Earth 1:110m countries (from `world-atlas`, vendored as `public/data/countries-110m.json` and `countries-50m.json`) decoded
with `topojson-client`. Countries are rendered into an equirectangular canvas texture (political colours,
borders, graticule) wrapped on a sphere; the same polygons drive point-in-country lookups for games.

**Consequences.** + Public domain, small (~100 KB). − Coarse coastlines at high zoom (acceptable for a toy look).

## ADR-004 — Labels drawn on a 2D overlay canvas with collision culling
**Status:** Accepted

**Decision.** Country, city, ocean and item labels are projected each frame and drawn on a 2D canvas above
the WebGL canvas, with back-face culling (dot product with the camera), zoom-tier filtering and a greedy
rectangle collision pass. This mirrors the observed UX (labels fade in with zoom) without per-label DOM nodes.

## ADR-005 — Local-first progress, optional account sync
**Status:** Accepted

**Context.** The reference requires sign-in (Supabase magic link / Google OAuth) for riding, the dex,
discoveries and games; anonymous users only explore. For a children's product, forcing sign-in adds
friction and collects personal data.

**Decision.** All progress (dex, discoveries, stickers, game/quiz stats, daily puzzle, photos, settings) is
stored locally first (localStorage + IndexedDB for photos). An *optional* account (email magic link) enables
cloud sync of progress, reactions (♥ like / ✓ visited counts) and a moderated guestbook.

**Consequences.** + Works offline and anonymously; COPPA/GDPR-K friendlier. − Sync conflict rules needed
(see ADR-007).

## ADR-006 — Backend: Node.js + Express + built-in `node:sqlite`
**Status:** Accepted

**Decision.** A small Express 5 server (`src/server/`) serves the built SPA + static encyclopedia pages and a JSON
API under `/api/*`. Persistence uses Node's built-in `node:sqlite` (no native addon build). Auth: passwordless
email magic link; tokens are random 32-byte values stored hashed (SHA-256) with 15-min expiry; sessions are
httpOnly, `SameSite=Lax`, `Secure` (in production) cookies. Mail delivery is an injected `sendMail(to, link)` hook. Outside production
the link is logged with a masked address and also returned in the API response (`devLink`; forced on with
`DEV_LOGIN=1`, e.g. for e2e). A production mail transport (SMTP/API) is a backlog item (B-12).

**Consequences.** + Zero external services; one process; easy to host. − SQLite is single-node (fine for MVP;
swap to Postgres behind the same repository interface later).

## ADR-007 — Progress sync = per-field merge (union for collections, max for counters)
**Status:** Accepted

**Decision.** `PUT /api/progress` merges client and server documents: sets (dex, discoveries, stickers) are
unioned; numeric stats take the max; "best" maps take per-key max; daily puzzle history is unioned by day.
The merged document is returned and stored by the client. No destructive overwrite is possible.

## ADR-008 — Static, pre-rendered encyclopedia pages for SEO
**Status:** Accepted

**Context.** The reference ships ~2,940 crawlable pages (landmarks/animals/discover × en/ko) with facts,
quick answers, a quiz teaser, "nearby" links and a "See it on the 3D globe →" deep link (`/#<key>`).

**Decision.** A build script (`scripts/build-pages.ts`) renders the catalogue into static HTML pages
(`/landmarks/`, `/animals/`, `/discover/`, `/<section>/<slug>/`, localized under `/<lang>/…`), plus
`sitemap.xml`, `robots.txt` and a friendly 404. Deep links `/#<key>` fly the globe to the item and open its card.

## ADR-009 — i18n: 4 languages, dictionary objects, language resolution chain
**Status:** Accepted

**Decision.** UI strings live in `src/client/lib/i18n.ts` (en, ko complete; ja, zh partial). Language resolution:
saved choice (`localStorage`) → `navigator.language` → `en`. Missing keys fall back to English per key.
Catalogue names/descriptions are per-language maps (en + ko) with English fallback. Country names come from `Intl.DisplayNames`.

## ADR-010 — Testing strategy
**Status:** Accepted

**Decision.** Vitest for pure logic (geo math, scoring, quiz generation, daily puzzle, merge, i18n
resolution) and API tests (supertest-style with `fetch` against an ephemeral server). Playwright e2e against
the production build under Xvfb + SwiftShader, with `?lowfx=1` to reduce GPU cost in CI.

## ADR-011 — Performance budget & adaptive quality
**Status:** Accepted

**Decision.** Initial JS ≤ 300 KB gz (Three.js dominates). Render on demand: a frame is drawn only when the
camera/scene is dirty or something animates. DPR is capped at 2. Labels refresh at ~8 Hz. `?lowfx=1` (also the default
under `prefers-reduced-motion`) uses DPR 1, no MSAA, a 512 px map texture, fewer stars and 1 Hz labels.
Shadows and every item layer can be toggled. Device tiers and frame-time-adaptive DPR: see ADR-015.
Model geometry ships packed (`models/pack.ts`): normals as normalised Int16 and vertex colours in 0…1 as normalised
Uint16, which cuts the GPU upload of the globe's models by about a third (≈338 → 232 MB once every model is placed)
with no visible change. three.js' synchronous shader-error check (`renderer.debug.checkShaderErrors`) runs only in
development, so production builds never stall on `getProgramInfoLog` when a program compiles.

## ADR-012: Daily puzzle is computed client-side and deterministically
**Status:** Accepted

**Context.** The reference stores the daily answer key in localStorage. A server-side puzzle would hide the
answer but would require the network and an account-less identity for streaks.

**Decision.** `dayIndex` (local calendar days since 2026-01-01) selects from a frozen, seeded pool of landmarks,
with consecutive days ≥ 1200 km apart. All players get the same puzzle on the same local date, and it works offline.
Guesses can be typed (accent-insensitive, any language alias) or picked by tapping the globe.

**Consequences.** + Offline, zero server cost, reproducible in tests. − A determined user can read the answer
from the bundle. That is acceptable for a kids' toy with no prizes or leaderboard.

## ADR-013: Reactions and reports keyed by an anonymous visitor cookie
**Status:** Accepted (supersedes the "auth" note in §4.6 of the architecture draft)

**Decision.** ♥/✓ reactions and guestbook reports use a random 128-bit `pp_vid` httpOnly cookie, not an account.
One reaction of each kind per visitor and item, and one report per visitor and entry. Posting to the guestbook still requires
sign-in, which gives accountability for the only user-generated text.

**Consequences.** + Kids can react without an account. − Counts can be inflated by clearing cookies (low
stakes; the item key is validated, and a reverse-proxy rate limit is recommended in production).

## ADR-014: Models are built in Web Workers, with a far level of detail and instanced plinths
**Status:** Accepted (extends ADR-011)

**Context.** Hero models are 20–40k triangles each and took 50–300 ms to build and AO-bake on the main thread. That
caused long tasks while the user flew around. The tour also drew ~6 draw calls and ~20k triangles per visible item,
even when an item was only a few pixels tall.

**Decision.**
- `models/build.worker.ts` builds and bakes models in a pool of up to 2 module workers. `models/pack.ts` ships the
  result as transferable typed arrays. `models/library.ts` is the only API the app uses: it keeps a prototype cache,
  hands out clones, and falls back to building on the main thread (lazy `kit.ts` chunk) when workers are unavailable.
- `bakeStaticMeshes` appends a far copy of every merged mesh. Each high-poly part is vertex-clustered (grid cell ×
  dominant normal). The simplification is area-guarded, so thin lattices are kept as they are. Tiny parts are
  dropped. Below ~60 px on screen an instance draws only that range (`setModelDetail`), which is ~27% of the
  triangles on average.
- All plinth shadows and rings are two `InstancedMesh`es. three.js is split into its own long-cached chunk.
- `tools/perf.mjs` measures load and tour metrics (long tasks, frame CPU, draw calls, triangles) on `dist`.

**Consequences.** + No model building on the main thread. Per visible item, ~3.5 draw calls and ~6.5k triangles
instead of ~6 and ~20k. + The main bundle no longer contains the builders. − Models must stay serialisable:
untextured MeshStandard/MeshBasic materials and plain BufferGeometry, otherwise they fall back to the main thread.

## ADR-015: Device quality tiers for phones, adaptive resolution and a visible-model budget
**Status:** Accepted (extends ADR-011 and ADR-014; closes backlog B-15)

**Context.** On an emulated mid-range phone (390×844 at DPR 3, 4× CPU throttling, `tools/perf.mjs --mobile`) the app
rendered a 780×1688 MSAA buffer, drew ~290 draw calls / ~510k triangles per frame and spent ~5.5 s of start-up
painting the 2048 px biome map on the main thread. Profiling `frame()` showed the JS work is ~1 ms; the cost is GPU
fill (pixels × MSAA × translucent layers) plus geometry.

**Decision.**
- `globe/quality.ts` picks a tier once at start-up: `high` (desktop), `medium` (phones/tablets: mobile UA or coarse
  pointer on a ≤1024 px screen, or ≤4 GB memory) and `low` (≤2 GB or ≤2 cores, or `?lowfx`). `?q=high|medium|low`
  overrides. Every resolution/detail knob lives in the tier table: DPR cap, MSAA, map / night / cloud texture sizes,
  sphere segments, aurora and star counts, far-LOD threshold, placement budget, visible-model budget and idle frame cap.
  `body.q-<tier>` lets CSS drop `backdrop-filter` (panels are ~90% opaque anyway) on phones.
- **Adaptive resolution.** `AdaptiveResolution` smooths the interval between rendered frames and steps the pixel ratio
  down by 0.25 after ~45 slow frames (> 36 ms) to the tier floor, and back up after ~300 fast ones; stalls > 250 ms and
  idle-capped frames are ignored. Off under reduced motion (frames are drawn on demand there).
- **Visible-model budget.** Every ~400 ms (or when the view changes) static models facing the camera are ranked by
  closeness to the view centre (+ a small tier-1 bonus); beyond the tier's budget (48 on phones) they are hidden.
  Moving items are hidden once they pass behind the horizon (they keep travelling), except orbiters.
  Moving items have their own cap (16 on phones), ranked from their current positions.
- **Idle frame cap.** On `medium`/`low`, when nothing is dragged, flown or ridden, ambient animation runs at 30 fps.
- **Faster map painting.** The procedural biome colour field is evaluated on a 2-px lattice (lazily, only next to land)
  and interpolated bilinearly: 3× faster, mean difference 0.08/255.

**Consequences.** Phone emulation: ready 8.7 s → 4.4 s, draw calls 287 → 170, triangles 512k → 303k, render buffer
1.3 M → 0.74 M pixels without MSAA. − Phones show fewer models at once when zoomed out (the nearest win; zooming in
reveals the rest). − Phone edges are slightly softer (no MSAA, DPR ≤ 1.5).

## ADR-016: The Solar System is a second, lazily loaded view with real orbits and compressed scales
**Status:** Accepted

**Context.** Kids asked to zoom out from the Earth to the other planets and see their landscapes and where they are.
Real scales do not fit on a screen (Neptune is ~4.5 billion km away; Earth would be under a pixel), the globe's camera,
picking and item pipeline are Earth-specific, and the extra code and textures must not slow the globe or phones.

**Decision.**
- **Separate view, loaded on demand.** `src/client/solar/` (view, UI, painter worker) is a dynamic-import chunk with its
  own `WebGLRenderer` and canvas. While it is up the globe is `paused` (its RAF does no work) and hidden; only one
  renderer draws at a time. Entry: wheel/pinch on past the globe's widest zoom (`Globe.ev.onBeyond`), the zoom-out button
  at max zoom, the toolbar planet button, or `#solar…` links. Exit: zooming into Earth below 4.6 R (the globe's widest
  view is 5.5 R), "Back to Earth" or "Land on Earth"; the globe then flies in to the same latitude/longitude.
- **Real positions, display scales.** `shared/lib/orbits.ts` (pure, unit-tested) computes heliocentric ecliptic
  positions from JPL's approximate Keplerian elements, the Moon from a short lunar series (correct phases) and other
  moons on circular orbits in their planet's equatorial plane. For display, orbit radii are compressed as `12·√AU` and
  body radii as `0.34·(R/R⊕)^0.45` (Sun fixed at 2.6); moon distances are monotonic in the real ones. Directions,
  order, eccentricity and inclinations stay real. Axial tilts and pole directions are applied; Earth's spin puts the
  sub-solar point over the right longitude, tidally locked moons keep the same face to their planet, others spin freely.
  Spin is capped at 2 simulated hours per real second so fast time does not whirl the planets.
- **Time.** A simulated clock (pause, real time, 1 hour/1 day/1 month/1 year per second, "now"); positions are recomputed
  each frame (20 bodies, microseconds).
- **Surfaces painted procedurally in a worker.** `paint.ts` (DOM-free) paints equirectangular colour maps with real named
  features at real coordinates, plus height maps used as bump maps for solid bodies, and ring profiles. Every body gets a
  small map up front (256 px, 512 on desktop); the focused body is repainted at 1024 px (2048 on desktop), at most three
  large maps are kept. Earth reuses the globe's own painted land map over an ocean.
- **Camera.** An orbit camera around the focus body (drag, wheel/pinch, inertia; distance measured from the surface).
  Near a body it co-rotates with the surface, so landforms stay put while day and night sweep across. Picking is
  screen-space against projected discs (plus a 16 px slop for tiny far bodies); names and features are HTML labels
  (feature labels only on the visible hemisphere of the focus body, de-cluttered, largest first).
- **Content.** `solar.ts` (physical data), `solar-text.ts` (card text) and `solar-features.ts` (named craters, maria,
  volcanoes, canyons, landing sites… with east-positive planetocentric coordinates) are bilingual; `gen-wiki` maps them
  to Wikipedia as `sb_<body>` / `sf_<body>_<slug>` so the same in-card reader works.

**Consequences.** + No cost to the globe until opened; the chunk is small and textures are painted, not downloaded.
+ Correct sky for any date (planet positions, Moon phase, seasons via Earth's tilt). − Distances and sizes are not to
scale (explained by the compressed display; facts in the card give real numbers). − Minor moons' positions along their
orbits are approximate.

## ADR-017: One connected scale ladder from the Earth to the observable universe
**Status:** Accepted

**Context.** Kids wanted to keep zooming out past the Solar System to see where it sits: the Milky Way, the Local
Group, the Laniakea supercluster and the whole observable universe. They also wanted the Earth and the other worlds
to feel like one system, with real mission sites to visit on the other worlds. Planets were also spinning too fast.

**Decision.**
- **Six levels, one rail.** Earth → Solar System → Milky Way → Local Group → Laniakea → Universe. A `ScaleRail`
  (`ui/scales.ts`) is always on screen. Zooming past a level's widest view moves up one level, and zooming into its
  "home" object (the Sun, the Milky Way, the Local Group, Laniakea) moves down one level. Routes are `#solar`,
  `#milkyway`, `#localgroup`, `#laniakea` and `#universe`, each with an optional `/<key>`.
- **Deep levels share the Solar System's renderer.** `solar/deep.ts` (`DeepStage`) gives each level its own scene,
  camera and unit (ly per scene unit: 1e3, 2e4, 1e6, 1e8). Levels are built lazily on first visit, and switching
  levels cross-fades through a veil. Objects sit at real galactic coordinates (`l`, `b`, distance) converted by
  `shared/lib/sky.ts`; the camera's view direction carries across levels (ecliptic ↔ galactic) so "up" stays
  consistent. Galaxies, the cosmic web and the CMB are procedural point clouds and painted canvases
  (`cosmos-paint.ts`) drawn with one additive point shader. A per-cloud gain keeps dense clouds from saturating.
- **Content.** `shared/data/cosmos.ts` holds ~110 bilingual deep objects plus a `SCALE_INFO` card for each level.
  `shared/data/solar-sites.ts` holds real mission sites (landers, rovers, orbiters, plumes, far probes). `SiteLayer`
  (`solar/sites.ts`) builds 3D models only for the focused body when the camera is close, one model per frame.
  `gen-wiki` maps `ss_*`, `dp_*` and `sc_*` keys to Wikipedia, and search includes a lazily loaded space index.
- **Calmer spin.** On-screen angular speed is soft-capped (`tanh`, at most one turn per minute). The Earth follows the
  exact clock only at slow speeds, and the camera co-rotates only near a body or with a feature selected.

**Consequences.** + One continuous zoom from a street-level landmark to the CMB. + Deep levels cost nothing until
visited, and point counts scale with the quality tier. − Positions in the Laniakea and universe levels are
illustrative beyond the catalogued objects (the procedural web is not a survey map). − Distances inside each level are
real, but sizes of labels and galaxies are enlarged so they can be seen.

## ADR-018: Space weather, constellations and living deep-space levels behind a sci-fi HUD

**Context.** Users asked for a more sci-fi interface. They also wanted space to feel grander and more alive: galaxies
that rotate and glitter, constellations, solar flares, the asteroid belt, and storms and weather on the planets. The
universe level showed the CMB as a ball floating in black instead of a sky that fills the screen.

**Decision.**
- **HUD theme.** Space views use a cyan "instrument" skin: corner brackets, a Chakra Petch display font for readouts,
  a live coordinate/scale readout, a one-shot scan line when a card opens and size readouts on the scale rail. It is
  pure CSS over the existing components (`.solar-ui`, `.hud-frame`), so the globe UI is unchanged.
- **Solar effects (`solar/fx.ts`, `SolarFX`).** One module owns all of them:
  - small bodies: point-cloud asteroid belt, Trojans and Kuiper belt, drifting with Kepler-like speeds in the
    vertex shader;
  - the Sun: corona, prominence loops, flares and coronal mass ejections that grow and fade on their own cycles;
  - weather: flow-map clouds on the giant planets (zonal jets and vortices such as the Great Red Spot),
    Venus's super-rotating clouds, a moving Earth cloud shell, Mars dust storms and polar aurorae on the Earth,
    Jupiter and Saturn;
  - Comet Encke on a real orbit, with dust and ion tails that point away from the Sun and lengthen near
    perihelion.
  Particle and loop counts scale with the quality tier, and effects pause with simulation time.
- **Constellations (`solar/constellations.ts`, `shared/data/constellations.ts`).** 42 constellations and 51 named
  stars, placed on a sky sphere that follows the camera, with bilingual names. A time-bar chip toggles them
  (`pp.cst`). Each opens a card with a drawn star chart and a Wikipedia reader (`cst_<id>` keys in `gen-wiki`).
- **Living deep space (`solar/deep.ts`).**
  - Each level has a root group. The Milky Way turns clockwise as seen from the galactic north (a few degrees a
    minute, so the motion is visible). Objects and the camera's carried-over angle rotate with it, so
    Solar ↔ Milky Way hand-offs still line up.
  - Disc and halo stars twinkle, and Sgr A* pulses. In the Local Group, spiral galaxies spin about their own
    axes.
  - After 6 s without input, the camera slowly orbits.
- **Universe from inside.** The universe level now keeps the camera inside the CMB shell, and the shell samples
  the CMB map by view direction. The afterglow fills the whole screen like a sky, with the cosmic web in front.

**Consequences.**
- \+ The views feel alive without extra draw calls on the globe.
- \+ Effects cost about 10k points at the medium tier.
- − Rotation and effects are exaggerated in speed and size, so that kids can see them.
- − The constellation figures are simplified, with the main stick-figure lines only.

## ADR-019: "Astrolabe" HUD identity, starfield intro and a richer Local Group

**Context.** The interface used a generic cyan sci-fi look with coloured icons and emoji. Each view (globe,
modals, space) looked slightly different, and the Local Group level felt empty.

**Decision.**
- **One skin (`client/hud.css`).** It loads after `styles.css` and is used by the globe, the modals and the space
  views.
  - **Shape.** Every surface has two opposite cut corners: top-left and bottom-right. The corners use
    `clip-path`, and hairlines on the cut edges are drawn as background layers (`--pp-clip`, `--pp-cuts`, `--cut`).
  - **Panel marks.** Panels carry an amber signal tab on the top edge and ruler ticks on the bottom edge.
  - **Signal colour.** Everything is drawn in ice-cyan. One amber signal colour (`--sig`) marks only selected,
    active, live or earned states: tabs, chips, lock-ons, progress, the crumb trail and the brand satellite.
  - **Fonts.**
    - Chakra Petch for display text.
    - Geist Mono (`--font-data`) for data, labels and numbering.
    - Geist for reading text.
  - **Signature details.**
    - Numbered cards (CSS counters) that lock on when hovered: the cut edges turn amber and a hatched band
      appears.
    - Amber slash marks on headings.
    - A blueprint grid behind modals.
    - A catalogue number on each info card.
    - A live latitude/longitude readout under the globe (`Shell.setZoom(z, lat, lon)`).
  - **Icons and targets.** Icons are monochrome line glyphs, and item emoji are shown as cyan holograms. Tap
    targets are larger: about 46×42 px on desktop and at least 38 px on phones.
- **Intro.** The intro (`index.html`, `intro.css`) paints a deep starfield before the bundle loads, using the same
  marks: an orbiting satellite, the signal tick and cut corners. The globe then flies in.
- **Local Group (`solar/deep.ts` `buildGroup`).** Galaxies are drawn 2.4× their true size and get:
  - star swarms and halo glows;
  - about 125 satellite and field dwarfs;
  - the Magellanic Stream and Bridge, Andromeda's Giant Stream and the M31–M33 bridge;
  - the M31 approach flow and intragroup gas;
  - distance rings with labels and neighbouring groups.

  All of these scale with the quality tier.

**Consequences.**
- \+ The app has a recognisable look, and every view shares one design language.
- \+ Motion uses only transform and opacity, and it is switched off on the low tier and with reduced motion.
- − Because `clip-path` clips outer shadows, panels rely on hairlines and inner glow instead.
- − The Local Group costs about 70 draw calls and 20k points at the medium tier.

## ADR-020: Realism pass: real orientations and spin ratios, honest close-ups

**Context.** An audit compared the scenes and the data with current references. It found several errors:
- invented spin axes;
- a spin cap that flattened the real speed ratios between planets;
- storms that turned the wrong way;
- a mis-tilted Milky Way band;
- some wrong facts.

It also found two close-up problems:
- sky labels drawn over planets;
- other worlds' orbits cutting across the focused planet.

**Decision.**
- **Axes and spin.**
  - Pole directions (`tilt` from ecliptic north plus `poleLon`) come from the IAU.
  - Planets use the invariable-plane north, so Venus and Uranus spin with a negative `rotationH`. Dwarf planets use the right-hand pole.
  - Moons share their planet's pole.
  - Tidally locked bodies face their partner exactly, so Pluto always faces Charon.
- **Spin speed.** One scale factor, capped by Earth's spin, keeps the true speed ratios between bodies.
- **Storms.** Anticyclones such as Jupiter's Great Red Spot and Neptune's dark spots now turn the right way, and Venus's clouds drift westward.
- **Milky Way band.** Its pole uses the real galactic pole (ecliptic longitude 180°, latitude 29.8°).
- **Globe day/night.** With the day/night switch on, the line between day and night follows the real Sun.
- **Labels.** Constellation and star labels hide behind the screen-space discs of the Sun and planets.
- **Close-up orbits.** Within about 10–18 radii, every orbit around the Sun fades out (including the body's own, which passes through its centre). Only the focused world's moon orbits stay.
- **Deep space.**
  - Andromeda's spin, its satellite plane (seen edge-on) and its Giant Stream now match real directions.
  - The neighbouring galaxy groups are placed correctly.
  - The galactic bar and the Great Attractor get their own kinds.

**Consequences.**
- \+ Planet tilts, spin directions, storms and the sky match what astronomers see.
- − Distances and sizes are still compressed for play, so close planetary encounters look busier than in reality.

## ADR-021: Sky theatre for astronomical events, 3D nebula models

**Context.** Two requests came in:
- show eclipses and other common sky events;
- make the deep-space objects, nebulae above all, look like the real ones.

At the time, nebulae were flat glow sprites, and nothing simulated the sky seen from the ground.

**Decision.**
- **Astronomy engine (`src/shared/lib/astro/`, pure TS, unit-tested).**
  - `ephem.ts`: Meeus ephemerides: the Sun from truncated VSOP87 (about 1″), the Moon from the full ch. 47 tables (about 10″) and the planets from JPL Keplerian elements (about 1′), plus sidereal time and horizon coordinates.
  - `eclipses.ts`:
    - solar eclipses from Besselian fundamental-plane geometry on a flattened Earth (type, greatest point, path samples, local contacts);
    - lunar eclipses with Danjon's shadow enlargement, as in NASA's canon.
  - `events.ts` finds:
    - meteor-shower peaks;
    - conjunctions, oppositions, greatest elongations and Mercury/Venus transits;
    - new, full and super moons;
    - equinoxes and solstices.
  - Every event has a stable id (`solar-eclipse-2026-08-12`), so the URL `#sky/<id>` deep-links to it.
- **Sky theatre (`src/client/sky/`, lazy chunk).** A full-screen dialog with:
  - a **ground view**: horizon, sky brightness, stars by limiting magnitude, eclipse geometry, telescope and naked-eye fields of view;
  - a **space view**: Sun–Earth–Moon shadow cones or planet geometry;
  - a **Moon view**.
  - A timeline with marks (contacts, closest approach, mid-transit) and adjustable playback speed.
  - A "best site" picker, which scans 36 h of altitudes for the event's bodies against twilight.
  - A year calendar with filters.
  - A hand-off into the Solar System view at the same instant.
  - Rendering rules:
    - The ground is `transparent` so it draws after (and hides) the stars, because three.js draws opaque objects before transparent ones.
    - A telescope adds 2.5·log10(magnification) magnitudes for point sources, so planets show in twilight.
- **Nebula models (`src/client/solar/nebulae.ts`, `nebulae/`).** 14 signature objects are built from layered particles (emission gas, dust that writes depth, and stars). Each follows its published 3D morphology:
  - the Eagle's pillars;
  - the Crab's filament cage around a pulsar-wind core;
  - the Ring's prolate shell seen down its axis;
  - the Horsehead's dust silhouette against IC 434;
  - the Helix, Cat's Eye, Cygnus Loop, Cassiopeia A, Orion, Carina, Lagoon, Rosette and North America nebulae.

  Selecting one in the Milky Way flies the camera in, fades in the model, and dims the galaxy star field and glow sprite behind it. The model is disposed when you leave.
  - **Card thumbnails** reuse the same model, drawn offscreen.
  - **Quality** follows the tier: `high`, `medium` or `low`.
- **Deep-space data fixes.**
  - The Hubble Ultra Deep Field distance is now comoving (about 30 billion ly).
  - The LMC is described as a Magellanic spiral.
  - A dark gap now separates the cosmic web from the CMB shell.

**Consequences.**
- \+ Every common phenomenon can be watched from a real site and date, and explained from space.
- \+ The famous nebulae look recognisable from Earth's viewpoint, and they look plausible when you orbit them.
- − The models are procedural approximations, not reconstructions. Some small features are exaggerated, and close-ups are shown larger than life. Real photographs remain in the Wikipedia reader.
- − Accuracy is arcseconds for the Sun and Moon and about an arcminute for the planets. Treat contact times as approximate (within about a minute); it is not meant for planning observations.


## ADR-022: One deep-space look, and 3D models for every galaxy

**Context.** The four levels beyond the Solar System had drifted apart in style:
- The Local Group has a dark navy and violet atmosphere with cyan radar rings, fine twinkling points and faint far galaxies.
- The Milky Way was an overexposed white disc.
- Laniakea was a field of coarse, grainy blobs.
- The universe sat inside a saturated blue and orange CMB.

Picking a galaxy, cluster or quasar outside the Milky Way only flew the camera to blurry stand-ins with no recognisable shape, and some dwarfs showed nothing at all.

**Decision.**
- **One look for every level.** The Local Group's style is now shared through these helpers:
  - `gas()`: soft blue and violet gas clouds;
  - `distanceRings(L, ly[], spokes, textH)`: radar rings, ticks and distance tags (10–50 thousand ly, 1–5 million, 100–400 million, 10–40 billion);
  - a dark-matter halo glow;
  - `backdrop()`: faint far galaxies;
  - crisp, capped point sizes (`maxPx`).
- **Per-level adjustments.**
  - The Milky Way's disc and star field are toned down.
  - Laniakea's cosmic web is drawn as fine twinkling points.
  - The CMB, seen from inside, is dimmed and washed toward the same blue-violet.
- **3D models for galaxies, clusters and quasars.** `galaxies.ts` and `galaxies/` add 49 signature models on the nebula model framework:
  - 25 Local Group galaxies;
  - 16 nearby galaxies, groups and clusters;
  - 8 far objects.
  - Seeded generic models by kind and shape cover the rest.

  Each model has real shape and orientation: +Z faces Earth, +Y points to celestial north and −X to east.
- **One model mechanism on every level.** `deep.ts` now shows a model on every level, not just the Milky Way:
  - The display radius comes from `galaxyExtentLy`. On the Local Group level it matches the drawn size, which is exaggerated `GROUP_EX`×, so the stand-in hands over smoothly.
  - The camera flies to 3.33 radii on Earth's side.
  - The object's own stand-in fades out. Its neighbours' stand-ins, the level's points and the CMB dim behind it.
  - The camera rolls so celestial north is up, matching the familiar photographs. This also applies to the nebulae.
- **Card pictures** for these objects are painted from the same models.

**Consequences.**
- \+ Every level reads as one instrument, and every galaxy, cluster or quasar you tap has a recognisable 3D shape seen the right way round.
- − The models are procedural approximations:
  - galaxies inside groups and clusters are drawn larger than life;
  - some arm winding directions and cluster-member positions are guesses;
  - real photographs remain in the Wikipedia reader.
- − The largest models build in about 100–190 ms (measured under software rendering), once per selection.

## ADR-023: Static pages in the Astrolabe style; Credits folded into About

**Context.** The About, Encyclopedia and Privacy pages still used the old rounded zinc style with coloured emoji, so they looked like a different product from the HUD. Credits was a separate in-app modal. In the menu footer, "Credits" was a `<button class="link">`, and the global `.link` padding pushed it below the two `<a>` links.

**Decision.**
- **One style.** `scripts/build-pages.ts` now uses the HUD vocabulary:
  - cut-corner slabs with an amber tab and ruler ticks;
  - a blueprint grid over a CSS starfield;
  - Chakra Petch for display text and Geist Mono for data;
  - numbered section heads;
  - the monochrome line icons from `ui/icons.ts` instead of emoji.

  Item pages open on a lock-on reticle with coordinates and a "see on the 3D globe" button.
- **Which pages stay.**
  - The Encyclopedia stays. It is how search engines index the 518 entries, it gives devices without WebGL something to read, and every entry deep-links into the globe.
  - Privacy stays. The app has email sign-in, cookies and a public guestbook, and it is meant for children.
  - Credits moves into About as a numbered section with each source's licence. The modal and its i18n keys are removed.
- **Menu footer.** About, Encyclopedia and Privacy are now three equal `<a>` tiles in a three-column grid, so they share one baseline.

**Consequences.**
- \+ The site reads as one product, and there is one fewer page to maintain.
- − The static pages copy the HUD tokens into their own inline CSS, so the two must be kept in step by hand.

## ADR-024: Earth model realism pass

**Context.** An audit of all 24 contact sheets turned up models that were wrong or hard to tell apart:
- The airliners, trains and ships shared generic builders, so a 747, a 787 and an A380 looked almost the same.
- Some dinosaurs used outdated reconstructions, such as theropods with palm-down hands, a quadrupedal Muttaburrasaurus drawn as a theropod, and a scaly Velociraptor.
- A few animals, camels and foods had the wrong proportions.

**Decision.**
- **Vehicles.** Catalogue recipes now carry a `variant` flag, and `vehicles.ts` uses it to pick a dedicated builder:
  - 747-400 with the upper-deck hump;
  - 787 with serrated engines and raked wingtips;
  - A380 as a full double-decker;
  - QM2 with a black hull, red boot-topping and a single funnel;
  - a ro-ro ferry with a bow visor and a stern ramp;
  - N700 with a duck-bill nose;
  - KTX with power cars at both ends and shared bogies.

  The 50 Let Pobedy icebreaker now has its real white superstructure.
- **Dinosaurs.**
  - Four models rebuilt from current science: a surface-swimming Plesiosaurus; a Quetzalcoatlus walking on all fours on folded wings; a turkey-sized, feathered Velociraptor; and an iguanodontian Muttaburrasaurus.
  - Theropod hands now face palms-inward.
  - Spinosaurus follows the 2020 reconstruction with a paddle tail.
  - Smaller fixes to Carnotaurus, Cryolophosaurus, Mosasaurus, Iguanodon, Mamenchisaurus, Therizinosaurus and Massospondylus.
- **Others.**
  - Moose: palmate antlers.
  - Wildebeest: slate body, Roman-nosed head, hooked horns, and beard.
  - Silk Road camels: two distinct humps and a realistic load.
  - Lamington: sponge cube in chocolate and coconut.

**Consequences.**
- \+ Each model now matches what the real thing looks like, and similar vehicles can be told apart at a glance.
- − Some dinosaur builds exceed the 150 ms target (Triceratops about 350 ms, T. rex about 270 ms on this machine), once per selection.

## ADR-025: The Sun's true colours

*Colour choice superseded by ADR-026; limb darkening, sunspots and prominence colours still apply.*

**Context.** The Solar System's Sun was painted pale yellow, with a cream-orange corona, orange-red prominences and red-brown sunspots. A large orange glow also washed over the stars. That is the Sun as Earth's atmosphere colours it, not as it looks from space.

**Decision.**
- **Photosphere.** The 5772 K photosphere is a slightly warm white, `(262, 250, 238)`.
- **Limb darkening.** It now varies by colour channel, `I(μ) = 1 − u(1−μ) − v(1−μ²)`, using Allen's coefficients at about 650, 550 and 450 nm. The edge falls to roughly 40%, 35% and 25% of the centre and so turns warm, while the centre stays white.
- **Granulation.** The contrast is reduced. Real granules are far below the disc's resolution.
- **Sunspots.** They are darker, not coloured: the penumbra is about 70% and the umbra about 20% of the photosphere's brightness.
- **Corona.** Pearl white, as seen in a total eclipse.
- **Prominences.** Hydrogen-alpha pink-red.
- **Coronal mass ejections.** White, the way they appear in coronagraphs, with a young core that glows pinkish.
- **Glare.** It is neutral, and the wide halo is dimmed.

These now match the sky theatre's Sun.

**Consequences.**
- \+ The colours are physically right, and the space view and the eclipse view agree.
- − The Sun no longer looks like the "yellow Sun" children draw. The info text can explain why.

## ADR-026: A golden Sun with realistic activity

**Context.** The true-white Sun of ADR-025 was correct, but users found it unfamiliar. They asked for the golden Sun everyone recognises, and for eruptions and rays that look more real.

**Decision.**
- **Colour.** The photosphere is golden again, `(262, 218, 140)`. The chromatic limb darkening from ADR-025 stays, so the limb deepens to orange. The glow is golden but restrained, so stars stay visible.
- **Granulation.** Animated Worley cells in the Sun shader. They fade out by `fwidth` when they are smaller than a pixel. They are off on the low quality tier.
- **Eruption timeline.** It runs about every 16–32 s:
  1. A limb prominence rises and fades out.
  2. A two-ribbon flare brightens the surface beneath it.
  3. A three-part coronal mass ejection (bright front, dark cavity, bright core) expands and accelerates outward in the corona shader, with a particle cone. *(Reworked in ADR-028.)*
  4. The prominence then regrows.
- **Corona.** Helmet streamers are concentrated towards the solar equator, using the Sun's pole projected to the screen. It also has polar plumes and fine radial filaments, and falls off as about r^-2.6.

**Consequences.**
- \+ The Sun matches popular expectation, and the activity follows the real physical sequence.
- − The disc colour is a convention, not the true colour. The eclipse view in the sky theatre keeps the physically white Sun.

## ADR-027: One sky and one Chinese typeface across the views

**Context.**
- The Earth view had its own background: a slate `#020617` colour and grey dots in a shell at distance 14–26, so the stars showed parallax. It had no Milky Way and no real stars.
- The Solar System used a different random field. Its constellation stars were small, dim dots, hard to tell from the background.
- Fonts were inconsistent:
  - `--font-mono` had no Chinese font, so mono text fell back to the OS default (SimSun serif on Windows).
  - `--cjk` mixed Japanese and Korean faces.
  - Canvas labels hard-coded their own stacks.

**Decision.**
- **Shared sky.** `client/lib/starfield.ts` builds one sky for both views:
  - the real catalogue stars of the constellation figures, plus a seeded field of fainter stars concentrated along the galactic plane;
  - spectral tints, sized and dimmed by magnitude;
  - a skybox that follows the camera, so the stars are at infinity and show no parallax;
  - drawn additively in the opaque pass, first, so bodies always cover it.
  The Solar System uses it in the ecliptic frame. The Earth view uses it in the Earth-fixed frame, turned by the real Greenwich sidereal time, so the stars over a place are the ones really overhead. Both views clear to `SPACE_BG` (`#020306`).
- **Constellation stars.** In the Solar System, constellation stars are drawn bigger by magnitude (8–24 px), with a crisp core and a coloured glow, and the figure lines are slightly brighter. The figures stay fixed when zooming: they are at effectively infinite distance, so that is physically correct. They do not twinkle, because there is no atmosphere in space.
- **Fonts.**
  - `--cjk` lists only Simplified-Chinese faces: PingFang SC, Hiragino Sans GB, Noto Sans CJK SC / Noto Sans SC, Source Han Sans SC, Microsoft YaHei.
  - It is part of every stack (`--font`, `--font-mono`, `--font-hud`, `--font-data`, and the static pages).
  - Canvas text reads the stack from CSS through `cssFont('--font-hud')`.

**Consequences.**
- \+ Going from Earth to the Solar System keeps the same sky and the same colours. Chinese text uses one face everywhere.
- − Background stars are no longer re-randomised per view. The Earth sky turns slowly with real time.

## ADR-028: Physically modelled solar eruptions

**Context.** The ADR-026 eruption read as graphics rather than the Sun:
- Prominences were bright wires that crossed the disc.
- The CME was a sparkly particle cone.
- The flare ribbons were sub-pixel and could not be seen.

**Decision.** Each layer follows what H-alpha, white-light and EUV observations show.
- **Prominences are flux ropes.**
  - Each rope is a few twisted threads, 5 per loop (3 on the low tier).
  - Blending is premultiplied "over" with colour/alpha equal to H-alpha red. Stacked threads therefore converge on red instead of saturating to white.
  - Beyond the limb they glow; in front of the photosphere they only absorb, showing as dark filaments.
  - Plasma blobs drain down both legs.
- **The eruption runs away.**
  - The rope rises slowly. At the flare it grows exponentially, balloons sideways and kinks: the apex rotates and the rope untwists.
  - The feet stay rooted, and the rope fades into the CME core. A new filament re-forms later.
- **Flare on the photosphere.** Two white-light kernels flash in the impulsive phase. Then two patchy, bowed ribbons separate either side of the neutral line over a brightened plage, and a faint EUV wave sweeps across the disc. The ribbons are drawn larger than true scale so they show at normal zoom.
- **Post-flare arcade.**
  - Loops stand on the ribbons, shared through `FLARE_GLSL`.
  - They start sheared and low, then grow taller and more upright as the ribbons separate.
  - Coronal rain falls down their legs, and they are drawn in EUV gold using the same "over" blending.
- **Lightbulb CME.**
  - A three-part CME in the corona shader: a bright front shaped by a capsule SDF with filamentary structure, a dark cavity, a twisted red core that heats towards white, and a faint shock sheath ahead.
  - It accelerates, is foreshortened by viewing angle, and dims as about r^-1.1.
  - The particle cone is removed.
- **Site and timing.** The eruption site is the active region nearest the limb, slightly towards the viewer, so the CME is seen side-on and the flare is still visible. Eruptions recur every 18–34 s, starting 4 s after the scene opens. The timeline is `{flare: 3, cme: 2.6, end: 24}` s.

**Consequences.**
- \+ The sequence matches real observations, and the colours no longer blow out to white.
- \+ Removing the particle cone saves draw calls and overdraw.
- − The ribbons and arcade are exaggerated in size, and the timescales are compressed from minutes and hours to seconds, so that they are readable in a toy.

## ADR-029: Global vs local chrome, UI-aware labels, and living deep space

**Context.** Each level had grown its own controls:
- the Solar System had its own zoom, overview and sky buttons, and a back button and crumbs floating over the scene;
- search and the Earth-only tools stayed on screen in space, where they did nothing useful;
- scene labels (constellations, planets, deep objects) were drawn under the toolbar, info panel and dock.

Above the Solar System the scenes were also static apart from rigid disc spin.

**Decision.**
- **One chrome, two scopes.**
  - Global, the same at every level: the brand, the right toolbar (search, collection, sky, menu) and the bottom-right stack (fullscreen, overview in space, zoom +/−).
  - Local, owned by the level: the top-centre slot (`.top-center`) holds the Earth omnibar, or the space "back to Earth" button with its crumbs.
  - Tools carry `earth-only` / `space-only` classes, and `body.solar` toggles them.
  - Zoom and overview reach the active level through `ShellHooks`.
  - Picking an Earth item from space flies back to Earth first.
- **No overlap.**
  - The space dock publishes its height as `--space-dock` (ResizeObserver). Hints, the info panel and the phone corner buttons sit above it.
  - `ui/occluders.ts` caches the chrome rectangles (refreshed at most every 250 ms, with a version for caches). Every scene-label placer rejects positions under them. Deep labels flip to the left of their dot before giving up.
  - Labels are created hidden and only shown once placed.
- **Deep-space motion**, all of it real phenomena with real relative rates, sped up like everything else out there.
  - **Transients** (`solar/transients.ts`): short flashes, each with its light-curve shape (rise, plateau, e-fold decay, optional tail), its colour evolution and a name tag, spawned as a Poisson process.
    - Milky Way: Type II supernovae among young blue stars, Type Ia anywhere, novae in the bulge (the most frequent), and Sgr A* flares.
    - Local Group: supernovae in the big spirals, and Andromeda's frequent bulge novae.
    - Laniakea: supernovae, tidal-disruption events and kilonovae at web nodes.
    - Universe: gamma-ray bursts only, the one transient visible across it.
    - Only the active level runs them, and they are off with `lowfx` (reduced motion / photosensitivity).
  - **Orbits**: the `ORBIT` point-shader define, with `aOrbit` = axis + ω (Rodrigues rotation).
    - Milky Way halo stars and globular clusters leave the rigidly turning disc frame. Each follows its own tilted orbit with ω ∝ 1/r (flat rotation curve), and they have no net sense of rotation.
    - Local Group stellar haloes and dwarf satellites orbit their hosts. Each dwarf moves as one knot, and Andromeda's thin-plane satellites all go round the same way, as observed.
  - **Quasar variability**: the universe-level quasars carry a glow whose brightness wanders by roughly ±20%.

**Consequences.**
- \+ The chrome reads the same on every level, and nothing sits on top of anything else.
- \+ The deep levels are alive with things that really happen there.
- − The orbit and flash rates are compressed by many orders of magnitude.
- − Galaxy close-up models do not spin: they are oriented to match their famous photographs.

## ADR-030: Sky theatre "How it works" model view

**Context.** The Sky theatre showed each event as it looks: the sky from the ground, or a true-scale view from space.
- At true scale the Moon is a speck 60 Earth radii away, so the lunar "space" view was dominated by the near wall of the umbra cone.
- Planet, transit and meteor events had no way to show *why* they happen.

**Decision.**
- **A third view kind, `model`**, is now the default for every act (`sky/model.ts`, `ModelScene`).
  - It is a labelled orrery in the ecliptic frame of date, computed from the same ephemerides.
  - **Local stage** (eclipses, phases): Earth and Moon, with the Earth–Moon distance shrunk by 4×.
    - The shadow cones' half-angle is steepened by the same factor, so every shadow is its true size where it lands.
    - Earth and Moon are shaded from the real geometry, so the Moon's shadow on Earth and Earth's shadow on the Moon are real-sized.
    - Also shown: the tilted lunar orbit (brighter above the ecliptic), its nodes, and the far Sun with a stream of sunlight motes.
    - Phases add ghost moons, lit half toward the Sun; supermoons add perigee and apogee.
  - **Heliocentric stage** (seasons, oppositions, conjunctions, elongations, transits, meteor showers): positions are to scale and bodies are enlarged.
    - Lines of sight run from Earth, with an elongation arc.
    - Seasons show the four equinox and solstice Earths, their fixed axis, and the subsolar ray.
    - A meteor stream's orbit is back-computed from its radiant and speed (Geminids give a = 1.36 AU, e = 0.88, i = 22°, matching Phaethon). Particles are propagated by Kepler's equation, so Earth visibly ploughs through the trail.
- **Per-view clocks.** An act can give the model its own `Timing`, for example ±2 days around an eclipse instead of ±1.5 h, or a year for seasons with the four equinox and solstice marks. The theatre swaps the timeline, marks and pace when the view changes.
- **Labels.**
  - They sit below their body by its projected radius, so they read the same from any angle.
  - The off-stage Sun is pinned to the screen edge with an arrow pointing toward it.
  - Labels hide under the theatre's panels.
- **Camera.** Each kind has a preset camera with an idle drift, framed higher on desktop to clear the caption, and backed off on portrait screens.

**Consequences.**
- \+ Every event first shows the geometry behind it, then "From the ground" shows the result.
- \+ The confusing true-scale lunar space view is gone (the solar one stays).
- − The model is schematic in size; the caption notes the scale ("sizes enlarged …").

## ADR-031: Per-level generative music and Earth live radio

**Context.**
- The old background music was a single looped melody, the same in every level.
- The user asked for a different track for each level, and for a live-radio feature on Earth like AuraFM's.
- AuraFM has no licence, so none of its code is reused. Only the idea is reimplemented.

**Decision.**
- **Generative music** (`lib/music.ts`). Pure WebAudio, with no audio files to download.
  - Each level (earth, sky, solar, galaxy, group, laniakea, universe) has its own mood: key, scale, chord loop, pace, pad/bass/lead timbre, bells, and reverb/echo sends.
  - A small look-ahead scheduler plays the mood on its own bus. Changing level crossfades the buses.
  - The setting is on by default (`bgm`). Per-mood trims keep every level near −21 dBFS RMS. The context suspends while the tab is hidden and unlocks on the first gesture.
  - `main.ts` calls `tune()` on every level change: zoom scale, Solar enter/leave, Sky open/close.
- **Earth radio** (`lib/radio.ts`, `ui/radio.ts`, `globe/stations.ts`).
  - **Data.** `scripts/gen-radio.ts` turns a Radio-Browser dump (public domain) into `public/data/radio/stations.json`.
    - About 3000 HTTPS stations in 141 countries, at most 90 per country.
    - A name/tag blocklist removes adult and gambling stations, because the app is for children.
    - Stations without coordinates are scattered, with a seeded scatter, around their country's main cities and flagged as approximate.
  - **Globe.** All stations are one additive Points layer with back-face fade and CPU screen-space picking. A second two-slot layer draws the playing station (breathing with the audio level) and the hovered one. The Earth shader's existing `uStationPos`/`uAudio*` ripples follow the signal.
  - **Playback.**
    - The engine first tries CORS through a `MediaElementSource` analyser, so the EQ and globe react to the real signal.
    - If that fails it falls back to a plain `<audio>` element with a synthetic pulse.
    - HLS uses native playback where available, otherwise lazily imported `hls.js`.
    - Tuning static plays while connecting.
    - A failed station auto-skips to the nearest one, at most twice.
  - **UI.**
    - A toolbar button (Earth only) opens a bottom dock: EQ, name, LIVE/country/tags/kbps, favourite, play/stop, next nearby, shuffle, volume, close.
    - The dock hides in time-travel, game, ride, photo and Solar modes.
    - Leaving Earth suspends playback; coming back resumes it.
    - Background music ducks while the radio is connecting or playing.
  - **Privacy.** The browser connects directly to the station's stream server, which is noted on the privacy page. Favourites, volume and the last station stay in localStorage.
- **Phone top bar.** The ninth tool did not fit. At ≤440 px the brand stays only for screen readers and the random-hop button is hidden, since it is still in search.

**Consequences.**
- \+ Every level has its own sound with no download cost. The radio is lazy-loaded: code, the station list (~150 KB gzipped) and `hls.js` load only on first use.
- − Some streams are not CORS-enabled and play without a real analyser. Stream availability depends on third parties.
- − The station list is a snapshot. Re-run `node scripts/gen-radio.ts` to refresh it.

## ADR-032: HUD tooltip and icon-only bottom bars

**Context.**
- The bottom bars showed an icon plus a name for every control (11 planets, 12 deep-sky objects, "Now", "Constellations"). On desktop the Solar dock was about 840 px wide; on phones it scrolled.
- The browser's own `title` tooltip ignores the HUD look and cannot be styled.

**Decision.**
- **`ui/tooltip.ts`** (`initTooltips()`, called at boot) replaces the native tooltip app-wide and copies its behaviour.
  - A MutationObserver moves every `title` to `data-tip`, now and later, so the native tooltip never shows. Icon-only elements also get the text as `aria-label`, and it is kept in sync when the title changes (for example on a language switch).
  - Shows 500 ms after the mouse rests, just under the pointer, and stays put. Moving to another titled element within 400 ms shows its tooltip at once.
  - Hides when the pointer leaves, and on pointer-down, key, wheel, or a scroll of the hovered element; it then stays hidden until the pointer leaves that element.
  - Mouse only: touch and pen never show it. `title=""` switches off an ancestor's tooltip.
- **Bottom bars are icon-only, with the name in `title`:**
  - Solar dock: tinted spheres sized on a rough ladder (not to scale), Saturn and Uranus with rings.
  - Deep dock: the object's emoji.
  - Solar time bar: "back to today" and constellation toggles.
  - Sky theatre: zoom (telescope/naked eye) and calendar buttons.
  - Earth time machine: "New here" chips.
  - On phones the dock chips share the width, so all 11 worlds or 12 objects fit without scrolling.

**Consequences.**
- \+ Desktop Solar dock ~460 px instead of ~840 px; the time-machine panel loses a line.
- − Names are not visible on touch devices until the item is tapped; the info card that opens then shows them.

## ADR-033: One Explore hub for every activity

**Context.**
- Activities had grown up in five places: eight top-bar buttons, the help bubble (tutorial, tours), menu tiles (some repeating top-bar buttons on phones), and modals that held other entries (collection → passport and album; games → three games).
- The same thing could be reached two or three ways, and some (passport, album) only from inside another window. The top bar needed a phone-only overflow rule.

**Decision.**
- The top bar keeps four tools on every level: search, photo, **Explore** (`btn-hub`) and **Settings** (`btn-menu`).
- `ui/hub.ts` renders the Explore drawer with four shelves (Learn, Observe, Play, Me). Each activity is one row: icon, name, one line, progress where there is one (lessons and tours done, stamps, animals, today's daily).
  - Row ids are stable `menu-*` test ids.
  - The chosen shelf is remembered (`hubTab`).
  - Globe-only rows (time machine, radio, games) step aside in space for a "Back to Earth" button.
- Settings is only settings: look, layers, sound, classroom, language, backup, reset, hide controls, About and Privacy.
- Every activity has exactly one entry point:
  - the collection modal now holds only the dexes and stickers;
  - the games picker modal is gone, and so are the `#games`, `#daily`, `#placeit`, `#quiz`, `#collection`, `#account` and `#guestbook` deep links (activities open only from the hub; `#signed-in` stays for the login redirect);
  - the help bubble keeps only the tutorial.

**Consequences.**
- \+ The top bar is the same on desktop and phones (no overflow rule) and leaves more room for the scene.
- \+ New activities are added in one place, on the shelf where they belong.
- − The time machine, radio and sky theatre are one tap further away (hub → row).

## ADR-034: One HUD dropdown instead of the native select

**Status.** Accepted.

**Context.** The language, tonight's city, compare pickers, sticker sort and the sky theatre's site each used a native `<select>`. Its closed state could be styled a little, but its open list is drawn by the operating system: white system menus over the dark HUD, different on every platform, and the cut-corner slab could not be applied.

**Decision.**
- `ui/select.ts` (`Select`) is the only dropdown. No native `<select>` is left in the app.
- It follows the WAI-ARIA select-only combobox pattern: the trigger is a `button[role=combobox]` that keeps focus; options are announced with `aria-activedescendant`.
- Keys: arrows, Home/End, PageUp/PageDown, typeahead, Enter/Space to pick, Esc closes only the list (not the menu, modal or theatre around it), Tab closes it.
- The list opens in the top layer (`popover="manual"`), so slab `clip-path`s and scrolling panels never cut it. It stays a DOM child of the picker, so "click outside" checks of the menu, hub and modals still see it as inside. It sits below the trigger, or above when there is more room there.
- Look: slab trigger with a chevron, opaque slab list, amber bar and tick on the chosen option; 44 px rows on touch screens.
- Tests pick with `pickOption(page, testid, value)` and read the value from the trigger's `data-value`.

**Consequences.**
- \+ Every choice list looks and behaves the same on every platform and in both languages.
- − Mobile users get the HUD list instead of the platform's wheel or sheet picker.

## ADR-035: A shader-projected flat world map beside the globe

**Status.** Accepted.

**Context.** Kids learn from flat maps at school, and the projections lesson talks about them, but the app only had the globe. Rendering a second copy of the painted map, the borders and the labels in a 2D canvas would duplicate the painter and blur at high zoom.

**Decision.**
- `map/flatmap.ts` is a lazy chunk with its own WebGL canvas over the globe. The globe is paused while it is open.
- The background is one full-screen fragment shader: each pixel is inverse-projected (`map/proj.ts`, mirrored in GLSL) and samples the globe's border-free painted land, relief and night lights. No new texture is painted.
- Borders and the graticule are instanced quads whose ends are projected in the vertex shader, so lines stay sharp and equally thick at every zoom and in every projection. Segments crossing the map edge are clipped in the fragment shader.
- All three projections are linear in longitude at a given latitude, so panning sideways is just turning the central meridian (no re-projection of data on the CPU).
- Labels and pins are DOM elements laid out by the same greedy declutter as the globe; pins avoid country names.

**Consequences.**
- \+ The map always matches the globe (same land colours, borders, items and info card) and costs no extra painting.
- \+ Sharp at ×14 with no tiles.
- − Projections must be written twice (TS and GLSL); `tests/unit/proj.test.ts` checks the TS side round-trips.

## ADR-036: A private SSBS review class behind a device flag

**Status.** Accepted.

**Context.** One class needs a focused review of a Grade 6 unit (West and Central Africa: terms, land, empires, the slave trade, colonial rule, independence and today, and the 25 countries and capitals). It should ship in the normal build without changing what other users see.

**Decision.**
- `lib/ssbs.ts` reads `?ssbs=1` / `?ssbs=0` once at load and remembers it on the device (`pp.ssbs`). Default off.
- SSBS is a third lesson Subject (`'ssbs'`, ids `ssbs-*`) with its own catalog: Study (6), Map (3) and a Practice test. `lessonById`, the hub entry and the `#ssbs` route all check the flag, so with it off the lessons cannot be opened even by link.
- Lessons may set `gen(rand)` to draw fresh questions on every start and on "again". The practice test is 30 points: 10 matching pairs, 10 multiple choice, 10 map (5 "tap the country", 5 "which country is gold"), scored per section with a "Review these" list.
- Map taps with `a2` count as right when the tap lands anywhere in that country (50 m shapes), not just near its centre; a wrong tap names the country tapped.

**Consequences.**
- \+ No separate build or deployment; one URL turns it on for a class.
- − The content is visible in the shipped JS to anyone who looks; the flag hides it, it does not protect it.
