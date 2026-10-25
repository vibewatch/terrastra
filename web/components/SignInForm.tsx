'use client';
import { signIn } from 'next-auth/react';
import { useState } from 'react';

type T = Record<'email' | 'send' | 'sending' | 'sent' | 'or' | 'with' | 'devLink' | 'failed', string>;

/** E-mail link sign-in (and OAuth buttons when the server has them). */
export function SignInForm({ t, email: hasEmail, oauth, callbackUrl, dev }: {
  t: T; email: boolean; oauth: { id: string; name: string }[]; callbackUrl: string; dev: boolean;
}) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle');
  const [devUrl, setDevUrl] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('busy');
    const r = await signIn('email', { email, callbackUrl, redirect: false }).catch(() => undefined);
    if (!r || r.error) { setState('error'); return; }
    setState('sent');
    if (dev) {
      const m = await fetch(`/api/dev/mailbox?email=${encodeURIComponent(email.trim().toLowerCase())}`).then(x => (x.ok ? x.json() : null)).catch(() => null);
      if (m?.url) setDevUrl(m.url);
    }
  }

  return (
    <>
      {hasEmail && (
        <form onSubmit={submit}>
          <div>
            <label htmlFor="email">{t.email}</label>
            <input id="email" type="email" required autoComplete="email" autoFocus maxLength={254} placeholder="you@example.com"
              value={email} onChange={e => { setEmail(e.target.value); if (state !== 'busy') setState('idle'); }} />
          </div>
          <button className="btn primary block" type="submit" disabled={state === 'busy'}>{state === 'busy' ? t.sending : t.send}</button>
        </form>
      )}
      {state === 'sent' && <p className="note ok" role="status">{t.sent}</p>}
      {state === 'error' && <p className="note err" role="alert">{t.failed}</p>}
      {devUrl && <p className="note"><a data-testid="dev-link" href={devUrl}>{t.devLink}</a></p>}
      {oauth.length > 0 && hasEmail && <div className="or">{t.or}</div>}
      {oauth.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          {oauth.map(p => (
            <button key={p.id} className="btn block" type="button" onClick={() => signIn(p.id, { callbackUrl })}>{t.with} {p.name}</button>
          ))}
        </div>
      )}
    </>
  );
}
