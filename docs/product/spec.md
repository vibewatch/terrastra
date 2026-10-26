# Functional & Technical Specification: Terrastra

> Historical MVP baseline. Since then the app has moved to English and Simplified Chinese only (`Lang = 'en' | 'zh'`), dropped offline mode and grown a Solar System, deep-space levels, a sky theatre and lessons. The current state and priorities live in [the 2026-10 roadmap](../planning/improvement-roadmap-2026-10.md).

Companion to the [PRD](prd.md). The constants listed here are the source of truth and are mirrored in code (file references in brackets).

## 1. Screen layout
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Terrastra [Earth ▾]                     🔍 Search 📷 Photo ▦ Explore ⚙ Settings │  top bar (tools hidden in game mode)
│ ×4.0                                                                         │  zoom readout
│                                                                ┌───────────┐ │
│                    ( 3D globe canvas + 2D label canvas )       │ info card │ │  desktop: right card
│                                                                └───────────┘ │  mobile (<720px): bottom sheet
│ [Drag spin] [Wheel zoom] [Tap a marker] [🎓 tutorial]                  ⛶ + − │
│ (?)                                                                          │
└──────────────────────────────────────────────────────────────────────────────┘
```
* **Explore hub** (`ui/hub.ts`, ▦): every activity in one drawer, on four shelves. The last shelf used is remembered.
  * Learn: geography lessons, guided tours and mission stories, encyclopedia.
  * Observe: sky theatre, tonight from my city, time machine\*, compare bench, saved views, radio\* (not in classroom mode).
  * Play\*: Daily Planet, Place it!, globe quiz.
  * Me: passport, collection (dexes and stickers), photo album, account and guestbook (server edition).
  * Entries marked \* need the globe; in space they are replaced by a "Back to Earth" button.
* **Settings** (⚙): globe look and layers (Earth only), sound, classroom mode, language, backup, reset, hide controls (H), About and Privacy.
* Modals (`role=dialog`, `aria-modal`) are stacked. Esc or ✕ closes the top one. A backdrop click closes it too.
* Toasts stack (max 3, bottom centre, `role=status`).

## 2. Globe [`src/client/globe/scene.ts`, `src/client/globe/painter.ts`]
| Item | Spec |
|---|---|
| Camera | Perspective FOV 42°. Orbit state `(lat, lon, h)` where `h` = height above the unit sphere. `zoom = 4·2.2 / h`: default h = 2.2 (×4.0), range h ∈ [0.07, 4.5] (≈×2 – ×125) |
| Input | Pointer drag rotates (speed ∝ h) with inertia. Wheel zooms exponentially. Two-finger pinch zooms. Keyboard on the focused canvas: arrows rotate, `+`/`=`/`-` zoom. Buttons: ×1.6 / ÷1.6 |
| Fly-to | Eased (cubic) interpolation of lat, shortest-path lon and h. 350 ms for buttons, ~1.2 s for deep links |
| Map texture | Equirectangular canvas (4096×2048; 2048 in Low-FX) painted from Natural Earth 110m. Political palette (8 pastel colours, chosen to differ from already-painted neighbours) or terrain (latitude biome tint + value noise). Optional borders (land borders only, finer 50m data once loaded, brighter when zoomed in; hovering or tapping a country outlines and names it) + 15° graticule + tropics |
| Labels | 2D overlay canvas. Countries (uppercase), oceans (italic), cities (dot + name, capitals first). Back-face culled, zoom-tiered and greedy-decluttered; refreshed ~8 Hz (1 Hz in Low-FX) and on camera change |
| Items | One procedural model per catalogue item, placed on the surface normal and scaled with zoom. Visible when its layer is on, `zoom ≥ TIER_ZOOM[tier]` (`[0, 0, 4.3, 5.3]`) and not in game mode |
| Vehicles | Move along great-circle polylines (`loop` or `pingpong`) at `speed`°/s, oriented to heading |
| Shadows | "Day & night" directional light + soft terminator. Toggleable |
| Render loop | `requestAnimationFrame`; renders only when `dirty` or animating (vehicles/animals). Low-FX: DPR 1, no AA, 64×32 sphere, 300 stars |
| Failure | When the WebGL context cannot be created, a full-screen friendly message is shown (`role=alert`) |

## 2a. Flat world map [`src/client/map/flatmap.ts`, `src/client/map/proj.ts`]
| Item | Spec |
|---|---|
| Open / close | Top-bar map button or `M` (Earth level only); `#map` deep link. Opens on the globe's meridian; closing flies the globe to the map's centre. Esc closes the info card first, then the map. Games, rides, the radio, the Solar System, the sky theatre, tours and lessons close it. While it is open the globe is paused (no frames) |
| Projections | Equal Earth (default, equal-area, drawn once), Mercator (cut at ±85.05°) and plate carrée (both wrap sideways forever). The choice persists (`pp.mapProj`). "How do maps flatten the Earth?" opens the `projections` lesson |
| Drawing | One full-screen fragment shader inverse-projects every pixel and samples the globe's painted land (border-free copy) plus relief and night lights. Borders (1:50m once loaded) and the 15° graticule + tropics/polar circles are instanced screen-space quads projected in the vertex shader, so they stay 1–1.5 px thick at any zoom. Only redrawn when the view or the data changes |
| Input | Drag pans (with inertia); wheel and pinch zoom about the pointer (×1 – ×14); double-click zooms in; arrows pan and `+`/`-` zoom on the focused map; mouse hover is hit-tested once per frame |
| Labels | Countries (by area, zoom-tiered), then catalogue pins (grid-decluttered, never over a country name), then oceans, cities and grid-line names. Hovering or tapping a country outlines and names it; tapping a pin opens the same info card as on the globe |
| HUD | Projection switch, a note on what the projection keeps true, a km scale bar for the map centre and the shared zoom + lat/lon readout |

## 3. Content [`src/shared/data/*`]
* `CatalogueItem` (see [architecture & data model](../architecture/architecture-and-data-model.md) §3.1). Currently 48 landmarks, 33 animals, 14 discoveries, 10 vehicles and 144 cities, with all text original, in en + ko.
* Keys: landmarks have no prefix (`eiffel`), animals `an_*`, discoveries `dc_*`, vehicles `vh_*`. Slugs are kebab-case and unique.

## 4. Info card [`src/client/ui/shell.ts`]
* Opens on item tap, deep link or collection click. It shows: emoji art, localized name and type, place (`City, Country` or continent), description, fact chips (height, built (BCE aware), length, weight, speed, lifespan, depth, year, diet, IUCN status, latitude + hemisphere), fun fact, and "📖 Encyclopedia" link `/<section>/<slug>/` (or `/ko/…`).
* Reactions: ♥ like and ✓ visited toggles, persisted locally and sent to `POST /api/reactions` (anonymous visitor cookie). Counts come from `GET /api/reactions?key=`, and the UI falls back gracefully when offline.
* Animal: "Add to collection" is enabled when `zoom ≥ 10` (DEX_ZOOM); otherwise a 🔍 button flies close. Discovery: "Log discovery". Vehicle: "🚢 Ride".
* Hash is updated to `#<key>` while open and cleared on close.

## 5. Menu [`src/client/ui/shell.ts`]
Sections: **Surface mode** (satellite / minimal / political, the only surface switch). **Atmosphere** preset. **Layers**: place names, borders, latitude & longitude lines, day & night, clouds, auroras, plates. **On the globe**: one switch per item type. **Settings**: sound effects, language (en/ko/ja/zh), reset view & settings (confirm), account, guestbook, about/encyclopedia, credits. All settings persist (`pp.settings`).

## 6. Collection [`src/client/ui/collection.ts`]
Hub with 4 cards: Animal dex (n/33), Discovery log (n/14), Stickers (n/12), Photo album (n photos). Dex grids are grouped by `sub`, with locked entries shown as ❔/???. Tapping an entry flies to it. Stickers can be sorted (default / earned first), and the choice is persisted.

| Sticker | Rule |
|---|---|
| first_animal / animals_10 / animals_all | dex ≥ 1 / ≥ 10 / all |
| first_log / logs_all | discoveries ≥ 1 / all |
| placeit_play / placeit_7000 | any Place it! play / best ≥ 7000 |
| quiz_10 / quiz_geo | ≥ 10 correct / ≥ 20 correct in geo set |
| daily_win / daily_streak3 | ≥ 1 daily win / max streak ≥ 3 |
| traveller | ≥ 5 items marked visited |

A newly earned sticker triggers a toast plus a sound, and is awarded exactly once.

## 7. Ride [`scene.startRide`]
Camera follows the vehicle (third person by default, first-person toggle). Drag yaws the view and the wheel changes distance (0.5–6). An exit bar is shown, and Esc exits.

## 8. Photo [`src/client/ui/photo.ts`]
The viewfinder overlay hides the chrome. On shutter (flash + sound), the scene is re-rendered and exported as a JPEG (quality 0.9) data URL. It is stored in IndexedDB `pp-photos/photos` as `{id, at, url, place}`, where `place` is the name of the open item (or empty). The album grid offers view, download (`terrastra-<id>.jpg`), Web Share with a file (when supported) and delete.

## 9. Games [`src/shared/games/*`, `src/client/ui/games.ts`]
Entering game mode sets `body.gaming`, closes the card/menu and hides items. For non-practice difficulties it also hides names. The HUD's ✕ quits (Esc only closes dialogs).

### 9.1 Place it!
* 10 rounds. Targets: landmarks, animals and discoveries with `tier ≤ cfg.tiers`, unique.
* Difficulties:

| | tiers | full score ≤ km | zero ≥ km | hints | names |
|---|---|---|---|---|---|
| practice | 1 | 1000 | 5000 | 10 | on |
| easy | 1 | 500 | 3000 | 3 | off |
| medium | 2 | 150 | 1500 | 2 | off |
| hard | 3 | 30 | 500 | 1 | off |

* Distance = haversine − `area` allowance (large sites). Score = 1000 if ≤ full, 0 if ≥ zero, else `round(1000·(1−t)^1.6)`.
* Verdict: perfect ≥ 1000, great ≥ 700, good ≥ 300, otherwise try again.
* Round flow: tap the globe to drop a red pin (re-tap to move it), then Confirm. A green pin marks the answer, the camera flies there, and the HUD shows distance and score. A hint (💡) reveals the continent first, then the country.
* Results: total out of 10,000, per-round list, new-record banner, records per difficulty `{best, plays}`.

### 9.2 Quiz
* Sets: mixed, animals, geo, landmarks, secrets. Levels: easy (2 options), normal (3), hard (5).
* Players 1–4 with editable names (pass-and-play). A solo game has 10 questions; multiplayer has 5 per player, asked alternately.
* Questions come from 13 templates over the catalogue and cities (country of landmark, tallest, oldest, diet, endangered, heaviest, continent, capital, north/south-most, closest to equator, discovery kind, deepest). Every question has exactly `options(level)` distinct options; templates return `null` when they can't fill them, and the generator dedupes.
* Feedback per answer: ✅ / ❌ with the correct answer, 🔥 streak ≥ 3, and the camera flies to the question's focus when present.
* Results: podium ranked by score then best streak. Progress `quiz.answered/correct/bySet`.

### 9.3 Daily Planet
* Target: `POOL[dayIndex % len]`. The pool is a frozen seeded shuffle of landmarks (seed 4242), repaired so consecutive days are ≥ 1200 km apart. `dayIndex` = days since 2026-01-01 in the **local** calendar.
* Guesses (max 6): type a landmark or city name (datalist, accent-insensitive, any language alias), **or** "📍 Pick on globe" (tap anywhere). Duplicate guesses are ignored.
* Per guess: distance, 8-way arrow towards target, band 🟩 hit ≤ 200 km · 🟨 ≤ 1000 · 🟧 ≤ 3000 · 🟥 > 3000.
* Hints after 2 / 4 / 5 misses: continent → country → first two letters of the name.
* End: reveal (emoji + fly-to), result, share text (`Terrastra Daily #N k/6` or `X/6` + emoji rows, no answer), stats (played, streak, best), countdown to local midnight.
* State is persisted per day (`pp.dailyState`), so a reload shows the finished result. Stats `{played, won, streak, maxStreak, lastWonDay, dist[6]}`. The streak continues only if yesterday was won.

## 10. Tutorial & hints [`src/client/ui/tutorial.ts`]
* 7 steps that spotlight real UI elements (globe, zoom, card, Explore hub twice, settings). Dots, Skip and Next; Esc skips.
* Shown automatically when `pp.tutorial` is unset, there is no hash and there is no `?notut`. It can be reopened from the hints.

## 11. i18n [`src/client/lib/i18n.ts`]
* Resolution order: saved choice → `navigator.language` (en/ko/ja/zh) → en. `t(key, vars)` with `{var}` interpolation falls back to English per key.
* en and ko are complete (enforced by a unit test). ja and zh cover the main chrome. Country names come from `Intl.DisplayNames`.

## 12. API [`src/server/app.ts`]
All JSON. Mutating requests require `Content-Type: application/json` (except DELETE) and a same-origin `Origin` when present (else 403/415).

| Method & path | Auth | Request | Response / errors |
|---|---|---|---|
| GET `/api/health` | none | n/a | `{ok:true}` |
| POST `/api/auth/request` | none | `{email}` | `{ok, devLink?}`. 400 invalid email, 429 (5 per 10 min per IP and per IP+email) |
| GET `/api/auth/verify?token=` | none | n/a | 302 `/#signed-in` + `pp_sid` cookie, or 302 `/#auth-error` (unknown/used/expired, TTL 15 min) |
| POST `/api/auth/logout` | none | `{}` | `{ok}` and the cookie is cleared |
| GET `/api/me` | optional | n/a | `{user: {id,email,handle} \| null}` |
| DELETE `/api/me` | session | n/a | `{ok}`. Cascades progress, sessions and guestbook |
| PUT `/api/profile` | session | `{handle}` | `{user}`. 400 invalid/unkind, 409 taken |
| GET `/api/progress` | session | n/a | `{progress \| null}` |
| PUT `/api/progress` | session | `{progress}` | `{progress: merged}`. 400 invalid shape |
| GET `/api/reactions?key=` | none | n/a | `{like, visited}`. 404 unknown key |
| POST `/api/reactions` | visitor cookie | `{key, kind:'like'\|'visited', on:boolean}` | counts. 400 invalid |
| GET `/api/guestbook` | none | n/a | `{entries: [{id, handle, body, created_at}]}` (latest 50, not hidden) |
| POST `/api/guestbook` | session | `{body}` | 201 `{entry}`. 400 empty/unkind, 429 (5/min/user). Body cleaned (control chars, URLs→🔗), ≤ 200 chars |
| POST `/api/guestbook/:id/report` | visitor cookie | `{}` | `{ok}`. One report per visitor per entry; hidden at 3 |

Cookies: `pp_sid` (session, httpOnly, SameSite=Lax, Secure in production, 60 days; stored server-side as SHA-256) and `pp_vid` (random 128-bit anonymous visitor id, 1 year).

## 13. Static pages [`scripts/build-pages.ts`]
At build time it generates `/landmarks/`, `/animals/`, `/discover/` indexes and `/<section>/<slug>/` pages for en and `/ko/…`, plus `/about/`, `sitemap.xml`, `robots.txt` and `404.html`. Each item page has: title, emoji, place, description, an "At a glance" fact list, a quick-answers section and a "See it on the 3D globe →" `/#<key>` link. The server serves `404.html` with status 404 for unknown paths.

## 14. Accessibility
Every button has visible text or `aria-label`, and modals are labelled by their title. Focus moves into a dialog on open and returns on close. The canvas is focusable with keyboard controls. The palette has AA contrast for chrome text. `prefers-reduced-motion` disables CSS animations and defaults to Low-FX.
