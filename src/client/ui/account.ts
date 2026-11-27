import { h, openModal, closeModal, confetti, toast } from './dom.ts';
import { t } from '../lib/i18n.ts';
import { icon } from './icons.ts';
import { api } from '../lib/api.ts';
import {
  store,
  setMe,
  setBilling,
  effectivePlan,
  readLocalExtras,
  applyRemoteExtras,
  clearLocalExtras,
  getAccountEpoch,
  replaceProgress,
  subscribe,
  ProgressLimitError,
} from '../store.ts';
import { HANDLE_PATTERN } from '../../shared/lib/profile.ts';
import { emptyProgress, fitProgress, MAX_SYNC_REQUEST_BYTES, mergeProgress } from '../../shared/lib/progress.ts';
import { fitSyncExtras } from '../../shared/lib/sync-extras.ts';
import { maskRedeemCode } from '../../shared/lib/entitlements.ts';
import { getPendingRedeemCode, openPaywall, planLabel, redeemAndRefresh, redeemErrorMessage } from './paywall.ts';

export async function syncNow(quiet = false): Promise<boolean> {
  if (!store.me) return false;
  const epoch = getAccountEpoch();
  try {
    // trimmed the same way the server trims, so an oversized local record still syncs instead of failing forever
    const fitted = fitProgress(store.progress);
    const extras = fitSyncExtras(fitted, readLocalExtras(), MAX_SYNC_REQUEST_BYTES);
    const withExtrasBytes = new TextEncoder().encode(JSON.stringify({ progress: fitted, extras })).byteLength;
    const res = await api.syncProgress(fitted, withExtrasBytes <= MAX_SYNC_REQUEST_BYTES ? extras : undefined);
    if (getAccountEpoch() !== epoch) return false;
    replaceProgress(fitProgress(mergeProgress(store.progress, res.progress)));
    if (res.extras) applyRemoteExtras(res.extras);
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
    const pendingRedeem = getPendingRedeemCode();
    if (!me) {
      const email = h('input', { type: 'email', required: true, autocomplete: 'email', 'aria-label': t('emailLabel'), placeholder: 'name@example.com', 'data-testid': 'email' });
      const out = h('div', { class: 'out', 'aria-live': 'polite' });
      body.replaceChildren(
        ...(pendingRedeem
          ? [h('p', { class: 'small', 'data-testid': 'acct-pending-code', style: 'margin:0 0 8px;color:var(--sig,#ffb547)' },
              '🔑 ', t('redeemPendingNotice', { code: maskRedeemCode(pendingRedeem) ?? pendingRedeem }))]
          : []),
        h('p', { class: 'muted' }, t('signInSub')),
        h('form', { class: 'row', onsubmit: async (e: Event) => {
          e.preventDefault();
          try {
            const r = await api.requestLink(email.value.trim());
            out.replaceChildren(...[h('p', {}, t('linkSent')),
              r.devLink ? h('p', { class: 'small' }, t('devLink') + ': ', h('a', { href: r.devLink, 'data-testid': 'dev-link' }, t('signIn'))) : null].filter((x): x is HTMLParagraphElement => !!x));
          } catch (err) { out.replaceChildren(h('p', { class: 'error' }, (err as Error).message || t('offline'))); }
        } }, email, h('button', { class: 'cta', type: 'submit', 'data-testid': 'send-link' }, t('sendLink'))),
        out,
        h('div', { style: 'margin-top:10px' },
          h('button', { class: 'link small', 'data-testid': 'acct-compare-plans', onclick: () => { closeModal('account'); openPaywall(); } }, '✨ ', t('planCompare'))));
      return;
    }
    const signOut = async (clear: boolean) => {
      try {
        // flush anything not yet synced, so clearing this device cannot lose it
        if (clear && !(await syncNow(true))) { toast(t('offline')); return; }
        await api.logout();
        setMe(null);
        if (clear) {
          clearLocalExtras();
          replaceProgress(emptyProgress());
        }
        toast(t(clear ? 'signedOutCleared' : 'signedOut'));
      } catch (err) { toast((err as Error).message || t('offline')); }
    };
    const signOutAsk = h('div', { class: 'acct-signout-ask', role: 'group', 'aria-label': t('signOut'), 'data-testid': 'sign-out-ask', hidden: true },
      h('p', { class: 'muted' }, t('signOutAsk')),
      h('div', { class: 'row' },
        h('button', { class: 'cta', 'data-testid': 'sign-out-clear', onclick: () => void signOut(true) }, t('signOutClear')),
        h('button', { class: 'pill', 'data-testid': 'sign-out-keep', onclick: () => void signOut(false) }, t('signOutKeep'))));
    const handle = h('input', { value: me.handle ?? '', maxlength: 16, pattern: HANDLE_PATTERN, 'aria-label': t('handle'), title: t('handleRule'), 'data-testid': 'handle' });
    const curPlan = effectivePlan();
    const otherDevices = Math.max(0, store.billing.activeSessions - 1);
    const orders = store.billing.orders ?? [];
    const codeInput = h('input', {
      type: 'text',
      required: true,
      maxlength: 32,
      value: pendingRedeem ?? '',
      autocapitalize: 'characters',
      spellcheck: 'false',
      placeholder: t('redeemPlaceholder'),
      'aria-label': t('redeemTitle'),
      'data-testid': 'acct-redeem-input',
    }) as HTMLInputElement;
    const redeemBtn = h('button', { class: 'pill', type: 'submit', 'data-testid': 'acct-redeem-btn' }, t('redeemBtn')) as HTMLButtonElement;
    const codeOut = h('small', { class: 'error', 'data-testid': 'acct-redeem-error', hidden: true });
    let redeeming = false;
    const planBox = h('section', { class: 'acct-plan-box', 'data-testid': 'acct-plan-box' },
      h('div', { class: 'acct-plan-top' },
        h('div', {},
          h('small', { class: 'muted' }, t('planLabel') + ': '),
          h('span', { class: `plan-pill ${curPlan}`, 'data-testid': 'acct-plan-pill' }, planLabel(curPlan))),
        store.billing.activeSessions > 0
          ? h('small', { class: 'muted', 'data-testid': 'acct-session-cap' },
              t('planDevices', { n: store.billing.activeSessions, cap: store.billing.maxSessions }))
          : null,
        otherDevices > 0
          ? h('button', {
              class: 'link small',
              'data-testid': 'acct-logout-others',
              onclick: async () => {
                try {
                  const res = await api.logoutOthers();
                  setBilling({ ...store.billing, activeSessions: res.activeSessions });
                  toast(t('acctSignedOutOthers', { n: res.revoked }));
                } catch (err) {
                  toast((err as Error).message || t('offline'));
                }
              },
            }, t('acctSignOutOthers', { n: otherDevices }))
          : null,
        h('button', { class: 'link small', 'data-testid': 'acct-compare-plans', onclick: () => { closeModal('account'); openPaywall(); } }, t('planCompare'))),
      h('form', {
        class: 'redeem-row',
        'data-testid': 'acct-redeem-form',
        onsubmit: async (e: Event) => {
          e.preventDefault();
          if (redeeming) return;
          const raw = codeInput.value.trim();
          if (!raw) return;
          redeeming = true;
          redeemBtn.disabled = true;
          redeemBtn.textContent = t('redeemActivating');
          codeOut.hidden = true;
          try {
            const unlocked = await redeemAndRefresh(raw);
            codeInput.value = '';
            confetti(40);
            toast(t('redeemSuccess', { plan: planLabel(unlocked) }), 4000);
            render();
          } catch (err) {
            codeOut.textContent = redeemErrorMessage(err);
            codeOut.hidden = false;
          } finally {
            redeeming = false;
            if (redeemBtn.isConnected) {
              redeemBtn.disabled = false;
              redeemBtn.textContent = t('redeemBtn');
            }
          }
        },
      }, codeInput, redeemBtn),
      codeOut,
      orders.length > 0
        ? h('div', { class: 'acct-orders', 'data-testid': 'acct-orders' },
            h('small', { class: 'muted' }, t('acctReceiptsTitle')),
            ...orders.slice(0, 3).map(o => h('div', { class: 'acct-order-row small', 'data-testid': 'acct-order-row' },
              h('span', {}, `${planLabel(o.plan)} · ${new Date(o.paidAt ?? o.createdAt).toLocaleDateString()}`),
              h('code', { class: 'muted' }, o.id),
              h('span', { class: o.status === 'paid' ? 'ok' : 'muted' }, o.status === 'paid' ? t('acctOrderPaid') : t('acctOrderRefunded')))))
        : null);
    body.replaceChildren(
      h('div', { class: 'acct-who' }, h('span', { class: 'acct-av', html: icon('user', 18) }),
        h('div', {}, h('small', { class: 'muted' }, t('account')), h('strong', {}, me.email))),
      planBox,
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
        h('button', { class: 'pill', 'data-testid': 'sign-out', 'aria-expanded': 'false', onclick: (e: Event) => {
          // On a shared device the next child's sign-in would merge this child's stamps into their account, so ask.
          const btn = e.currentTarget as HTMLButtonElement;
          btn.setAttribute('aria-expanded', 'true');
          signOutAsk.hidden = false;
          (signOutAsk.querySelector('button') as HTMLButtonElement | null)?.focus();
        } }, t('signOut'))),
      signOutAsk,
      h('button', { class: 'link danger acct-delete', 'data-testid': 'delete-account', onclick: async () => {
        if (!confirm(t('deleteConfirm'))) return;
        try {
          await api.deleteAccount();
          setMe(null);
          clearLocalExtras();
          replaceProgress(emptyProgress());
          closeModal('account');
          toast(t('signedOutCleared'));
        } catch (err) { toast((err as Error).message); }
      } }, t('deleteAccount')));
  };
  render();
  const stateSig = () => `${store.me?.id ?? 'none'}:${effectivePlan()}:${store.billing.activeSessions}:${store.billing.orders?.length ?? 0}`;
  let shownFor = stateSig();
  const unsub = subscribe(() => {
    const sig = stateSig();
    if (sig !== shownFor) { shownFor = sig; render(); }
  });
  if (store.me) void api.billingStatus().then(st => { if (st) setBilling(st); }).catch(() => {});
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
