# Acceptance Criteria: Terrastra

> Historical MVP baseline. Since then the app has moved to English and Simplified Chinese only (`Lang = 'en' | 'zh'`), dropped offline mode and grown a Solar System, deep-space levels, a sky theatre and lessons. The current state and priorities live in [the 2026-10 roadmap](../planning/improvement-roadmap-2026-10.md).

Format: Given / When / Then. **Verified by** names the automated test: `e2e:` = `tests/e2e/app.spec.ts` (Playwright,
screenshots in [`docs/assets/screenshots/`](../assets/screenshots/)), `unit:` = `tests/unit/logic.test.ts`, `api:` = `tests/unit/server.test.ts`.

## AC-1 Globe & shell (F1, F15)
| # | Criterion | Verified by |
|---|---|---|
| 1.1 | Given a first visit, when the app loads, then the globe, top bar (Search, Photo, Explore hub, Settings; the hub lists every activity on four shelves), zoom readout "×4.0" and help hints are visible on desktop and mobile | e2e: *home: globe, top bar, zoom readout, hints* (desktop + mobile) |
| 1.2 | When I click + / −, the zoom readout increases / decreases | e2e: *home* |
| 1.3 | Countries, cities and oceans are labelled and labels do not overlap | visual: [`desktop_01_home.png`](../assets/screenshots/desktop_01_home.png), [`smoke_home.png`](../assets/screenshots/smoke_home.png) |
| 1.4 | Given WebGL is unavailable, a friendly message replaces the globe | manual (code path `src/client/main.ts` fatal) |
| 1.5 | `?lowfx=1` runs with DPR 1 and no antialiasing | used by every e2e test |

## AC-2 Onboarding (F10)
| 2.1 | Given no saved tutorial state and no hash, the 7-step tutorial opens; Next advances; the last step closes it and it does not reopen after reload | e2e: *tutorial shows on first visit and can be completed* |

## AC-3 Menu & settings (F4, F11)
| 3.1 | Toggling Landmarks hides landmark models; toggling Names hides labels (and both restore) | e2e: *menu: toggles layers & names, language persists* |
| 3.2 | Switching language to 한국어 updates the UI immediately and persists after reload | e2e: *menu…* |
| 3.3 | Every English UI key exists in Korean; missing keys fall back to English | unit: *Korean dictionary covers every English key*, *interpolates variables and falls back to English* |

## AC-4 Info card & deep links (F3, F5)
| 4.1 | Tapping a landmark opens its card with name, place, description and fact chips; the hash becomes `#<key>` | e2e: *tap a landmark opens info card; deep link; Esc closes* |
| 4.2 | Opening `/#<key>` flies to the item and opens the card; Esc closes the card and clears the hash | e2e: same |
| 4.3 | On screens < 720 px the card is a bottom sheet that doesn't cover the top bar | e2e: *mobile layout: info card as bottom sheet* |
| 4.4 | ♥/🧳 reactions toggle, persist per visitor and return counts; unknown items are rejected | api: *reactions are idempotent per visitor and validated* |

## AC-5 Collection (F6, F7, F8)
| 5.1 | Given an animal card at zoom < ×10, "Add to collection" is absent and 🔍 flies closer; at ≥ ×10, collecting adds it to the dex and awards "First find" with a toast | e2e: *collect an animal into the dex and earn a sticker* |
| 5.2 | The collection hub shows counts for dex, discoveries, stickers and photos | e2e: same (`desktop_06_collection.png`) |
| 5.3 | Each sticker is awarded at most once | unit: *awards each sticker once* |
| 5.4 | A vehicle card offers Ride; riding hides the chrome and shows an exit bar; exit restores it | e2e: *vehicle ride mode* |
| 5.5 | Photo mode → shutter → the photo appears in the album | e2e: *photo mode saves to album* |

## AC-6 Place it! (F9)
| 6.1 | Practice: 10 rounds; drop pin → Confirm → distance + score shown; results show total and a record | e2e: *Place it! full game (practice)* |
| 6.2 | Score = 1000 within full radius, 0 beyond zero radius, monotone between; large sites get an allowance | unit: *full score inside fullKm…*, *large sites get a distance allowance* |
| 6.3 | Rounds respect difficulty tiers, are unique and never vehicles | unit: *pickRounds respects tiers, no vehicles, unique* |

## AC-7 Quiz (F9)
| 7.1 | Two players alternate answering; the podium ranks by score then best streak | e2e: *Quiz: 2 players pass-and-play to podium*; unit: *streaks and ranking* |
| 7.2 | Every set yields ≥ 5 questions at every level, each with exactly 2/3/5 distinct options and one correct answer | unit: *quiz* suite |

## AC-8 Daily Planet (F9)
| 8.1 | A guess can be typed **or** picked by tapping the globe (📍); each guess shows distance, arrow and a colour band | e2e: *Daily Planet: guesses, hints, share, persisted state* |
| 8.2 | Game ends on a hit (≤ 200 km) or after 6 guesses; share text contains "Terrastra Daily #N" and no answer | e2e + unit: *game ends on hit or after 6 guesses; stats & streaks; share text* |
| 8.3 | Reloading on the same day shows the finished result | e2e: same |
| 8.4 | Hints unlock after 2, 4, 5 misses; the pool is deterministic; the day index follows the local calendar | unit: *hints unlock…*, *pool is deterministic…*, *day index…* |

## AC-9 Account, sync & guestbook (F12, F13)
| 9.1 | Requesting a magic link with an invalid email → 400; non-JSON or cross-origin (incl. `Origin: null`) writes → 415/403 | api: *rejects bad email, non-JSON and cross-origin writes* |
| 9.2 | A magic link signs in once; reuse fails (`/#auth-error`); private endpoints need a session | api: *magic link signs in once…*, *requires a session…* |
| 9.3 | Sign in via the dev link, set a nickname, sync progress, post to the guestbook | e2e: *account: magic link sign-in, nickname, sync, guestbook* |
| 9.4 | Nicknames: 2–16 allowed characters, unique, kind | api: *validates nickname* |
| 9.5 | Progress PUT merges (union of collections, max of records), never loses data; merge is idempotent/commutative | api: *merges progress on PUT*; unit: *progress merge* suite |
| 9.6 | Guestbook strips links, blocks unkind words, hides after 3 distinct reports, rate-limits posts | api: *guestbook cleans links…*, *rate limits guestbook posts* |
| 9.7 | Logout ends the session; account deletion removes the user and data | api: *logout and account deletion* |

## AC-10 Encyclopedia pages (F14)
| 10.1 | `/landmarks/<slug>/` renders facts and a "See it on the 3D globe" link that opens the globe at `/#<key>` | e2e: *encyclopedia static pages link back to the globe* |
| 10.2 | Unknown paths return HTTP 404 with a friendly page; sitemap and robots exist | curl smoke (`/nope` 404, `/api/nope` 404, `/sitemap.xml` 200 with 101 URLs, `/robots.txt` 200) |

## AC-11 Data integrity
| 11.1 | Catalogue keys and slugs are unique, coordinates valid, and every item has en+ko names and descriptions | unit: *keys and slugs are unique…* |

## Latest results (2026-10-18)
* `npm test`: **38/38** passed.
* Playwright: 13 scenarios → **14 passed** (12 desktop + 2 mobile), 1 skipped by design (mobile-only scenario on the desktop project); 2.9 min under xvfb + SwiftShader.
* `npm run typecheck` clean; `npm run build` OK (717 kB JS / 206 kB gzip; 101 static URLs).
