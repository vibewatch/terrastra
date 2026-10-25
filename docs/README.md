# Terrastra: documentation

| Area | Document | What it covers |
|---|---|---|
| Research | [Exploration report](research/exploration-report.md) | Reference product (myearthtoy.com): routes, screens, data flows, edge cases, coverage |
| Product | [PRD](product/prd.md) | Goals, users, features F1–F15, non-goals, success metrics |
| Product | [Spec](product/spec.md) | Behaviour and constants per feature, API contract, static pages |
| Product | [Acceptance criteria](product/acceptance-criteria.md) | Given/When/Then, each mapped to an automated test |
| Product | [Feature parity](product/feature-parity.md) | Reference vs Terrastra, capability by capability |
| Architecture | [ADRs](architecture/adr.md) | Architecture decision records (ADR-001 to ADR-032) |
| Architecture | [Architecture & data model](architecture/architecture-and-data-model.md) | Modules, storage keys, SQLite schema, data flows, security |
| Architecture | [Accounts and the learning server](architecture/accounts.md) | Next.js + NextAuth + Prisma, guest vs signed-in features, data model, API |
| Planning | [Implementation plan](planning/implementation-plan.md) | Milestones M0–M12 with exit criteria |
| Planning | [Backlog](planning/backlog.md) | Done tasks T-01…T-24 and open items B-01…B-17 with priority and size |

**Current priorities:** [现状评估与分级改进路线图（2026-10）](planning/improvement-roadmap-2026-10.md) — verified issues, P0–P3 improvements, feature proposals, dependencies and acceptance gates. The original PRD and backlog describe the MVP; they are historical planning, not a current feature inventory.

Suggested reading order: exploration report, PRD, ADRs, architecture, spec, then acceptance criteria.

`assets/screenshots/` holds screenshots of Terrastra written by the e2e suite (`npm run test:e2e`). Reference-site screenshots live in [`../research/screenshots/`](../research/screenshots/).
