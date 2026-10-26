/**
 * Serves a static build (`dist`) below a sub-path, the way GitHub Pages does: `/terrastra/…`.
 * Used by the static smoke tests (playwright.static.config.ts). No API: /api/* is a 404, like Pages.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

const PORT = Number(process.env.PORT ?? 8791);
const BASE = process.env.BASE_PATH ?? '/terrastra/';
const ROOT = join(import.meta.dirname, '..', 'dist');
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json',
};

createServer(async (req, res) => {
  let path: string;
  try { path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname); } catch { res.writeHead(400).end('bad path'); return; }
  if (!path.startsWith(BASE)) { res.writeHead(404).end('outside base'); return; }
  let file = normalize(join(ROOT, path.slice(BASE.length)));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
  } catch { res.writeHead(404).end('not found'); }
}).listen(PORT, () => console.log(`static ${BASE} on :${PORT}`));
