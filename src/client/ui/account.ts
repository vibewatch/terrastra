import { h, openModal, closeModal, toast } from './dom.ts';
import { t } from '../lib/i18n.ts';
import { icon } from './icons.ts';
import { api } from '../lib/api.ts';
import { store, setMe, getAccountEpoch, replaceProgress, subscribe, ProgressLimitError } from '../store.ts';
import { HANDLE_PATTERN } from '../../shared/lib/profile.ts';
import { mergeProgress } from '../../shared/lib/progress.ts';

export async function syncNow(quiet = false): Promise<boolean> {
  if (!store.me) return false;
  const epoch = getAccountEpoch();
  try {
    const { progress } = await api.syncProgress(store.progress);
    if (getAccountEpoch() !== epoch) return false;
    replaceProgress(mergeProgress(store.progress, progress));
    if (!quiet) toast(t('synced'));
    return true;
  } catch (err) {
    if (err instanceof ProgressLimitError) toast(t('syncLimit'), 4000);
    else if (!quiet || (err instanceof Error && !(err instanceof TypeError))) toast(err instanceof Error && !(err instanceof TypeError) && err.message ? err.message : t('offline'));
    return false;
  }
}

export function openAccount(): void {
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
            const r = await api.requestLink(email.value.trim());
            out.replaceChildren(...[h('p', {}, t('linkSent')),
              r.devLink ? h('p', { class: 'small' }, t('devLink') + ': ', h('a', { href: r.devLink, 'data-testid': 'dev-link' }, t('signIn'))) : null].filter((x): x is HTMLParagraphElement => !!x));
          } catch (err) { out.replaceChildren(h('p', { class: 'error' }, (err as Error).message || t('offline'))); }
        } }, email, h('button', { class: 'cta', type: 'submit', 'data-testid': 'send-link' }, t('sendLink'))), out);
      return;
    }
    const handle = h('input', { value: me.handle ?? '', maxlength: 16, pattern: HANDLE_PATTERN, 'aria-label': t('handle'), title: t('handleRule'), 'data-testid': 'handle' });
    body.replaceChildren(
      h('div', { class: 'acct-who' }, h('span', { class: 'acct-av', html: icon('user', 18) }),
        h('div', {}, h('small', { class: 'muted' }, t('account')), h('strong', {}, me.email))),
      h('form', { class: 'acct-field', onsubmit: async (e: Event) => {
        e.preventDefault();
        const epoch = getAccountEpoch();
        try {
          const r = await api.setHandle(handle.value.trim());
          if (getAccountEpoch() !== epoch) return;
          setMe(r.user); toast('✓');
        } catch (err) { if (getAccountEpoch() === epoch) toast((err as Error).message); }
      } }, h('label', {}, h('span', {}, t('handle')), h('div', { class: 'acct-input' }, handle, h('button', { class: 'pill', type: 'submit' }, t('saveBtn')))),
        h('small', { class: 'muted' }, t('handleRule'))),
      h('div', { class: 'acct-actions' },
        h('button', { class: 'cta', 'data-testid': 'sync-now', onclick: () => void syncNow() }, h('span', { html: icon('reset', 15) }), t('syncNow')),
        h('button', { class: 'pill', 'data-testid': 'sign-out', onclick: async () => {
          try { await api.logout(); setMe(null); toast(t('signedOut')); } catch (err) { toast((err as Error).message || t('offline')); }
        } }, t('signOut'))),
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
