# Solar System Scope: feature comparison

[Solar System Scope](https://www.solarsystemscope.com/) (SSS) is a popular 3D space model for the browser. This note compares its features with Terrastra's Solar System and deep-space levels, records what we built from the comparison, and lists ideas for later.

**Method.** We looked only at SSS's public pages, feature list and how it behaves in use. We did not copy, decompile or reuse any of its code, textures, data files or text. Everything below that Terrastra implements is our own work, built on our existing data (`src/shared/data/solar.ts`, Keplerian elements in `src/shared/lib/orbits.ts`) and published science figures.

## Feature parity

| SSS feature | Terrastra | Notes |
|---|---|---|
| Planets at real positions for any date | ✅ already had | Keplerian elements (JPL), moons on their own orbits; `#solar` time bar |
| Time speed / pause / jump to now | ✅ already had | `SPEEDS` from real time up to a year per second |
| Textured planets and moons | ✅ already had | Procedural painted surfaces with named features |
| Planet info, encyclopedia | ✅ already had | Body cards, features, Wikipedia reader |
| Search | ✅ already had | Global search (`space-index.ts`) |
| Constellations | ✅ all 88 | Line overlay with a card per constellation; lines and stars from d3-celestial (BSD-3) and Hipparcos |
| Moons and dwarf planets | ✅ 28 moons, 5 dwarf planets | Added Phobos, Deimos, Amalthea, seven more of Saturn's moons (including Hyperion and retrograde Phoebe), Uranus's five big moons, Proteus, Nereid (eccentric orbit), Nix and Hydra, and Haumea (stretched, with its ring), Makemake and Eris |
| Milky Way and beyond | ✅ already had (more than SSS) | Galaxy → Local Group → Laniakea → universe ladder, 3D nebulae and galaxies |
| Space missions | ✅ already had | Mission sites with 3D models |
| Eclipses and sky events | ✅ already had (more than SSS) | Sky theatre |
| Interior view (cut a planet open) | ❌ tried and removed | A cutaway was built in two versions but did not look convincing enough, so it was taken out |
| **Distance between bodies** | 🆕 **added** | See below |
| Real-scale toggle | ⏳ roadmap | We compress distances (`12·√AU`) and sizes so kids can see everything at once |
| Full Messier catalogue | 🆕 **added** | All 110, filterable, each on its own scale (see below) |
| Nearby stars with names | 🆕 **added** | A new "Nearby Stars" level between the Solar System and the Milky Way |
| Milky Way band in the sky | 🆕 **added** | Procedural glow, no image assets |
| Night sky from your location | ⏳ roadmap | `tonight.ts` already computes alt/az for a city |
| Orbit / label display options | 🆕 **added** | Time-bar toggles for orbit lines and names, remembered between visits (see below). An ecliptic grid is still on the roadmap |
| Size comparison | ✅ partly | The Compare bench sets two worlds side by side at true scale; a full line-up is on the roadmap |

## What we added

### Distance meter

The ruler in the top-right toolbar (shown only in space, in the slot the Earth view uses for the flat map) opens a meter sheet under it, between any two bodies. It shows the true centre-to-centre distance, the distance in AU, how long light takes, and how long a car at 100 km/h would take. It updates live as time runs. A dashed amber line joins the two worlds on the map, labelled where it's on screen. The note under the meter explains that the line is drawn on the shrunken map while the numbers are real.

- Maths: `helioKm` / `distanceKm` in `src/shared/lib/orbits.ts`.
- UI: `SolarUI` meter panel (`src/client/solar/ui.ts`), `SolarView.setMeasure`.

It is in English and Chinese, and is covered by `tests/unit/solar.test.ts` and the e2e test "solar: distance meter".

### Round 2: galaxy features

**Milky Way glow** (`src/client/lib/milkyway.ts`). A shared GLSL function, written in galactic coordinates, draws:
- the bulge toward Sagittarius and a disc that fades toward the anticentre;
- the bright star clouds;
- the Great Rift and the Coalsack;
- both Magellanic Clouds.

It lines up exactly with the catalogue stars and the galaxy model, and the space backdrop, the ground sky and the Nearby Stars level all use it. It needs no image download.

**Nearby Stars level** (`#nearbystars`, `src/shared/data/nearby-stars.ts`). The ladder now has a step between the Solar System and the Milky Way:
- 34 star systems within about 65 ly, from Proxima Centauri to Aldebaran, at real positions (galactic l/b from J2000 RA/Dec) and real distances. Each star is coloured by its spectral type.
- A stalk from each star to the galactic plane shows how far above or below it is.
- Distance rings every 10 ly, an arrow toward the galactic centre, and the Oort Cloud around the Sun.
- Thousands of faint field stars, with the Milky Way glow behind them.

**Messier explorer** (`src/shared/data/messier.ts`). The telescope button at the end of the bottom dock opens a side sheet listing all 110 objects, with filters for galaxies, nebulae, star clusters and globular clusters.
- 16 objects that already had cards are tagged with their number. The other 94 come from a compact table of J2000 RA/Dec, distance and size. Their descriptions are templated by type and constellation in English and Chinese.
- Each object goes on the scale its distance puts it on: inside the Milky Way, in the Local Group, or out in Laniakea.
- Picking one flies there, and its card shows the Messier number.
- While the list is open, Messier labels take priority in the scene.

**Light-year meter.** On deep scales the ruler measures between "us" and any named object of that level, or between two objects:
- the straight-line distance in light-years;
- how long the light travels, which is also how old the light we see is;
- how long Voyager 1 (17 km/s) would take;
- how long a car would take.

A dashed line joins the two objects in the scene. The level's objects keep turning with the galaxy, and the line follows them.

These are covered by `tests/unit/cosmos.test.ts` and the e2e test "deep space: nearby stars, Messier list and light-year meter".

### Display options

Two toggles sit next to the constellation button on the time bar (out in deep space, where there is no clock, the time bar goes and the names toggle moves to the end of the dock beside the Messier button, so there is never an extra row):

- **Orbit lines** (`solar-orbits`) hides the orbits of the planets, the moons and Comet Encke.
- **Names** (`solar-names`) hides the names of worlds. Features, landing sites and deep-space objects keep their dots so they can still be tapped, and whatever is selected keeps its name. It works on every level; the distance meter's reading always shows.

Both choices are saved (`pp.solarOrbits`, `pp.solarNames`) like the constellation toggle.

## How SSS is built (public facts only)

Checked in October 2026 from what the site serves openly: the page source, the Unity loader and the build manifest. We did not decompile anything.

- **Engine:** Unity 2019.1 WebGL build (`productName: Solar System Scope`, version 3.2.3, company INOVE), WebGL 2 with a WebGL 1 fallback, single-threaded. Every bit of the solar system and Milky Way logic is C# compiled to WebAssembly (IL2CPP). There is no readable JavaScript for it to learn from.
- **Download:** about 24 MB of data and 7.7 MB of wasm load before the first frame. Terrastra lazy-loads one JS chunk and paints surfaces in a worker, so we start much faster on phones. Keep it that way.
- **Page shell:** jQuery and Bootstrap 3, plus a short `solar.js` for cookies, modals and parallax.
- **Textures:** SSS publishes its planet and sky maps (including a "Stars + Milky Way" equirectangular panorama in 2K and 8K) under **CC BY 4.0**. So they *may* be reused with attribution. That's the only part of SSS we could legally take as-is.

Decompiling the wasm to copy their logic is off the table. The code is proprietary, and the parts that matter (Keplerian orbits from NASA/JPL elements) are textbook methods we already use.

## Galaxy and sky: what we can learn

| Observation | Terrastra today | Idea |
|---|---|---|
| The sky behind the planets is a real photo panorama with the glowing Milky Way band | ✅ procedural glow (`lib/milkyway.ts`) over the real constellation stars | **Milky Way glow in the sky.** Either a procedural shader in galactic coordinates (bright bulge towards Sgr A\*, dark dust lanes, Magellanic Clouds), which keeps our no-asset style, or the CC BY 2K panorama as a high-quality option with credit in the About page |
| The Milky Way view is a flat image of the galaxy with "you are here" | A 3D model with arms, bar, nebulae and 3D close-ups (ADR-017) | Already ahead. Make sure the sky band from inside matches the model seen from outside (same tilt and brightness), so zooming out feels continuous |
| Nearby stars are shown with names | ✅ Nearby Stars level, 34 systems | **Solar neighbourhood:** done (see Round 2) |
| Messier objects in a browsable list | ✅ all 110 | **Messier explorer:** done (see Round 2) |
| — | ✅ the meter works on every deep level | **Meter in light-years:** done (see Round 2) |

## Roadmap ideas

1. **Real-scale toggle.** Switch `displayOrbit` / `displayRadius` to linear scales with a smooth tween. The camera limits and label culling would need a rethink, because at true scale every planet is smaller than a pixel from the overview.
2. **Night sky from here.** A horizon view from the user's city using `tonight.ts` `altAz`, with planets, the Moon and constellations above a ground line.
3. **Ecliptic grid.** A faint grid in the ecliptic plane as a third display option, next to the orbit-line and name toggles.
4. **Size line-up.** All the planets in a row at true relative size, building on the Compare bench and the painted textures.
