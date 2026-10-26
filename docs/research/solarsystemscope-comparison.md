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
| Constellations | ✅ already had | Line overlay with a card per constellation |
| Milky Way and beyond | ✅ already had (more than SSS) | Galaxy → Local Group → Laniakea → universe ladder, 3D nebulae and galaxies |
| Space missions | ✅ already had | Mission sites with 3D models |
| Eclipses and sky events | ✅ already had (more than SSS) | Sky theatre |
| **Interior view (cut a planet open)** | 🆕 **added** | See below |
| **Distance between bodies** | 🆕 **added** | See below |
| Real-scale toggle | ⏳ roadmap | We compress distances (`12·√AU`) and sizes so kids can see everything at once |
| Full Messier catalogue | ⏳ roadmap | We have a curated set of famous deep-sky objects |
| Night sky from your location | ⏳ roadmap | `tonight.ts` already computes alt/az for a city |
| Orbit / ecliptic grid options | ⏳ roadmap | Orbits are always drawn |
| Size comparison | ✅ partly | The Compare bench sets two worlds side by side at true scale; a full line-up is on the roadmap |

## What we added

### Interior cutaway ("See inside")

Body cards for the Sun, the eight planets, Pluto, the Moon, Io, Europa, Ganymede, Titan and Enceladus have a **See inside** button. It cuts a wedge out of the globe, facing the camera as you orbit, and shows each layer as a coloured band. The card lists the layers from the surface down with their state (solid, liquid, gas, plasma, mixed) and thickness in km. Layers scientists aren't sure about (for example Europa's ocean or Jupiter's fuzzy core) are marked "(likely)".

- Data: `src/shared/data/solar-interiors.ts` (rounded NASA and literature values; `drawRadii` makes very thin layers such as Earth's crust wide enough to see).
- Rendering: `SolarView.setInterior` in `src/client/solar/view.ts`. The body uses two three.js clipping planes in `clipIntersection` mode. Half-disc ring faces fill the cut, and overlays that can't be clipped (atmosphere, clouds, glows) are hidden while it's open. The Sun's custom shader includes three.js's clipping chunks so that it can be cut too.

### Distance meter

The ruler button on the time bar opens a meter between any two bodies. It shows the true centre-to-centre distance, the distance in AU, how long light takes, and how long a car at 100 km/h would take. It updates live as time runs. A dashed amber line joins the two worlds on the map, labelled where it's on screen. The note under the meter explains that the line is drawn on the shrunken map while the numbers are real.

- Maths: `helioKm` / `distanceKm` in `src/shared/lib/orbits.ts`.
- UI: `SolarUI` meter panel (`src/client/solar/ui.ts`), `SolarView.setMeasure`.

Both features are in English and Chinese, and are covered by `tests/unit/solar.test.ts` and the e2e test "solar: interior cutaway and distance meter".

## Roadmap ideas

1. **Real-scale toggle.** Switch `displayOrbit` / `displayRadius` to linear scales with a smooth tween. The camera limits and label culling would need a rethink, because at true scale every planet is smaller than a pixel from the overview.
2. **Messier explorer.** Add all 110 Messier objects to `cosmos.ts` as a filterable list at the galaxy level, reusing the deep-object cards and the 3D nebula and galaxy models where we have them.
3. **Night sky from here.** A horizon view from the user's city using `tonight.ts` `altAz`, with planets, the Moon and constellations above a ground line.
4. **Display options.** Toggles for orbit lines, the ecliptic grid and labels, next to the constellation toggle.
5. **Size line-up.** All the planets in a row at true relative size, building on the Compare bench and the painted textures.
