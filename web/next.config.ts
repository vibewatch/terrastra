import type { NextConfig } from 'next';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository root: the app imports lesson content and shared code from `../src`. */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The repository's `.env` (Next itself only reads `web/.env*`), and the database: a relative SQLite path (the local
// default) is from the repository root, as in `prisma/env.ts`.
try { process.loadEnvFile(resolve(root, '.env')); } catch { /* no .env */ }
const dbUrl = process.env.DATABASE_URL || 'file:./.data/terrastra.db';
if (dbUrl.startsWith('file:') && dbUrl !== 'file::memory:') {
  const path = dbUrl.slice('file:'.length), abs = isAbsolute(path) ? path : resolve(root, path);
  mkdirSync(dirname(abs), { recursive: true });
  process.env.DATABASE_URL = `file:${abs}`;
} else process.env.DATABASE_URL = dbUrl;

const security = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
];

export default {
  // The Docker image runs the self-contained server; `next start` (npm start, tests, CI) needs the regular output.
  ...(process.env.NEXT_STANDALONE === '1' ? { output: 'standalone' as const } : {}),
  outputFileTracingRoot: root,
  turbopack: { root },
  poweredByHeader: false,
  // Type-checked by `npm run typecheck` (the repository's TypeScript), not during `next build`.
  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [
      { source: '/:path*', headers: security },
      { source: '/assets/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    ];
  },
  // The globe app is the Vite build, copied into `public/` (`npm run build:web`): its pages are `…/index.html` files.
  async rewrites() {
    return {
      beforeFiles: [{ source: '/', destination: '/index.html' }],
      afterFiles: [],
      fallback: [{ source: '/:path((?!api/|_next/).*)', destination: '/:path/index.html' }],
    };
  },
} satisfies NextConfig;
