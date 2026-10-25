'use client';
import { signOut } from 'next-auth/react';
import { useState } from 'react';

/** Sign out, and delete the account (with everything recorded under it). */
export function AccountActions({ t }: { t: Record<'signOut' | 'del' | 'confirm' | 'failed', string> }) {
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!confirm(t.confirm)) return;
    setBusy(true);
    const r = await fetch('/api/me', { method: 'DELETE' }).catch(() => null);
    if (r?.ok) location.href = '/'; else { setBusy(false); alert(t.failed); }
  }
  return (
    <>
      <button className="btn" type="button" onClick={() => signOut({ callbackUrl: '/' })}>{t.signOut}</button>
      <button className="btn danger" type="button" disabled={busy} onClick={del}>{t.del}</button>
    </>
  );
}
