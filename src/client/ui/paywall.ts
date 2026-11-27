/** Reusable bilingual Pro / Classroom comparison and activation-code redemption modal. */
import { h, openModal, closeModal, confetti, toast } from './dom.ts';
import { icon } from './icons.ts';
import { t } from '../lib/i18n.ts';
import { FULL_APP_URL, HAS_API } from '../lib/env.ts';
import { ApiError, api } from '../lib/api.ts';
import { store, setMe, setBilling, effectivePlan } from '../store.ts';
import {
  PLANS,
  extractRedeemCode,
  formatRedeemCodeInput,
  maskRedeemCode,
  normalizeRedeemCode,
  type Plan,
  type PlanSpec,
} from '../../shared/lib/entitlements.ts';

const PENDING_REDEEM_KEY = 'pp.pendingRedeem';

/** Saves a validated activation code in `sessionStorage` so it survives an email magic-link sign-in roundtrip. */
export function savePendingRedeemCode(raw: string): string | null {
  const norm = extractRedeemCode(raw);
  if (!norm) return null;
  try { sessionStorage.setItem(PENDING_REDEEM_KEY, norm); } catch { /* private mode */ }
  return norm;
}

/** Wires smart clipboard extraction (for full `#redeem=...` links/messages) and hyphen auto-formatting onto a code input. */
export function wireRedeemInput(input: HTMLInputElement): HTMLInputElement {
  input.addEventListener('paste', (e: ClipboardEvent) => {
    const pasted = e.clipboardData?.getData('text') ?? '';
    const extracted = extractRedeemCode(pasted);
    if (extracted) {
      e.preventDefault();
      input.value = extracted;
    }
  });
  input.addEventListener('input', (e: Event) => {
    const ie = e as InputEvent;
    if (ie.inputType && ie.inputType.startsWith('delete')) return;
    const formatted = formatRedeemCodeInput(input.value);
    if (formatted !== input.value && formatted.length <= 32) {
      input.value = formatted;
    }
  });
  input.addEventListener('blur', () => {
    const extracted = extractRedeemCode(input.value);
    if (extracted) input.value = extracted;
  });
  return input;
}

export function getPendingRedeemCode(): string | null {
  try {
    const raw = sessionStorage.getItem(PENDING_REDEEM_KEY);
    return raw ? normalizeRedeemCode(raw) : null;
  } catch {
    return null;
  }
}

export function clearPendingRedeemCode(): void {
  try { sessionStorage.removeItem(PENDING_REDEEM_KEY); } catch { /* ignore */ }
}

export function planLabel(plan: Plan): string {
  return plan === 'classroom' ? t('planClassroom') : plan === 'pro' ? t('planPro') : t('planFree');
}

export function formatPlanPrice(spec: PlanSpec): string {
  return t('paywallPriceFmt', {
    earlyCny: spec.earlyBirdCny,
    cny: spec.priceCny,
    earlyUsd: spec.earlyBirdUsd,
    usd: spec.priceUsd,
  });
}

export function redeemErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'INVALID_CODE') return t('redeemErrInvalid');
    if (err.code === 'CODE_NOT_FOUND') return t('redeemErrNotFound');
    if (err.code === 'CODE_EXPIRED') return t('redeemErrExpired');
    if (err.code === 'CODE_ALREADY_USED') return t('redeemErrUsed');
    if (err.code === 'ALREADY_ENTITLED') return t('redeemErrAlready');
    if (err.code === 'AUTH_REQUIRED' || err.status === 401) return t('redeemSignInFirst');
    if (err.status === 429) return t('redeemErrRate');
    if (err.message) return err.message;
  }
  return err instanceof Error && !(err instanceof TypeError) && err.message ? err.message : t('offline');
}

export async function redeemAndRefresh(rawCode: string): Promise<Plan> {
  const trimmed = extractRedeemCode(rawCode) ?? rawCode.trim();
  let res;
  try {
    res = await api.redeemCode(trimmed);
  } catch (err) {
    if (
      err instanceof ApiError &&
      (err.code === 'CODE_ALREADY_USED' || err.code === 'ALREADY_ENTITLED') &&
      normalizeRedeemCode(trimmed) === getPendingRedeemCode()
    ) {
      clearPendingRedeemCode();
    }
    throw err;
  }
  if (normalizeRedeemCode(trimmed) === getPendingRedeemCode()) clearPendingRedeemCode();
  if (res.user) setMe(res.user);
  const status = await api.billingStatus().catch(() => null);
  if (status) setBilling(status);
  else {
    setBilling({
      ...store.billing,
      plan: res.entitlement.plan,
      maxSessions: res.entitlement.maxSessions,
      source: res.entitlement.source,
      grantedAt: res.entitlement.grantedAt,
    });
  }
  // Trigger a background sync so learning extras immediately back up under the newly unlocked plan.
  void import('./account.ts').then(m => m.syncNow(true)).catch(() => {});
  return res.entitlement.plan;
}

export function openPaywall(featureReason?: string, onUnlocked?: () => void): void {
  const pendingCode = getPendingRedeemCode();
  const codeInput = wireRedeemInput(h('input', {
    type: 'text',
    required: true,
    maxlength: 32,
    value: pendingCode ?? '',
    autocapitalize: 'characters',
    spellcheck: 'false',
    placeholder: t('redeemPlaceholder'),
    'aria-label': t('redeemTitle'),
    'data-testid': 'paywall-code-input',
  }) as HTMLInputElement);
  const submitBtn = h('button', { class: 'cta', type: 'submit', 'data-testid': 'paywall-redeem-btn' }, t('redeemBtn')) as HTMLButtonElement;
  const feedback = h('p', { class: 'small', 'aria-live': 'polite', 'data-testid': 'paywall-feedback', hidden: true });
  let busy = false;

  const redeemSection = !HAS_API
    ? h('div', { class: 'paywall-redeem', 'data-testid': 'paywall-demo-box' },
        h('p', { class: 'muted small', style: 'margin:0' }, t('paywallDemoNote')),
        FULL_APP_URL
          ? h('a', {
              class: 'cta',
              href: FULL_APP_URL,
              target: '_blank',
              rel: 'noopener noreferrer',
              'data-testid': 'paywall-open-full',
            }, t('paywallOpenFullBtn'))
          : null)
    : store.me
      ? h('form', {
          class: 'paywall-redeem',
          'data-testid': 'paywall-redeem-form',
          onsubmit: async (e: Event) => {
            e.preventDefault();
            if (busy) return;
            const v = codeInput.value.trim();
            if (!v) return;
            busy = true;
            submitBtn.disabled = true;
            submitBtn.textContent = t('redeemActivating');
            feedback.hidden = true;
            try {
              const unlockedPlan = await redeemAndRefresh(v);
              confetti(45);
              toast(t('redeemSuccess', { plan: planLabel(unlockedPlan) }), 4000);
              closeModal('paywall');
              onUnlocked?.();
            } catch (err) {
              feedback.className = 'small error';
              feedback.textContent = redeemErrorMessage(err);
              feedback.hidden = false;
            } finally {
              busy = false;
              submitBtn.disabled = false;
              submitBtn.textContent = t('redeemBtn');
            }
          },
        },
        h('strong', {}, h('span', { html: icon('key', 15) }), ' ', t('redeemTitle')),
        h('div', { class: 'redeem-row' }, codeInput, submitBtn),
        feedback)
      : h('div', { class: 'paywall-redeem', 'data-testid': 'paywall-signin-box' },
          pendingCode
            ? h('p', { class: 'small', 'data-testid': 'paywall-pending-code', style: 'margin:0;color:var(--sig,#ffb547)' },
                '🔑 ', t('redeemPendingNotice', { code: maskRedeemCode(pendingCode) ?? pendingCode }))
            : h('p', { class: 'muted small', style: 'margin:0' }, t('redeemSignInFirst')),
          h('div', { class: 'redeem-row' },
            codeInput,
            h('button', {
              class: 'cta',
              type: 'button',
              'data-testid': 'paywall-signin-btn',
              onclick: () => {
                const typed = codeInput.value.trim();
                if (typed) {
                  const saved = savePendingRedeemCode(typed);
                  if (!saved) {
                    feedback.className = 'small error';
                    feedback.textContent = t('redeemErrInvalid');
                    feedback.hidden = false;
                    return;
                  }
                }
                closeModal('paywall');
                void import('./account.ts').then(m => m.openAccount());
              },
            }, pendingCode ? t('redeemSignInKeepBtn') : t('signIn'))),
          feedback);

  const cur = effectivePlan();
  const proPricing = store.billing.pricing?.pro ?? PLANS.pro;
  const classPricing = store.billing.pricing?.classroom ?? PLANS.classroom;
  const sf = store.billing.storefront;
  const buyProUrl = sf?.purchaseUrlPro ?? null;
  const buyClassUrl = sf?.purchaseUrlClassroom ?? null;
  const contact = sf?.purchaseContact ?? null;

  const body = h('div', { class: 'paywall', 'data-testid': 'paywall' },
    featureReason ? h('p', { class: 'paywall-ctx', 'data-testid': 'paywall-reason' }, '🔒 ', t('paywallFeatureCtx', { s: featureReason })) : null,
    h('p', { class: 'muted', style: 'margin:0' }, t('paywallSubtitle')),
    h('div', { class: 'paywall-tiers' },
      h('section', { class: 'paywall-tier featured', 'data-testid': 'tier-pro' },
        h('h3', {}, h('span', { html: icon('sparkle', 16) }), t('planPro'), cur === 'pro' ? h('span', { class: 'plan-pill pro' }, '✓') : null),
        h('p', { class: 'paywall-price', 'data-testid': 'tier-pro-price' }, formatPlanPrice(proPricing)),
        h('p', { class: 'muted small', style: 'margin:0' }, t('paywallProDesc')),
        buyProUrl
          ? h('a', {
              class: 'cta',
              style: 'margin-top:8px;text-align:center',
              href: buyProUrl,
              target: '_blank',
              rel: 'noopener noreferrer',
              'data-testid': 'paywall-buy-pro',
            }, t('paywallBuyProBtn'))
          : null),
      h('section', { class: 'paywall-tier', 'data-testid': 'tier-classroom' },
        h('h3', {}, h('span', { html: icon('book', 16) }), t('planClassroom'), cur === 'classroom' ? h('span', { class: 'plan-pill classroom' }, '✓') : null),
        h('p', { class: 'paywall-price', 'data-testid': 'tier-classroom-price' }, formatPlanPrice(classPricing)),
        h('p', { class: 'muted small', style: 'margin:0' }, t('paywallClassDesc')),
        buyClassUrl && buyClassUrl !== buyProUrl
          ? h('a', {
              class: 'pill',
              style: 'margin-top:8px;text-align:center',
              href: buyClassUrl,
              target: '_blank',
              rel: 'noopener noreferrer',
              'data-testid': 'paywall-buy-classroom',
            }, t('paywallBuyClassBtn'))
          : null)),
    !buyProUrl ? h('p', { class: 'paywall-note' }, t('paywallCheckoutSoon')) : null,
    contact ? h('p', { class: 'paywall-note', 'data-testid': 'paywall-contact' }, t('paywallContact', { c: contact })) : null,
    redeemSection,
  );

  openModal('paywall', t('paywallTitle'), body);
}
