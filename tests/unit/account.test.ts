import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../src/client/lib/api.ts';
import { store, setMe } from '../../src/client/store.ts';
import { syncNow } from '../../src/client/ui/account.ts';
import * as dom from '../../src/client/ui/dom.ts';
import { emptyProgress, type Progress } from '../../src/shared/lib/progress.ts';

afterEach(() => {
  vi.restoreAllMocks();
  store.me = null;
  store.progress = emptyProgress();
});

describe('account sync', () => {
  it('does not apply an old account response after the user signs out', async () => {
    let finish!: (value: { progress: Progress }) => void;
    vi.spyOn(api, 'syncProgress').mockReturnValue(new Promise(resolve => { finish = resolve; }));
    setMe({ id: 1, email: 'a@example.com', handle: null });
    store.progress = emptyProgress();

    const syncing = syncNow(true);
    setMe(null);
    const remote = emptyProgress(); remote.seen = { eiffel: 1 };
    finish({ progress: remote });

    expect(await syncing).toBe(false);
    expect(store.progress.seen).toEqual({});
  });

  it('does not apply a response from an earlier session with a reused account id', async () => {
    let finish!: (value: { progress: Progress }) => void;
    vi.spyOn(api, 'syncProgress').mockReturnValue(new Promise(resolve => { finish = resolve; }));
    setMe({ id: 1, email: 'a@example.com', handle: null });
    const syncing = syncNow(true);
    setMe(null);
    setMe({ id: 1, email: 'b@example.com', handle: null });
    const remote = emptyProgress(); remote.seen = { eiffel: 1 };
    finish({ progress: remote });

    expect(await syncing).toBe(false);
    expect(store.progress.seen).toEqual({});
  });

  it('keeps local changes made while a sync is in flight', async () => {
    let finish!: (value: { progress: Progress }) => void;
    vi.spyOn(api, 'syncProgress').mockReturnValue(new Promise(resolve => { finish = resolve; }));
    setMe({ id: 1, email: 'a@example.com', handle: null });
    store.progress = emptyProgress();

    const syncing = syncNow(true);
    store.progress.seen.lion = 2;
    const remote = emptyProgress(); remote.seen = { eiffel: 1 };
    finish({ progress: remote });

    expect(await syncing).toBe(true);
    expect(store.progress.seen).toEqual({ lion: 2, eiffel: 1 });
  });

  it('keeps local progress and reports an oversized merge during background sync', async () => {
    let finish!: (value: { progress: Progress }) => void;
    vi.spyOn(api, 'syncProgress').mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const toast = vi.spyOn(dom, 'toast').mockImplementation(() => {});
    setMe({ id: 1, email: 'a@example.com', handle: null });
    store.progress = emptyProgress();
    store.progress.seen = Object.fromEntries(Array.from({ length: 2500 }, (_, i) => [`local-${i}`, 1]));
    const initial = { ...store.progress.seen };

    const syncing = syncNow(true);
    store.progress.seen.later1 = 2;
    store.progress.seen.later2 = 3;
    const remote = emptyProgress();
    remote.seen = { ...initial, ...Object.fromEntries(Array.from({ length: 2499 }, (_, i) => [`remote-${i}`, 1])) };
    finish({ progress: remote });

    expect(await syncing).toBe(false);
    expect(Object.keys(store.progress.seen)).toHaveLength(2502);
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('too large'), 4000);
  });

  it('does not save a merged document that exceeds the sync request size', async () => {
    let finish!: (value: { progress: Progress }) => void;
    vi.spyOn(api, 'syncProgress').mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const toast = vi.spyOn(dom, 'toast').mockImplementation(() => {});
    const keys = (prefix: string) => Object.fromEntries(Array.from({ length: 2000 }, (_, i) =>
      [`${prefix}${String(i).padStart(4, '0')}-${'x'.repeat(57)}`, 1]));
    setMe({ id: 1, email: 'a@example.com', handle: null });
    store.progress.logs = keys('a');
    const syncing = syncNow(true);
    store.progress.logs = { ...store.progress.logs, ...keys('b') };
    const remote = emptyProgress(); remote.logs = keys('a');
    finish({ progress: remote });

    expect(await syncing).toBe(false);
    expect(Object.keys(store.progress.logs)).toHaveLength(4000);
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('too large'), 4000);
  });
});
