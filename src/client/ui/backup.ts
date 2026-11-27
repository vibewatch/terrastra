/** Progress backup: a versioned JSON file the user keeps, and a checked, previewed merge back in. Photos are not included. */
import { h, openModal, closeModal, toast } from './dom.ts';
import { t, lang } from '../lib/i18n.ts';
import { save } from '../lib/storage.ts';
import { store, canReplaceProgress, readLocalExtras, replaceProgress } from '../store.ts';
import { mergeProgress } from '../../shared/lib/progress.ts';
import { mergeSyncExtras } from '../../shared/lib/sync-extras.ts';
import { backupOf, readBackupFull, summary } from '../lib/backup-file.ts';

export function exportProgress(): void {
  const payload = backupOf(store.progress, Date.now(), readLocalExtras());
  const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `terrastra-progress-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('💾 ' + t('backupSaved'));
}

export function importProgress(): void {
  // a dismissed picker leaves its hidden input behind: clear it on the next import.
  // (Not on "cancel": automated and some real browsers fire it before "change".)
  document.querySelectorAll('input[data-testid="backup-file"]').forEach(el => el.remove());
  const input = h('input', { type: 'file', accept: 'application/json,.json', 'data-testid': 'backup-file', style: 'display:none' });
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    input.remove();
    if (!f) return;
    const parsed = f.size < 5_000_000 ? readBackupFull(await f.text().catch(() => '')) : null;
    if (!parsed) { toast('⚠️ ' + t('backupBad'), 4000); return; }
    const p = parsed.progress;
    const now = summary(store.progress), merged = mergeProgress(store.progress, p);
    if (!canReplaceProgress(merged)) { toast('⚠️ ' + t('backupLimit'), 4000); return; }
    const after = summary(merged);
    const localExtras = readLocalExtras();
    const mergedExtras = mergeSyncExtras(localExtras, parsed);
    const row = (label: string, beforeVal: number, afterVal: number) => {
      const diff = afterVal - beforeVal;
      return h('tr', {},
        h('th', {}, label),
        h('td', {}, String(beforeVal)),
        h('td', {}, String(afterVal), diff > 0 ? h('small', { class: 'ok', style: 'margin-left:6px' }, `+${diff}`) : null));
    };
    const line = (k: 'seen' | 'found' | 'stickers' | 'likes') => row(t('bk_' + k), now[k], after[k]);
    const dateLine = parsed.exportedAt
      ? h('p', { class: 'muted small', 'data-testid': 'backup-date', style: 'margin:0 0 8px' },
          t('backupDate', { date: new Date(parsed.exportedAt).toLocaleString(lang() === 'zh' ? 'zh-CN' : 'en') }))
      : null;
    openModal('backup-import', t('backupImport'), h('div', { class: 'backup-preview', 'data-testid': 'backup-preview' },
      h('p', {}, t('backupMerge')),
      dateLine,
      h('table', { class: 'facts' },
        h('tr', {}, h('th', {}), h('th', {}, t('bkNow')), h('th', {}, t('bkAfter'))),
        line('seen'),
        line('found'),
        line('stickers'),
        line('likes'),
        row(t('bk_lessons'), (localExtras.lessonsDone ?? []).length, (mergedExtras.lessonsDone ?? []).length),
        row(t('bk_tours'), (localExtras.toursDone ?? []).length, (mergedExtras.toursDone ?? []).length),
        row(t('bk_journal'), Object.keys(localExtras.lessonJournal ?? {}).length, Object.keys(mergedExtras.lessonJournal ?? {}).length),
        row(t('bk_mistakes'), Object.keys(localExtras.mistakeBook ?? {}).length, Object.keys(mergedExtras.mistakeBook ?? {}).length),
        row(t('bk_bookmarks'), (localExtras.bookmarks ?? []).length, (mergedExtras.bookmarks ?? []).length)),
      h('div', { class: 'row' },
        h('button', { class: 'cta', 'data-testid': 'backup-merge', onclick: () => {
          const current = mergeProgress(store.progress, p);
          if (!canReplaceProgress(current)) { toast('⚠️ ' + t('backupLimit'), 4000); return; }
          const nextExtras = mergeSyncExtras(readLocalExtras(), parsed);
          save('lessonsDone', nextExtras.lessonsDone ?? []);
          save('toursDone', nextExtras.toursDone ?? []);
          save('lessonJournal', nextExtras.lessonJournal ?? {});
          save('mistakeBook', nextExtras.mistakeBook ?? {});
          save('bookmarks', nextExtras.bookmarks ?? []);
          replaceProgress(current, true);
          closeModal('backup-import'); toast('✅ ' + t('backupDone'));
        } }, t('backupMergeBtn')),
        h('button', { class: 'pill', onclick: () => closeModal('backup-import') }, t('cancel')))));
  });
  document.body.append(input);
  input.click();
}
