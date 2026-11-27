import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('local storage fallback', () => {
  it('uses the new in-memory value when an existing value cannot be overwritten', async () => {
    const values = new Map([['pp.settings', JSON.stringify({ version: 1 })]]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: () => { throw new Error('quota exceeded'); },
    });
    const { load, save, onSessionOnly } = await import('../../src/client/lib/storage.ts');
    const lost = vi.fn();
    onSessionOnly(lost);

    save('settings', { version: 2 });
    expect(load('settings', null)).toEqual({ version: 2 });
    expect(values.get('pp.settings')).toBe('{"version":1}');
    expect(lost).toHaveBeenCalledOnce();
  });

  it('reads the in-memory value when storage access itself throws', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('storage denied'); },
      setItem: () => { throw new Error('storage denied'); },
    });
    const { load, save } = await import('../../src/client/lib/storage.ts');

    save('tutorial', 'done');
    expect(load('tutorial', null)).toBe('done');
  });

  it('uses persisted values again after writes recover', async () => {
    const values = new Map<string, string>();
    let blocked = true;
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (blocked) throw new Error('storage denied');
        values.set(key, value);
      },
    });
    const { load, save, sessionOnly } = await import('../../src/client/lib/storage.ts');

    save('tutorial', 'first');
    expect(sessionOnly()).toBe(true);
    blocked = false;
    save('tutorial', 'second');
    expect(sessionOnly()).toBe(false);
    values.set('pp.tutorial', JSON.stringify('another tab'));
    expect(load('tutorial', null)).toBe('another tab');
  });

  it('retains the last saved value if reads later become unavailable', async () => {
    const values = new Map<string, string>();
    let blocked = false;
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => {
        if (blocked) throw new Error('storage denied');
        return values.get(key) ?? null;
      },
      setItem: (key: string, value: string) => values.set(key, value),
    });
    const { load, save } = await import('../../src/client/lib/storage.ts');

    save('tutorial', 'done');
    blocked = true;
    expect(load('tutorial', null)).toBe('done');
  });

  it('retains the last successfully read value if storage later becomes unavailable', async () => {
    let blocked = false;
    vi.stubGlobal('localStorage', {
      getItem: () => { if (blocked) throw new Error('storage denied'); return JSON.stringify('from an earlier session'); },
      setItem: () => {},
    });
    const { load } = await import('../../src/client/lib/storage.ts');

    expect(load('tutorial', null)).toBe('from an earlier session');
    blocked = true;
    expect(load('tutorial', null)).toBe('from an earlier session');
  });

  it('preserves existing plain-text settings and their session fallback', async () => {
    const values = new Map([['pp.skyObs', 'london']]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: () => { throw new Error('storage denied'); },
    });
    const { loadText, saveText } = await import('../../src/client/lib/storage.ts');

    expect(loadText('skyObs', 'best')).toBe('london');
    saveText('skyObs', 'beijing');
    expect(loadText('skyObs', 'best')).toBe('beijing');
  });

  it('flushes other pending keys once storage quota frees up and supports remove()', async () => {
    const values = new Map<string, string>();
    let blocked = true;
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (blocked) throw new Error('quota exceeded');
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    });
    const { load, save, remove, sessionOnly } = await import('../../src/client/lib/storage.ts');

    save('alpha', { a: 1 });
    save('beta', { b: 2 });
    expect(sessionOnly()).toBe(true);
    expect(values.size).toBe(0);

    blocked = false;
    save('gamma', { c: 3 });
    expect(sessionOnly()).toBe(false);
    expect(JSON.parse(values.get('pp.alpha')!)).toEqual({ a: 1 });
    expect(JSON.parse(values.get('pp.beta')!)).toEqual({ b: 2 });
    expect(JSON.parse(values.get('pp.gamma')!)).toEqual({ c: 3 });

    remove('beta');
    expect(load('beta', null)).toBeNull();
    expect(values.has('pp.beta')).toBe(false);
  });

  it('isolates per-key quota errors in flushPending so smaller pending keys still flush (#111)', async () => {
    const values = new Map<string, string>();
    let rejectKey: string | null = 'ALL';
    vi.stubGlobal('localStorage', {
      get length() { return values.size; },
      key: (i: number) => [...values.keys()][i] ?? null,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (rejectKey === 'ALL' || rejectKey === key) throw new Error('quota exceeded');
        values.set(key, value);
      },
      removeItem: (key: string) => { values.delete(key); },
    });
    const { save, sessionOnly, storageUsageBytes } = await import('../../src/client/lib/storage.ts');

    save('huge', 'x'.repeat(200));
    save('small', { ok: true });
    expect(sessionOnly()).toBe(true);
    expect(storageUsageBytes().pendingKeys).toBe(2);

    // Only pp.huge continues to fail; pp.small and pp.tiny should flush cleanly!
    rejectKey = 'pp.huge';
    save('tiny', 42);
    expect(values.get('pp.small')).toBe('{"ok":true}');
    expect(values.get('pp.tiny')).toBe('42');
    expect(values.has('pp.huge')).toBe(false);
    expect(sessionOnly()).toBe(true);
    expect(storageUsageBytes().pendingKeys).toBe(1);
    expect(storageUsageBytes().bytes).toBeGreaterThan(200);
  });
});
