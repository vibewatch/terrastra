/** Progress backup: a versioned JSON file the user keeps, and a checked, previewed merge back in. Photos are not included. */
import { h, openModal, closeModal, toast } from './dom.ts';
import { t } from '../lib/i18n.ts';
import { store, canReplaceProgress, replaceProgress } from '../store.ts';
import { mergeProgress } from '../../shared/lib/progress.ts';
import { backupOf, readBackup, summary } from '../lib/backup-file.ts';

export function exportProgress(): void {
  const blob = new Blob([JSON.stringify(backupOf(store.progress), null, 1)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `terrastra-progress-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('💾 ' + t('backupSaved'));
}

export function importProgress(): void {
  const input = h('input', { type: 'file', accept: 'application/json,.json', 'data-testid': 'backup-file', style: 'display:none' });
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    input.remove();
    if (!f) return;
    const p = f.size < 5_000_000 ? readBackup(await f.text().catch(() => '')) : null;
    if (!p) { toast('⚠️ ' + t('backupBad'), 4000); return; }
    const now = summary(store.progress), merged = mergeProgress(store.progress, p);
    if (!canReplaceProgress(merged)) { toast('⚠️ ' + t('backupLimit'), 4000); return; }
    const after = summary(merged);
    const line = (k: 'seen' | 'found' | 'stickers' | 'likes') => h('tr', {}, h('th', {}, t('bk_' + k)), h('td', {}, String(now[k])), h('td', {}, String(after[k])));
    openModal('backup-import', t('backupImport'), h('div', { class: 'backup-preview', 'data-testid': 'backup-preview' },
      h('p', {}, t('backupMerge')),
      h('table', { class: 'facts' }, h('tr', {}, h('th', {}), h('th', {}, t('bkNow')), h('th', {}, t('bkAfter'))), line('seen'), line('found'), line('stickers'), line('likes')),
      h('div', { class: 'row' },
        h('button', { class: 'cta', 'data-testid': 'backup-merge', onclick: () => {
          const current = mergeProgress(store.progress, p);
          if (!canReplaceProgress(current)) { toast('⚠️ ' + t('backupLimit'), 4000); return; }
          replaceProgress(current, true); closeModal('backup-import'); toast('✅ ' + t('backupDone'));
        } }, t('backupMergeBtn')),
        h('button', { class: 'pill', onclick: () => closeModal('backup-import') }, t('cancel')))));
  });
  document.body.append(input);
  input.click();
}
