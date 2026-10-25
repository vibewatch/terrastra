# Architecture & Data Model — Terrastra

## 1. Reference architecture (observed)

```
Browser (single index.html, ~105 KB HTML + 77 KB inline CSS)
 ├─ CDN: three.js r128 + OrbitControls + Line2, topojson-client 3.1, Google Fonts (Jua, Nunito, Noto Sans KR)
 ├─ /js/s1.<hash>.js  (13.6 MB)  stage 1: WORLD topojson, textures (base64), PLACES (countries/cities, 20+ languages),
 │                                 LM_META, LANDMARK_INFO, UI strings, map painter, renderer, ~1,400 BUILD[key](group) model builders
 ├─ /js/s2.<hash>.js  (1.7 MB)   stage 2: model baking/LOD/batching, shadows, labels, picking, info card, ride mode,
 │                                 ambient life, editor, dex, discoveries, reactions, menu, games, quiz engine, stickers,
 │                                 photo album, daily puzzle, tutorial
 ├─ /data/flags.json             fetched lazily when a quiz starts
 ├─ Supabase (supabase-js 2 via CDN): auth (email OTP + Google OAuth), tables layout, profiles, dex_found,
 │     reactions, guestbook, guestbook_reports; RPC is_admin, reaction_counts, signup_count, delete_my_account;
 │     realtime channel on `layout` (admin edits stream to every visitor)
 ├─ Cloudflare: CDN, RUM beacon, /cdn-cgi/trace (used for a geo-based free-pass)
 └─ Static SEO pages: /about, /privacy, /{landmarks,animals,discover}/[slug]/ (+ /ko/ … variants), sitemap.xml
```

Browser storage (observed keys): `globe-lang`, `tutorial`, `hint-open`, `names`, `grid`, `shadows`, `landmarks`,
`animals`, `myst`, `minis`, `vehicles`, `sfx`, `bgm`, `mapStyle`, `dex`, `dexOwner`, `dexst`, `discFound`, `discst`,
`gameStats`, `quizStats`, `daily`, `stkSort`, `gbnick`, `globe-layout*`, `ed-roads`; IndexedDB `met-photos` (album).

## 2. Terrastra architecture (as built)

```
┌──────────────────────────────────── Browser (Vite build, ES modules) ────────────────────────────────────┐
│ index.html → src/client/main.ts (boot, hash router, game-mode switch, account sync, toasts, window.__pp)  │
│  ├─ globe/scene.ts    Globe: renderer, orbit camera (lat,lon,h), input, fly-to, picking, item/vehicle     │
│  │                    placement + tiers, pins, ride camera, capture, render-on-demand loop, label overlay │
│  ├─ globe/painter.ts  Equirectangular map texture (political/terrain, borders, graticule) + label anchors │
│  ├─ map/flatmap.ts    Flat world map (lazy): shader inverse projection of the painted land, GPU lines,    │
│  │                    labels and pins; map/proj.ts holds Equal Earth / Mercator / plate carrée (TS+GLSL)  │
│  ├─ models/kit.ts     ~57 procedural toy-model builders, recipe → THREE.Group                             │
│  ├─ ui/shell.ts       Top bar, hints, zoom buttons, menu, info card / bottom sheet, ride bar              │
│  ├─ ui/collection.ts  Hub, animal dex, discovery log, stickers                                            │
│  ├─ ui/photo.ts       Photo mode, IndexedDB album                                                         │
│  ├─ ui/games.ts       Chooser, Place it!, Quiz, Daily Planet UIs                                          │
│  ├─ ui/tutorial.ts    Spotlight tutorial          ui/account.ts  sign-in, nickname, sync, guestbook       │
│  ├─ ui/dom.ts         h() element helper, modal stack, toasts, confetti                                   │
│  ├─ lib/*.ts          storage (pp.*), i18n, sfx (WebAudio), api client                                    │
│  ├─ store.ts          progress + settings + me; subscribe/emit; debounced sync                            │
│  └─ uses src/shared ─▶ data/   catalogue (105 items), cities (144), ISO alpha-2 + continents, types      │
│                        games/  pure logic: placeit (scoring), quiz (templates), daily (pool, bands, stats)│
│                        lib/    geo, rng, stickers, progress (merge)                                      │
└───────────────┬─────────────────────────────────────────────────────────────┬────────────────────────────┘
                │ GET /data/countries-110m.json (static)                       │ fetch /api/* (JSON, cookies)
┌───────────────▼─────────────────────────────────────────────────────────────▼────────────────────────────┐
│ Node 24 + Express 5   src/server/index.ts → createApp() in src/server/app.ts (+ src/shared)              │
│   static dist/ (SPA, assets immutable-cached, pre-rendered encyclopedia pages, 404.html with status 404)│
│   security headers, CSRF guard, rate limiters, auth/session, profile, progress merge, reactions, guestbook│
│   src/server/db.ts → node:sqlite (WAL, foreign keys)                                                      │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
scripts/build-pages.ts → dist/{landmarks,animals,discover,about}/…, /ko/…, sitemap.xml, robots.txt, 404.html
```

Paths in the box are relative to `src/client/` unless stated. The pure logic in `src/shared/` (data, games, lib) has no DOM or Three.js dependency. It is unit-tested and reused by the server
(`mergeProgress`, `isProgress`, `BY_KEY`) and the page generator.

## 3. Data model

### 3.1 Static catalogue (`src/shared/data/catalogue.ts`)
```ts
type Lang = 'en' | 'ko' | 'ja' | 'zh';
type I18n = { en: string } & Partial<Record<'ko' | 'ja' | 'zh', string>>;

interface CatalogueItem {
  key: string;              // stable id: "eiffel", "an_lion", "dc_titanic", "vh_liner"
  slug: string;             // URL slug, e.g. "eiffel-tower"
  type: 'landmark' | 'animal' | 'discovery' | 'vehicle';
  name: I18n; desc: I18n; funFact?: I18n; habitat?: I18n;
  country?: string;         // ISO-3166 alpha-2
  continent: Continent | 'ocean';
  lat: number; lon: number;
  tier: 1 | 2 | 3;          // zoom tier (TIER_ZOOM = [0, 0, 4.3, 5.3])
  emoji: string;            // card art + dex icon
  model: { kind: string; color?: string; accent?: string; [k: string]: unknown };
  sub: string;              // landmark: tower|temple|mountain|…; animal: mammal|bird|sea|…; discovery: wreck|mystery|cryptid|deepsea|extreme
  facts?: { built?; heightM?; lengthM?; weightKg?; speedKmh?; lifespanY?; depthM?; year? };
  diet?: 'carnivore' | 'herbivore' | 'omnivore';
  status?: 'LC' | 'NT' | 'VU' | 'EN' | 'CR';
  route?: { kind: 'ship' | 'plane' | 'train'; pts: [lat, lon][]; mode: 'loop' | 'pingpong'; speed: number };
  area?: number;            // km allowance for very large sites in Place it!
}
```
Cities: `[name, cc, lat, lon, pop, capital?]` tuples. Geography: Natural Earth 110m via `world-atlas` (map fills,
lessons, labels); the 50m set is fetched once the globe is up for finer land borders (texture + 3D lines, coastlines
excluded) and for country hover/tap lookups, which include small states such as Singapore or Vatican City.

### 3.2 Client state (localStorage, namespace `pp.`)
| Key | Shape |
|---|---|
| `pp.settings` | `{ surfaceMode, auraPreset, names, borders, graticule, shadows, clouds, aurora, tectonics, <one boolean per item type>, sfx, bgm }` |
| `pp.lang` | `'en' \| 'ko' \| 'ja' \| 'zh'` |
| `pp.progress` | `Progress` (below) |
| `pp.dailyState` | `{ day, guesses: {key, km, band, arrow}[], done, won }` (today only) |
| `pp.tutorial` | `'done' \| 'skip'` |
| `pp.stickerSort` | `'default' \| 'earned'` |
| IndexedDB `pp-photos` / `photos` | `{ id (auto), at, url (JPEG data URL), place }` |

```ts
type Stamp = Record<string, number>;          // key → first time (epoch ms)
interface Progress {
  v: 1;
  dex: Stamp; logs: Stamp; likes: Stamp; visited: Stamp; stickers: Stamp;
  placeit: Record<Difficulty, { best: number; plays: number }>;
  quiz: { answered: number; correct: number; bySet: Record<string, number> };
  daily: { played; won; streak; maxStreak; lastWonDay: number | null; dist: number[6] };
  updatedAt: number;
}
```
**Merge rules** (`mergeProgress`, ADR-007): dex/logs/stickers = union with the earliest timestamp; likes/visited = the newer
document wins (they are toggles); placeit = per-difficulty max of best and plays; quiz counters = max; daily = max
counters, streak/lastWonDay from the side with the later win, per-slot max distribution. Idempotent and commutative for
collections (unit-tested).

### 3.3 Server (SQLite, `src/server/db.ts`)
```sql
users            (id INTEGER PK, email TEXT UNIQUE NOCASE, handle TEXT UNIQUE NOCASE, created_at TEXT)
login_tokens     (hash TEXT PK /*sha256*/, email TEXT, expires INTEGER, used INTEGER DEFAULT 0)
sessions         (hash TEXT PK /*sha256*/, user_id → users ON DELETE CASCADE, expires INTEGER)
progress         (user_id PK → users ON DELETE CASCADE, json TEXT, updated_at INTEGER)
reactions        (visitor TEXT, item TEXT, kind TEXT CHECK IN ('like','visited'), created_at INTEGER,
                  PK (visitor, item, kind));  INDEX reactions_item(item, kind)
guestbook        (id INTEGER PK, user_id → users ON DELETE CASCADE, body TEXT, created_at TEXT,
                  reports INTEGER DEFAULT 0, hidden INTEGER DEFAULT 0)
guestbook_reports(entry_id → guestbook ON DELETE CASCADE, visitor TEXT, PK (entry_id, visitor))
```
Rules: the handle must match `^[A-Za-z0-9_가-힣ぁ-ヿ一-鿿]{2,16}$`, be unique case-insensitively and pass the kind-words filter. Guestbook bodies are cleaned
(control chars removed, URLs → 🔗), limited to ≤ 200 chars and 5 posts/min/user, and hidden at 3 distinct reports.

## 4. Key data flows

1. **Start-up:** HTML (loader) → JS bundle → `fetch /data/countries-110m.json` → paint map texture → build
   item models → `__pp.ready` → resolve hash route → tutorial (first visit, no hash) → `GET /api/me`
   (non-blocking). If signed in, run a sync. On idle: `fetch /data/countries-50m.json` → finer borders.
2. **Tap item:** pointerup without drag → raycast items, else globe (with borders on: outline + name the country
   under the tap; hovering does the same) → `shell.showItem(item)` → hash `#key` →
   `GET /api/reactions?key=`. Collect (animal, zoom ≥ ×10) or log (discovery) → `updateProgress` → `newlyEarned`
   stickers → toasts → `pp.progress` saved → debounced (1.5 s) `PUT /api/progress` when signed in.
3. **Place it! round:** setup → `setGameMode(true, names)` → target card in the HUD → `onGlobeTap` drops a pin →
   Confirm → `effectiveKm` → `scoreFor` → answer pin + fly-to → next … → results → `updateRecord` → progress.
4. **Daily:** `dayIndex()` → `puzzleFor(POOL)` → restore `pp.dailyState` → guesses by name or by globe tap →
   `evaluate` (km, band, arrow) → `applyGuess` → hints by misses → on end `finishStats` + share text.
5. **Sign in:** email → `POST /api/auth/request` → link (mail hook / dev link) → `GET /api/auth/verify` → hashed
   session row + `pp_sid` cookie → 302 `/#signed-in` → `GET /api/me` → `PUT /api/progress` (local doc) → server
   merges with its copy → client `replaceProgress(mergeProgress(local, merged))`.
6. **Reactions:** `POST /api/reactions {key, kind, on}` → `pp_vid` visitor cookie set if missing → counts returned.

## 5. Security & privacy
* No third-party scripts, fonts, trackers or ads. The only PII is the email, and only for optional accounts. `DELETE /api/me` cascades.
* Login tokens (24 random bytes, 15 min, single use) and sessions (32 bytes, 60 days) are stored as SHA-256 hashes.
* Cookies are httpOnly, SameSite=Lax, and Secure in production.
* CSRF: mutating `/api` calls need a JSON content type (except DELETE). Any `Origin` must match `Host` (malformed/`null` → 403).
* Rate limits: auth 5/10 min per IP and per IP+email; guestbook 5/min/user.
* Headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`. No `x-powered-by`.
* All input is validated server-side (email, handle, progress shape, catalogue key, reaction kind, ids). The client renders
  all dynamic/user text via text nodes. `innerHTML` is used only for three trusted, bundled i18n hint strings.
* *Backlog:* Content-Security-Policy header (B-13) and a production mail transport (B-12).
