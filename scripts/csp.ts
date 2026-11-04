import { createHash } from 'node:crypto';

/** Hash each generated page's inline scripts after all build-time rewriting. */
export function withContentPolicy(html: string): string {
  const clean = html.replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*">/gi, '');
  const hashes = [...clean.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter(([, attrs]) => !/\bsrc\s*=/i.test(attrs))
    .map(([, , script]) => `'sha256-${createHash('sha256').update(script).digest('base64')}'`);
  const policy = [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https: http:",
    "font-src 'self' data:",
    "connect-src 'self' https: http: blob:",
    "media-src 'self' https: http: blob:",
    "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  if (!/<head>/i.test(clean)) throw new Error('Cannot add content policy to a page without a head');
  return clean.replace(/<head>/i, `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`);
}
