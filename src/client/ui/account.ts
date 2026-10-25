import { h, openModal, closeModal, toast } from './dom.ts';
import { t, lang } from '../lib/i18n.ts';
import { icon } from './icons.ts';
import { api } from '../lib/api.ts';
import { url } from '../lib/env.ts';
import { store, setMe, replaceProgress, subscribe } from '../store.ts';
import { mergeProgress } from '../../shared/lib/progress.ts';

export async function syncNow(quiet = false): Promise<boolean> {
  if (!store.me) return false;
  try {
    const { progress } = await api.syncProgress(store.progress);
    replaceProgress(mergeProgress(store.progress, progress));
    if (!quiet) toast(t('synced'));
    return true;
  } catch {
    if (!quiet) toast(t('offline'));
    return false;
  }
}

/** The account card; a sign-in link from it brings the learner back to the hash route `back`. */
export function openAccount(back = 'signed-in'): void {
  const body = h('div', { class: 'account', 'data-testid': 'account' });
  const render = () => {
    const me = store.me;
    if (!me) {
      const email = h('input', { type: 'email', required: true, autocomplete: 'email', 'aria-label': t('emailLabel'), placeholder: 'name@example.com', 'data-testid': 'email' });
      const out = h('div', { class: 'out', 'aria-live': 'polite' });
      body.replaceChildren(h('p', { class: 'muted' }, t('signInSub')),
        h('form', { class: 'row', onsubmit: async (e: Event) => {
          e.preventDefault();
          try {
            const r = await api.requestLink(email.value.trim(), back);
            out.replaceChildren(...[h('p', {}, t('linkSent')),
              r.devLink ? h('p', { class: 'small' }, t('devLink') + ': ', h('a', { href: r.devLink, 'data-testid': 'dev-link' }, t('signIn'))) : null].filter((x): x is HTMLParagraphElement => !!x));
          } catch (err) { out.replaceChildren(h('p', { class: 'error' }, (err as Error).message || t('offline'))); }
        } }, email, h('button', { class: 'cta', type: 'submit', 'data-testid': 'send-link' }, t('sendLink'))), out,
        h('p', { class: 'small' }, h('a', { class: 'link', href: url(`signin?lang=${lang()}&callbackUrl=${encodeURIComponent('/#' + back)}`), 'data-testid': 'signin-page' }, t('moreSignIn'))));
      return;
    }
    const handle = h('input', { value: me.handle ?? '', maxlength: 16, pattern: '[A-Za-z0-9_\\u4E00-\\u9FFF]{2,16}', 'aria-label': t('handle'), title: t('handleRule'), 'data-testid': 'handle' });
    body.replaceChildren(
      h('div', { class: 'acct-who' }, h('span', { class: 'acct-av', html: icon('user', 18) }),
        h('div', {}, h('small', { class: 'muted' }, t('account')), h('strong', {}, me.email))),
      h('form', { class: 'acct-field', onsubmit: async (e: Event) => {
        e.preventDefault();
        try { const r = await api.setHandle(handle.value.trim()); setMe(r.user); toast('✓'); } catch (err) { toast((err as Error).message); }
      } }, h('label', {}, h('span', {}, t('handle')), h('div', { class: 'acct-input' }, handle, h('button', { class: 'pill', type: 'submit' }, t('saveBtn')))),
        h('small', { class: 'muted' }, t('handleRule'))),
      h('a', { class: 'cta acct-dash', href: url(`account?lang=${lang()}`), 'data-testid': 'my-learning', html: icon('book', 15) }, h('span', {}, t('myLearning'))),
      h('div', { class: 'acct-actions' },
        h('button', { class: 'pill', 'data-testid': 'sync-now', onclick: () => void syncNow() }, h('span', { html: icon('reset', 15) }), t('syncNow')),
        h('button', { class: 'pill', 'data-testid': 'sign-out', onclick: async () => { try { await api.logout(); } catch { /* ignore */ } setMe(null); toast(t('signedOut')); render(); } }, t('signOut'))),
      h('button', { class: 'link danger acct-delete', 'data-testid': 'delete-account', onclick: async () => {
        if (!confirm(t('deleteConfirm'))) return;
        try { await api.deleteAccount(); setMe(null); closeModal('account'); toast(t('signedOut')); } catch (err) { toast((err as Error).message); }
      } }, t('deleteAccount')));
  };
  render();
  let shownFor = store.me?.id ?? null;
  const unsub = subscribe(() => { const id = store.me?.id ?? null; if (id !== shownFor) { shownFor = id; render(); } });
  openModal('account', t('account'), body, { onClose: unsub });
}

export async function openGuestbook(): Promise<void> {
  const list = h('ul', { class: 'gb-list', 'data-testid': 'gb-list' }, h('li', { class: 'muted' }, '…'));
  const load = async () => {
    try {
      const { entries } = await api.guestbook();
      list.replaceChildren(...(entries.length ? entries.map(e => h('li', {},
        h('div', { class: 'gb-head' }, h('strong', {}, e.handle), h('time', { datetime: e.created_at }, new Date(e.created_at + (e.created_at.endsWith('Z') ? '' : 'Z')).toLocaleDateString()),
          h('button', { class: 'link small', 'aria-label': t('report'), onclick: async () => { try { await api.report(e.id); toast(t('reported')); } catch { toast(t('offline')); } }, html: icon('flag', 14) })),
        h('p', {}, e.body))) : [h('li', { class: 'muted' }, t('gbEmpty'))]));
    } catch { list.replaceChildren(h('li', { class: 'muted' }, t('offline'))); }
  };
  const form = store.me
    ? (() => {
      const ta = h('textarea', { maxlength: 200, rows: 2, placeholder: t('gbPlaceholder'), 'aria-label': t('gbPlaceholder'), 'data-testid': 'gb-text' });
      return h('form', { class: 'gb-form', onsubmit: async (e: Event) => {
        e.preventDefault();
        const v = ta.value.trim();
        if (!v) return;
        try { await api.post(v); ta.value = ''; await load(); } catch (err) { toast((err as Error).message); }
      } }, ta, h('button', { class: 'cta', type: 'submit', 'data-testid': 'gb-post' }, t('post')));
    })()
    : h('p', { class: 'muted' }, t('gbNeedLogin'), ' ', h('button', { class: 'link', onclick: () => { closeModal('guestbook'); openAccount(); } }, t('signIn')));
  openModal('guestbook', t('guestbook'), h('div', { class: 'guestbook' }, form, list));
  await load();
}

