# PRD: Terrastra

> Historical product baseline (MVP). The current state, verified issues and priorities live in [the 2026-10 roadmap](../planning/improvement-roadmap-2026-10.md).

## 1. Summary
Terrastra is a free, original 3D toy globe for curious kids aged roughly 5–12 and the grown-ups playing with them.
Children spin a cartoon Earth, discover landmarks, animals, secret places and moving vehicles, collect them, and
play short geography games. It runs in any modern browser, works anonymously and offline-first, and syncs only if a parent chooses to sign in.

## 2. Problem & opportunity
Existing toy globes, the reference product included, are delightful but:
* need very heavy downloads (~15 MB JS) and are slow on low-end tablets and Chromebooks;
* gate collecting and games behind sign-in, which adds friction and personal-data collection for children;
* lack keyboard access and focus management.

Terrastra offers comparable play value with a small, fast, privacy-respecting build.

## 3. Personas
| Persona | Needs |
|---|---|
| **Mina, 7**: pre-reader / early reader | Big tap targets, emoji, sounds, instant feedback, no typing required |
| **Leo, 10**: confident reader | Facts, records, collecting everything, games with friends, sharing the daily puzzle |
| **Parent / teacher** | Safe (no ads, no chat with strangers), no forced account, works on a school device, projector-friendly, Korean and English |

## 4. Goals & success metrics
| Goal | Metric (target) |
|---|---|
| Fast first play | Globe interactive ≤ 3 s on a mid-range laptop and ≤ 6 s on a 2019 tablet. Initial JS ≤ 300 KB gz |
| Engagement | ≥ 40 % of sessions open at least one info card; ≥ 15 % start a game |
| Return visits | ≥ 10 % of daily-puzzle players return the next day |
| Inclusion | All core flows keyboard-operable; WCAG AA contrast for UI chrome |
| Privacy | 0 third-party trackers; the account is optional; deletion is self-service |

## 5. Scope

### 5.1 In scope (MVP = this release)
| ID | Feature | Priority |
|---|---|---|
| F1 | 3D globe: drag-rotate with inertia, wheel/pinch/button/keyboard zoom (≈×2–×125, default ×4), fullscreen, zoom readout, political & terrain styles, borders/graticule, labels (countries, cities, oceans) with zoom tiers, stars, atmosphere, day/night shading | P0 |
| F2 | Catalogue of original content: ≥ 45 landmarks, ≥ 30 animals, ≥ 12 discoveries, ≥ 8 vehicles on routes; procedural toy models | P0 |
| F3 | Info card: emoji art, names, place, description, facts chips, encyclopedia link, ♥ like / ✓ visited with counts | P0 |
| F4 | Layers & settings menu: map style, names, borders, shadows, each item layer, SFX, language, reset | P0 |
| F5 | Deep links `/#<key>`; hash routes for daily, games, collection, guestbook, account | P0 |
| F6 | Collection hub: animal dex (collect at zoom ≥ ×10), discovery log, stickers (12), photo album | P0 |
| F7 | Ride mode for vehicles | P1 |
| F8 | Photo mode with album (IndexedDB), save and share | P1 |
| F9 | Games: Place it! (10 rounds, 4 difficulties, hints, records); Quiz (4 sets, 4 levels, 1–4 players, podium); Daily Planet (6 guesses, 200 km hit, distance + arrow + band, hints, share, streak) | P0 |
| F10 | Tutorial (7 steps) + help hints | P1 |
| F11 | i18n: English and Korean complete; Japanese and Chinese UI with English fallback | P1 |
| F12 | Optional account: email magic link, nickname, progress sync (merge), account deletion | P1 |
| F13 | Guestbook: signed-in posting, link stripping, kind-words filter, community reports auto-hide | P2 |
| F14 | Static encyclopedia pages per item (+ ko), indexes, sitemap, robots, 404 | P1 |
| F15 | Low-FX mode (`?lowfx=1`) and WebGL failure fallback | P1 |
| F16 | Flat world map: Equal Earth / Mercator / plate carrée, pan and zoom, borders, country names, catalogue pins, `#map` deep link | P1 |

### 5.2 Out of scope (this release)
* Google OAuth (only the email link). An admin layout editor and realtime layout streaming. Background music.
* Hundreds of hand-modelled meshes; real photos (emoji art + procedural models instead).
* Place names in 20+ languages (country names use `Intl.DisplayNames`, cities use English).
* Donations/support links, Discord.

## 6. User stories (selection)
* As a child, I can spin and zoom the globe and tap a picture to learn what it is.
* As a child, when I zoom in close to an animal I can add it to my dex, and I get a sticker for my first find.
* As a child, I can hop on a ship or plane and ride it around the world.
* As a player, I can play Place it! and see how far my pin was from the real place.
* As a family, we can play the quiz with up to 4 players on one device and see a podium.
* As a player, I can solve today's puzzle and share an emoji result without spoiling the answer.
* As a parent, I can optionally sign in with an email link to keep progress across devices, and delete the account.
* As a teacher, I can send a link (`/#pyramids`) that opens the globe on a specific landmark.

## 7. Non-functional requirements
* **Performance**: 60 fps target on desktop and ≥ 30 fps on tablets; render on demand when idle; Low-FX path.
* **Security**: hashed tokens/sessions, httpOnly cookies, CSRF origin/content-type checks, rate limits, server-side validation, no `innerHTML` with user data.
* **Privacy**: local-first; email is the only PII and only when the user opts in; no third-party scripts.
* **Accessibility**: buttons have accessible names; modals `role=dialog` with Esc to close; keyboard zoom (+/−); reduced motion respected for confetti.
* **Compatibility**: last two versions of Chrome, Edge, Safari, Firefox; iOS 16+, Android 10+.

## 8. Risks
| Risk | Mitigation |
|---|---|
| Low-end GPUs | Low-FX mode, DPR cap, render-on-demand |
| Child safety in guestbook | Sign-in required, link stripping, word filter, 3-report auto-hide, short posts |
| Content accuracy | Facts kept simple and rounded; sources listed in credits |
