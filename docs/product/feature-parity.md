# Feature Parity: Reference (myearthtoy.com) vs Terrastra

> Historical MVP baseline. Since then the app has moved to English and Simplified Chinese only (`Lang = 'en' | 'zh'`), dropped offline mode and grown a Solar System, deep-space levels, a sky theatre and lessons. The current state and priorities live in [the 2026-10 roadmap](../planning/improvement-roadmap-2026-10.md).

Legend: ✅ parity · ≈ comparable, different design · ➕ improved over reference · ⏭ backlog (see [backlog](../planning/backlog.md)) · ✖ intentionally out of scope.
Reference facts come from the anonymous exploration and the bundle analysis ([exploration report](../research/exploration-report.md)). All Terrastra code, models, copy and data are original. Nothing is copied from the reference.

## 1. Globe & navigation
| Capability | Reference | Terrastra | Status |
|---|---|---|---|
| 3D globe, drag + inertia, wheel/pinch zoom, +/− | yes | yes (three.js, custom controls) | ✅ |
| Zoom readout | ×1 → ×40 | ≈×2 → ×125 | ≈ |
| Level-of-detail tiers (more items/cities when zoomed) | yes | 4 tiers (`TIER_ZOOM`) | ✅ |
| Country/city/ocean labels | 20+ label languages | collision-avoiding DOM labels; city names English-only | ≈ (⏭ B-07 city names in ko/ja/zh) |
| Political vs real-terrain map style | blue-marble texture | procedural "terrain" tint toggle (no third-party imagery) | ≈ |
| Borders / grid / shadows toggles | yes | yes | ✅ |
| Fullscreen | yes | yes | ✅ |
| Low-power mode | none observed (≈15 MB JS, saturates software GPU) | `?lowfx=1`, ≈ 0.7 MB JS, procedural models | ➕ |
| WebGL-missing fallback | yes | yes | ✅ |

## 2. Content
| Capability | Reference | Terrastra | Status |
|---|---|---|---|
| Landmarks | ≈ 825 (sitemap) with 3D models | 48 original procedural models | ≈ (catalogue size; ⏭ B-01 content pipeline) |
| Animals / dex | 470 species, Land/Sea/Birds tabs | 33 animals, single dex grid | ≈ (⏭ B-03 Land/Sea/Birds tabs) |
| Discoveries / mysteries | 107 places, 8 kinds | 14 discoveries | ≈ |
| Mini objects layer | yes | — | ✖ (not planned) |
| Vehicles on routes | ships/planes/trains | 10 vehicles animating on great-circle routes | ✅ |
| Cities | many | 144 | ≈ |

## 3. Info card & sharing
| Capability | Reference | Terrastra | Status |
|---|---|---|---|
| Name, place, description, fact chips | yes | yes, plus a latitude chip | ✅ |
| Photo / Wikipedia link | photo + Wikipedia | no photos or external links (copyright, kid-safe) | ≈ (⏭ B-06 CC0 photos) |
| Deep link `/#key` | yes | yes, the hash clears on close | ✅ |
| ♥ like / visited reactions | sign-in required (Supabase) | anonymous visitor cookie, counts from the server (ADR-013) | ➕ |
| Encyclopedia static pages (SEO) | 2,943 URLs, en/ko | 95 item pages + indexes, sitemap, robots, 404 | ≈ |

## 4. Collection & play
| Capability | Reference | Terrastra | Status |
|---|---|---|---|
| Collect animals by zooming close | sign-in gated | works offline at ≥ ×10, syncs when signed in | ➕ |
| Discovery log, stickers, photo album | yes | yes (12 stickers, IndexedDB album with save/share/delete) | ✅ |
| Ride a vehicle | sign-in gated | free, exit bar | ➕ |
| Photo mode (shutter, flash, sound) | yes | yes (labels not included in capture) | ≈ |
| Place it! (10 rounds, difficulties) | sign-in gated | 4 difficulties, distance scoring, records | ✅ |
| Quiz (sets, 2/3/5 options, 1–4 players, podium) | sign-in gated | 5 sets, 13 templates, pass-and-play podium | ✅ |
| Daily landmark guess | "Daily Earth": tap-the-globe guesses, 5-step hints, answer key stored in localStorage | "Daily Planet": type **or** tap-the-globe guesses, distance/arrow/colour bands, hints after 2/4/5 misses, stats/streaks, spoiler-free share text. Puzzle is client-seeded (ADR-012) | ≈ |
| Esc quits game HUDs | — | ✕ button only | ⏭ B-08 |

## 5. Onboarding, menu, i18n
| Capability | Reference | Terrastra | Status |
|---|---|---|---|
| Multi-step tutorial, hints panel | yes | 7-step tutorial (`?notut` skips), help hints | ✅ |
| Settings persisted locally | yes (`globe-*` keys) | `pp.settings` etc. | ✅ |
| UI languages | ko, en, ja, zh | en, ko complete; ja/zh partial UI | ≈ (⏭ B-02) |
| Sound | SFX + BGM | synthesized WebAudio SFX; `bgm` setting exists but no track yet | ≈ (⏭ B-05) |
| Discord / community link | yes | — | ✖ |

## 6. Accounts & community
| Capability | Reference | Terrastra | Status |
|---|---|---|---|
| Sign-in | Supabase email OTP + Google OAuth | email magic link (self-hosted, SQLite); `DEV_LOGIN` link in dev | ≈ (⏭ B-12 mail transport, B-11 Google/Apple) |
| Required for play | yes for collect/ride/games | no, local-first; sign-in only for sync and the guestbook | ➕ |
| Nickname profile, account deletion | yes | yes (unique, filtered, delete wipes data) | ✅ |
| Progress sync | dex upsert | merge-on-PUT (union/max, idempotent) | ✅ |
| Guestbook with reports | yes | yes; link stripping, kindness filter, auto-hide after 3 reports, rate limit | ✅ |
| Admin realtime layout editor | yes | — | ✖ (content is code-reviewed data) |

## 7. Non-functional
| Aspect | Reference | Terrastra | Status |
|---|---|---|---|
| Bundle size | ≈ 15 MB JS (s1 13.6 MB + s2 1.7 MB) + CDN libs | ≈ 0.7 MB JS, no CDNs | ➕ |
| Cookie-free anonymous use, no ads/trackers | analytics present | none; first-party cookies only on API use | ➕ |
| Security headers | — | CSRF origin checks, httpOnly SameSite cookies, rate limits; CSP pending | ≈ (⏭ B-13) |
| Automated tests | unknown | 38 unit/API tests + 13 Playwright scenarios (desktop + mobile) | ➕ |
| CI pipeline | unknown | — | ⏭ B-14 |

## Summary
Every core loop is implemented and tested: explore, inspect, collect, ride, photograph, play three games, sign in, sync and guestbook. The main gaps are catalogue breadth (ADR-009: a small original set instead of hundreds of licensed models), extra languages, music, and production plumbing (mail transport, CSP, CI, deployment). All are tracked in the backlog.
