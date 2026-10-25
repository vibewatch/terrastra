// The Explore hub: every activity in one place, sorted into four shelves (learn, observe, play, me).
import { h } from './dom.ts';
import { t } from '../lib/i18n.ts';
import { store } from '../store.ts';
import { ANIMALS, CATALOGUE } from '../../shared/data/catalogue.ts';
import { load, save } from '../lib/storage.ts';
import { HAS_API, url } from '../lib/env.ts';
import { classroom } from '../lib/classroom.ts';
import { icon, type IconName } from './icons.ts';
import { sfx } from '../lib/sfx.ts';
import { dayIndex } from '../../shared/games/daily.ts';
import { ssbsOn } from '../lib/ssbs.ts';

export type HubTab = 'learn' | 'look' | 'play' | 'me';
export const HUB_TABS: HubTab[] = ['learn', 'look', 'play', 'me'];
const TAB_ICON: Record<HubTab, IconName> = { learn: 'book', look: 'telescope', play: 'game', me: 'user' };
const TAB_LABEL: Record<HubTab, string> = { learn: 'hubLearn', look: 'hubLook', play: 'hubPlay', me: 'hubMe' };

export interface HubActions {
  lessons(): void; astro(): void; ssbs(): void; tours(): void;
  sky(): void; tonight(): void; time(): void; compare(): void; bookmarks(): void; radio(): void;
  game(kind: 'daily' | 'placeit' | 'quiz'): void;
  passport(): void; collection(): void; album(): void; account(): void; guestbook(): void;
  /** In space: the globe-only shelves offer a way home instead. */
  toEarth(): void;
}

interface Entry { id: string; ic: IconName; title: string; sub: string; stat?: string; go: () => void; earth?: boolean; href?: string }

export const hubTab = (): HubTab => { const v = load<string>('hubTab', 'learn'); return (HUB_TABS as string[]).includes(v) ? v as HubTab : 'learn'; };

function entries(tab: HubTab, a: HubActions): Entry[] {
  const done = (k: string) => load<string[]>(k, []).length;
  const tick = (n: number) => (n ? '✓ ' + t('hubDone', { n }) : '');
  // every class shares one progress list; astronomy ids start with "a-", the SSBS class's with "ssbs-"
  const lessonIds = load<string[]>('lessonsDone', []), astroDone = lessonIds.filter(x => x.startsWith('a-')).length;
  const ssbsDone = lessonIds.filter(x => x.startsWith('ssbs-')).length, geoDone = lessonIds.length - astroDone - ssbsDone;
  switch (tab) {
    case 'learn': return [
      { id: 'menu-lessons', ic: 'book', title: t('lessons'), sub: t('hubLessonsSub'), stat: tick(geoDone), go: a.lessons },
      { id: 'menu-astro', ic: 'planet', title: t('astroLessons'), sub: t('hubAstroSub'), stat: tick(astroDone), go: a.astro },
      ...(ssbsOn() ? [{ id: 'menu-ssbs', ic: 'trophy' as IconName, title: t('ssbsLessons'), sub: t('hubSsbsSub'), stat: tick(ssbsDone), go: a.ssbs }] : []),
      { id: 'menu-tours', ic: 'compass', title: t('tours'), sub: t('hubToursSub'), stat: tick(done('toursDone')), go: a.tours },
      { id: 'menu-link-encyclopedia', ic: 'external', title: t('encyclopedia'), sub: t('hubEncSub'), go: () => {}, href: url('encyclopedia/') },
    ];
    case 'look': return [
      { id: 'menu-sky', ic: 'eclipse', title: t('skyEvents'), sub: t('hubSkySub'), go: a.sky },
      { id: 'menu-tonight', ic: 'telescope', title: t('tonight'), sub: t('hubTonightSub'), go: a.tonight },
      { id: 'menu-time', ic: 'clock', title: t('timeMachine'), sub: t('hubTimeSub'), go: a.time, earth: true },
      { id: 'menu-compare', ic: 'ruler', title: t('compare'), sub: t('hubCompareSub'), go: a.compare },
      { id: 'menu-bookmarks', ic: 'pin', title: t('bookmarks'), sub: t('hubBookmarksSub'), go: a.bookmarks },
      ...(classroom() ? [] : [{ id: 'menu-radio', ic: 'radio' as IconName, title: t('radio'), sub: t('hubRadioSub'), go: a.radio, earth: true }]),
    ];
    case 'play': {
      const d = load<{ day?: number; done?: boolean } | null>('dailyState', null);
      return [
        { id: 'menu-daily', ic: 'calendar', title: t('daily'), sub: t('dailySub'), stat: d?.done && d.day === dayIndex() ? '✓' : '', go: () => a.game('daily'), earth: true },
        { id: 'menu-placeit', ic: 'pin', title: t('placeit'), sub: t('placeitSub'), go: () => a.game('placeit'), earth: true },
        { id: 'menu-quiz', ic: 'brain', title: t('quiz'), sub: t('quizSub'), go: () => a.game('quiz'), earth: true },
      ];
    }
    case 'me': {
      const p = store.progress;
      return [
        { id: 'menu-passport', ic: 'passport', title: t('passport'), sub: t('passportSub'), stat: `${Object.keys(p.seen).length} / ${CATALOGUE.length}`, go: a.passport },
        { id: 'menu-collection', ic: 'paw', title: t('collection'), sub: t('hubDexSub'), stat: `${Object.keys(p.dex).length} / ${ANIMALS.length}`, go: a.collection },
        { id: 'menu-album', ic: 'camera', title: t('album'), sub: t('albumSub'), go: a.album },
        ...(HAS_API ? [{ id: 'menu-account', ic: 'user' as IconName, title: store.me ? t('account') : t('signIn'), sub: store.me ? t('signedInAs', { e: store.me.handle ?? store.me.email }) : t('hubAccountSub'), go: a.account }] : []),
        ...(HAS_API && !classroom() ? [{ id: 'menu-guestbook', ic: 'chat' as IconName, title: t('guestbook'), sub: t('hubGuestbookSub'), go: a.guestbook }] : []),
      ];
    }
  }
}

/** Builds the hub's content: shelf tabs, then one row per activity (icon, name, one line, progress). */
export function renderHub(tab: HubTab, space: boolean, a: HubActions, pick: (tab: HubTab) => void, close: () => void): HTMLElement[] {
  const tabs = h('div', { class: 'hub-tabs', role: 'tablist', 'aria-label': t('hub') },
    ...HUB_TABS.map(k => h('button', {
      class: 'hub-tab' + (k === tab ? ' on' : ''), role: 'tab', 'aria-selected': String(k === tab), 'data-testid': 'hub-tab-' + k,
      onclick: () => { sfx.tap(); save('hubTab', k); pick(k); },
    }, h('span', { class: 'ht-ico', html: icon(TAB_ICON[k], 17) }), h('span', {}, t(TAB_LABEL[k])))));
  const all = entries(tab, a);
  const list = all.filter(e => !(space && e.earth));
  const row = (e: Entry) => {
    const inner = [
      h('span', { class: 'hr-ico', html: icon(e.ic, 19) }),
      h('span', { class: 'hr-text' }, h('strong', {}, e.title), h('small', {}, e.sub)),
      e.stat ? h('em', { class: 'hr-stat' }, e.stat) : null,
      h('span', { class: 'hr-go', html: icon(e.href ? 'external' : 'chevron', 15) }),
    ];
    return e.href
      ? h('a', { class: 'hub-row', href: e.href, 'data-testid': e.id }, ...inner)
      : h('button', { class: 'hub-row', 'data-testid': e.id, onclick: () => { sfx.tap(); close(); e.go(); } }, ...inner);
  };
  const away = list.length < all.length
    ? h('div', { class: 'hub-away' }, h('span', {}, t('hubEarthOnly')),
      h('button', { class: 'pill pill-sm', 'data-testid': 'hub-to-earth', onclick: () => { close(); a.toEarth(); } }, t('backToEarth')))
    : null;
  return [tabs, h('div', { class: 'hub-list', role: 'tabpanel', 'data-testid': 'hub-' + tab }, ...list.map(row)), ...(away ? [away] : [])];
}
