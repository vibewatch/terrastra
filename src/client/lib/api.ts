import type { Progress } from '../../shared/lib/progress.ts';
import { HAS_API, url } from './env.ts';

export interface Me { id: number; email: string; handle: string | null }
interface GuestbookEntry { id: number; handle: string; body: string; created_at: string }

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = ((await res.json()) as { error?: string }).error ?? msg; } catch { /* not json */ }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}
const opt = (method: string, body?: unknown): RequestInit => ({ method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });

export const api = {
  async me(): Promise<Me | null> { if (!HAS_API) return null; try { return (await j<{ user: Me | null }>(await fetch(url('api/me'), opt('GET')))).user; } catch { return null; } },
  requestLink: async (email: string) => j<{ ok: true; devLink?: string }>(await fetch(url('api/auth/request'), opt('POST', { email }))),
  logout: async () => j<{ ok: true }>(await fetch(url('api/auth/logout'), opt('POST', {}))),
  setHandle: async (handle: string) => j<{ user: Me }>(await fetch(url('api/profile'), opt('PUT', { handle }))),
  deleteAccount: async () => j<{ ok: true }>(await fetch(url('api/me'), opt('DELETE'))),
  getProgress: async () => j<{ progress: Progress | null }>(await fetch(url('api/progress'), opt('GET'))),
  syncProgress: async (p: Progress) => j<{ progress: Progress }>(await fetch(url('api/progress'), opt('PUT', { progress: p }))),
  reactions: async (key: string) => j<{ like: number; visited: number }>(await fetch(url('api/reactions?key=' + encodeURIComponent(key)), opt('GET'))),
  react: async (key: string, kind: 'like' | 'visited', on: boolean) => j<{ like: number; visited: number }>(await fetch(url('api/reactions'), opt('POST', { key, kind, on }))),
  guestbook: async () => j<{ entries: GuestbookEntry[] }>(await fetch(url('api/guestbook'), opt('GET'))),
  post: async (body: string) => j<{ entry: GuestbookEntry }>(await fetch(url('api/guestbook'), opt('POST', { body }))),
  report: async (id: number) => j<{ ok: true }>(await fetch(url(`api/guestbook/${id}/report`), opt('POST', {}))),
};
