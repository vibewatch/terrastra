import { closeModal, h, openModal } from './dom.ts';
import { t, type I18nKey } from '../lib/i18n.ts';

export interface ShortcutItem {
  readonly keys: readonly string[];
  readonly labelKey: I18nKey;
}

export interface ShortcutGroup {
  readonly id: string;
  readonly titleKey: I18nKey;
  readonly items: readonly ShortcutItem[];
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    id: 'global',
    titleKey: 'shortcutsGlobal',
    items: [
      { keys: ['/', 'Ctrl/⌘ K'], labelKey: 'shortcutsSearch' },
      { keys: ['M'], labelKey: 'shortcutsMap' },
      { keys: ['H'], labelKey: 'shortcutsImmersive' },
      { keys: ['?'], labelKey: 'shortcutsHelp' },
      { keys: ['Esc'], labelKey: 'shortcutsEsc' },
    ],
  },
  {
    id: 'map-models',
    titleKey: 'shortcutsMapCompare',
    items: [
      { keys: ['R'], labelKey: 'shortcutsMapRuler' },
      { keys: ['T'], labelKey: 'shortcutsMapTissot' },
      { keys: ['←', '↑', '→', '↓'], labelKey: 'shortcutsModelRotate' },
      { keys: ['+', '−', '0'], labelKey: 'shortcutsModelZoom' },
      { keys: ['Space'], labelKey: 'shortcutsModelPause' },
    ],
  },
  {
    id: 'learn-sky',
    titleKey: 'shortcutsLearnSky',
    items: [
      { keys: ['Space', '[ ]', 'C'], labelKey: 'shortcutsSky' },
      { keys: ['← / →', 'S'], labelKey: 'shortcutsTourReader' },
      { keys: ['1–4', 'Enter'], labelKey: 'shortcutsLessonQuiz' },
      { keys: ['G', '← / →'], labelKey: 'shortcutsPhoto' },
    ],
  },
];

/** Opens (or toggles closed) the bilingual keyboard shortcuts reference modal. */
export function openShortcutsModal(): void {
  if (document.getElementById('shortcuts')) {
    closeModal('shortcuts');
    return;
  }
  const body = h('div', { class: 'shortcuts-wrap', 'data-testid': 'shortcuts-modal' },
    h('p', { class: 'muted small', style: 'margin:0 0 12px' }, t('shortcutsSub')),
    h('div', { class: 'shortcuts-grid' },
      ...SHORTCUT_GROUPS.map(g =>
        h('section', { class: 'shortcuts-sec', 'data-testid': `shortcuts-sec-${g.id}` },
          h('h3', { class: 'shortcuts-h3' }, t(g.titleKey)),
          h('dl', { class: 'shortcuts-list' },
            ...g.items.map(it =>
              h('div', { class: 'shortcuts-row' },
                h('dt', { class: 'shortcuts-keys' },
                  ...it.keys.map(k => h('kbd', { class: 'kbd-chip' }, k))),
                h('dd', { class: 'shortcuts-desc' }, t(it.labelKey)))))))));
  openModal('shortcuts', t('shortcutsTitle'), body, { wide: true });
}
