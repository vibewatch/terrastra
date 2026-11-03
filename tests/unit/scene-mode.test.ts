import { describe, expect, it } from 'vitest';
import { SceneModeController } from '../../src/client/lib/scene-mode.ts';
import { countryDisplayName, countryMapLabel, formatDeg, labelBox, labelRank, overlapsBox } from '../../src/client/globe/overlay.ts';

describe('SceneModeController', () => {
  it('tracks surface, sky overlay, gaming, and music level transitions cleanly', () => {
    const levels: string[] = [];
    const ctrl = new SceneModeController(() => levels.push(ctrl.musicLevel + ':' + ctrl.surface));
    expect(ctrl.surface).toBe('globe');
    expect(ctrl.musicLevel).toBe('earth');
    expect(ctrl.canLoadGlobeAdmin(false)).toBe(true);
    expect(ctrl.canLoadGlobeAdmin(true)).toBe(false);

    const seq1 = ctrl.beginNav();
    expect(ctrl.isCurrentNav(seq1)).toBe(true);

    ctrl.enterMap();
    expect(ctrl.inMap).toBe(true);
    expect(ctrl.canLoadGlobeAdmin(false)).toBe(false);
    expect(ctrl.leaveMap()).toBe(true);
    expect(ctrl.leaveMap()).toBe(false);

    ctrl.enterSolar();
    expect(ctrl.inSolar).toBe(true);
    expect(ctrl.musicLevel).toBe('solar');
    ctrl.setScale('stars');
    expect(ctrl.musicLevel).toBe('galaxy');

    ctrl.enterSky();
    expect(ctrl.inSky).toBe(true);
    expect(ctrl.musicLevel).toBe('sky');
    ctrl.leaveSky();
    expect(ctrl.musicLevel).toBe('galaxy');

    expect(ctrl.leaveSolar()).toBe(true);
    expect(ctrl.inSolar).toBe(false);
    expect(ctrl.musicLevel).toBe('earth');

    ctrl.setGaming(true);
    expect(ctrl.gaming).toBe(true);
    expect(ctrl.isCurrentNav(seq1)).toBe(false);
    expect(levels.length).toBeGreaterThan(0);
  });
});

describe('overlay helpers', () => {
  it('ranks and collision-tests map labels consistently across Globe and FlatMap', () => {
    const cap = { text: 'Chengdu', cls: 'lb-country lb-provcap', x: 205, y: 202, pri: 1 };
    const country = { text: 'China', cls: 'lb-country', x: 200, y: 200, pri: 900 };
    const admin = { text: 'Sichuan', cls: 'lb-admin', x: 200, y: 200, pri: 48 };
    const far = { text: 'Kunming', cls: 'lb-country lb-provcap', x: 400, y: 400, pri: 1 };
    expect(labelRank(cap)).toBeGreaterThan(labelRank(country));
    expect(labelRank(country)).toBeGreaterThan(labelRank(admin));
    const a = labelBox(admin);
    const b = labelBox(cap);
    const c = labelBox(far);
    expect(overlapsBox([b], a)).toBe(true);
    expect(overlapsBox([a, b], c)).toBe(false);
    expect(formatDeg(23.4, 'N', 'S')).toBe('23.4°N');
    const cn = { a2: 'CN', name: 'China', continent: 'AS', lat: 35, lon: 105, area: 900 };
    expect(countryDisplayName(cn, 'zh')).toBe('中国');
    const cache = new Map<string, string>();
    expect(countryMapLabel(cn, 'en', cache)).toBe('CHINA');
  });
});
