# Accounts and the learning server

The **full edition** keeps each learner's study on the server. It runs the globe app (the Vite build) inside a
Next.js server with NextAuth sign-in and a Prisma database. The **static edition** on GitHub Pages has no server: it
keeps everything the explorer collects on the device, and points to the full edition for lessons.

## Stack

| Part | Choice |
|---|---|
| Server | Next.js 16 (App Router, route handlers, standalone output) in [`web/`](../../web) |
| Sign-in | NextAuth v4: email magic links (15 min), optional GitHub and Google; **database sessions** (60 days, refreshed daily) |
| Database | Prisma 7 with driver adapters. **Postgres** in production (`@prisma/adapter-pg`), **SQLite** for local development (`@prisma/adapter-better-sqlite3`) |
| Globe app | The Vite build, copied to `web/public` by `npm run build:web` and served by Next (`/` → `index.html`; `/x/` → `x/index.html`) |

### One schema, two databases
[`prisma/schema.prisma`](../../prisma/schema.prisma) is the only schema, written for Postgres, and
[`prisma/migrations/`](../../prisma/migrations) holds its migrations.

- When `DATABASE_URL` is unset or a `file:` URL, [`prisma.config.ts`](../../prisma.config.ts) writes a SQLite copy
  (`prisma/sqlite/schema.prisma`, git-ignored) with only the provider changed. `npm run db:setup` then runs
  `db push`.
- With a Postgres URL, `npm run db:setup` applies the migrations (`migrate deploy`).
- [`web/lib/db.ts`](../../web/lib/db.ts) picks the matching driver adapter from the URL.

The generated client is specific to one provider. After switching databases, run `npm run db:setup` (and rebuild).

The schema sticks to what both databases support:
- no native column types;
- integer auto-increment ids only;
- no `createMany({ skipDuplicates })`. "Insert unless it exists" is `insertOnce()`, which treats a unique-key
  conflict (P2002) as "already there".

CI checks that the migrations match the schema on a real Postgres (`prisma migrate diff --exit-code`).

## What needs an account

The most valuable part, studying lessons, lives on the server. Exploring stays open to everyone.

| Feature | Guest | Signed in | Where it lives |
|---|---|---|---|
| Globe, Solar System and deep space, sky theatre, encyclopedia pages, tours | ✓ | ✓ | client |
| Games (Place it!, Quiz, Daily Planet) | ✓ | ✓ | client |
| Stickers, passport, game records | ✓ on the device | ✓ synced across devices | client + `ProgressSnapshot` |
| Likes and "I've been there" counts | ✓ (visitor cookie) | ✓ | `Reaction` |
| Lessons: the four free tasters (`shape`, `graticule`, `a-sun-moon`, `a-phases`) | ✓ graded, not kept | ✓ kept | server |
| Lessons: the full geography and astronomy courses (112 lessons) | — (sign-in prompt) | ✓ | server |
| Quiz grading and lab-task checks | server (free lessons) | server, recorded per answer | `QuizAttempt`, `QuizAnswer`, `LabTaskCompletion` |
| Best scores, completion, time spent, "done" marks in the picker | — | ✓ | `LessonProgress` |
| Learning dashboard (`/account`): totals, courses, recent lessons, 28-day activity, streak | — | ✓ | `LearningEvent` + the tables above |
| Daily Planet history and streak | — | ✓ | `DailyResult` |
| Nickname, guestbook posts | — | ✓ | `User.handle`, `GuestbookEntry` |
| Reporting a guestbook note | ✓ | ✓ | `GuestbookReport` (one per visitor; 3 hide it) |
| Export or delete my data | local backup | ✓ account deletion removes everything (cascade) | |

### Why lessons are on the server
Lesson content (text, figures, quizzes with their answers, and the lab rules) is code in
`src/client/lessons/**`, but **only the server imports it**.
- The client gets each lesson in a wire format ([`src/shared/lessons/wire.ts`](../../src/shared/lessons/wire.ts)):
  - figures are pre-rendered to SVG;
  - choices are shuffled per question;
  - there are no answers and no functions.
- Answers and lab slider values are posted back and checked by the engine
  ([`src/server/lessons.ts`](../../src/server/lessons.ts)). The response gives the right answer to reveal.
- A run's score is counted from the recorded answers. Only the first answer to each question counts, and the score
  the client sends is ignored.
- A unit test walks the client's import graph from `main.ts` to make sure it never reaches lesson content. The
  belt and fold models the 3D kits share live in `lessons/models.ts` for that reason.
- With `DEV_LOGIN=1` (tests only), lessons also carry `dev` answer keys, and `/api/dev/lab` solves a lab task.

## Data model

```
User ─┬─ Account / Session            NextAuth (VerificationToken holds magic links, hashed)
      ├─ ProgressSnapshot              the explorer's collections (JSON, merged conflict-free with each device)
      ├─ LessonProgress (user, lesson) status, stepReached/steps, best/last score, completions, time spent
      ├─ QuizAttempt ── QuizAnswer     one run; answers keyed (attempt, index): the first answer wins
      ├─ LabTaskCompletion             (user, lesson, step, task)
      ├─ LearningEvent                 activity log: lesson.start, lesson.finish, daily…
      ├─ DailyResult (user, day)       the first result of a puzzle day stands
      └─ GuestbookEntry ── GuestbookReport
Reaction (visitor, item, kind)         anonymous
```

`User.role` (`LEARNER`, `TEACHER`, `ADMIN`) is in place for classes (see the roadmap below).

## API

All writes are JSON `POST`/`PUT`/`DELETE`, and their `Origin` must match the host. Responses are `no-store`.

| Route | Who | What |
|---|---|---|
| `GET /api/health` | all | database check |
| `/api/auth/*` | all | NextAuth (csrf, signin, callback, signout, session); rate-limited per IP and per address |
| `GET /api/me` · `DELETE /api/me` | user | who am I · delete the account and everything in it |
| `PUT /api/profile` | user | nickname (unique, filtered) |
| `GET/PUT /api/progress` | user | collections sync (merge) |
| `GET /api/lessons?subject=geo\|astro` | all | catalogue: courses, lessons, `free`, and the learner's marks |
| `POST /api/lessons/:id/start` | all (free) / user | the lesson in wire format, plus an attempt id when signed in. "Where I live" lessons take `home` |
| `POST /api/lessons/:id/answer` | as above | grade one answer → `{ ok, why, reveal }` (240/min) |
| `POST /api/lessons/:id/lab` | as above | check a lab's slider values → `{ done: boolean[] }` (600/min) |
| `POST /api/lessons/:id/step` | user | furthest step reached |
| `POST /api/lessons/:id/finish` | all / user | score, best, key points; recorded for users (idempotent) |
| `GET/POST /api/daily` | user | Daily Planet history · record today's result (day ±1, first one stands) |
| `GET /api/me/stats` | user | dashboard data |
| `GET/POST /api/reactions` | all | like / visited counts and toggles |
| `GET/POST /api/guestbook` · `POST /api/guestbook/:id/report` | all / user | notes (5 posts/min) · flag a note |
| `/api/dev/mailbox`, `/api/dev/lab` | `DEV_LOGIN=1` only | the last magic link for an address · a lab solution (tests) |

Pages: `/signin` (email + providers) and `/account` (the learning dashboard). Both are server-rendered, in English or
Chinese (`?lang=`, else the browser's language).

## Running it

```bash
npm install
npm run db:setup     # SQLite at .data/terrastra.db (or Postgres if DATABASE_URL says so)
npm run dev:web      # Next on :3000 (API, /signin, /account)
npm run dev          # Vite on :5173 with hot reload; proxies /api, /signin, /account to :3000
```

In development, sign-in links are kept in memory and shown in the account card as "dev sign-in" when `DEV_LOGIN=1`.
Otherwise they are logged.

Production:
- `npm run build:web && npm start`, with `DATABASE_URL` (Postgres), `NEXTAUTH_URL`, `NEXTAUTH_SECRET` and a mail
  transport;
- or `docker compose --profile app up --build` (Postgres, then migrations, then the app on :3000).

Tests:
- `npm test`: the engine, rules, mail, and the client import guard.
- `npm run test:e2e`: the built app on a fresh SQLite database, signing in through the dev mailbox.
- CI also runs [`scripts/smoke-api.ts`](../../scripts/smoke-api.ts) against the built server on Postgres.

## Roadmap
1. **Classes**: teachers (`role = TEACHER`) create a class with a join code, assign lessons, and see each pupil's
   progress.
2. **Spaced review**: questions answered wrongly come back a few days later. The data is already in `QuizAnswer`.
3. **Certificates** for finished courses, and badges from `LearningEvent`.
4. **Parental controls**: a parent's email confirms a child's account. Also data export.
