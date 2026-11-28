import { describe, expect, it } from 'vitest';
import {
  buildLlmsTxt,
  foldEncyclopediaText,
  geoSchemaType,
  itemSchemaType,
  matchesEncyclopediaQuery,
} from '../../src/shared/lib/encyclopedia.ts';
import { clampPreviewZoom, PREVIEW_MAX_ZOOM, PREVIEW_MIN_ZOOM } from '../../src/client/models/preview.ts';
import { SHORTCUT_GROUPS } from '../../src/client/ui/shortcuts.ts';
import { t } from '../../src/client/lib/i18n.ts';

describe('encyclopedia search & SEO helpers', () => {
  it('folds Latin diacritics while preserving CJK and collapsing whitespace', () => {
    expect(foldEncyclopediaText('  Galápagos   Islands · 加拉帕戈斯群岛 ')).toBe('galapagos islands · 加拉帕戈斯群岛');
    expect(foldEncyclopediaText('Plate Carrée / São Paulo')).toBe('plate carree / sao paulo');
  });

  it('matches multi-word out-of-order tokens and optional category tags', () => {
    const hay = foldEncyclopediaText('Mariana Trench 马里亚纳海沟 Trench / Ridge Western Pacific Ocean');
    expect(matchesEncyclopediaQuery(hay, 'pacific trench')).toBe(true);
    expect(matchesEncyclopediaQuery(hay, '马里亚纳 pacific')).toBe(true);
    expect(matchesEncyclopediaQuery(hay, 'atlantic trench')).toBe(false);
    expect(matchesEncyclopediaQuery(hay, 'trench', 'trench', 'trench')).toBe(true);
    expect(matchesEncyclopediaQuery(hay, 'trench', 'trench', 'river')).toBe(false);
  });

  it('maps physical geography and catalogue entries to specific Schema.org types', () => {
    expect(geoSchemaType('continent')).toBe('Continent');
    expect(geoSchemaType('ocean')).toBe('BodyOfWater');
    expect(geoSchemaType('river')).toBe('RiverBodyOfWater');
    expect(geoSchemaType('lake')).toBe('LakeBodyOfWater');
    expect(geoSchemaType('mountain')).toBe('Mountain');
    expect(geoSchemaType('trench')).toBe('Landform');
    expect(geoSchemaType('line')).toBe('Place');

    expect(itemSchemaType('landmark', false)).toBe('LandmarksOrHistoricalBuildings');
    expect(itemSchemaType('person', false)).toBe('Person');
    expect(itemSchemaType('festival', false)).toBe('Event');
    expect(itemSchemaType('volcano', false)).toBe('Volcano');
    expect(itemSchemaType('discovery', false)).toBe('Place');
    expect(itemSchemaType('voyage', true)).toBe('Thing');
    expect(itemSchemaType('animal', false)).toBe('Thing');
  });

  it('generates structured bilingual /llms.txt output with section and lesson routes', () => {
    const txt = buildLlmsTxt({
      site: 'https://terrastra.example/',
      totalItems: 200,
      geoCount: 95,
      sections: [{ dir: 'landmarks', titleEn: 'Landmarks', titleZh: '著名地标', hintEn: 'Famous structures.', count: 42 }],
      lessons: [
        { id: 'plates', kind: 'geo', titleEn: 'Plate tectonics', titleZh: '板块构造', free: true },
        { id: 'moon-phases', kind: 'astro', titleEn: 'Phases of the Moon', titleZh: '月相变化', free: false },
      ],
    });
    expect(txt).toContain('# Terrastra · 寰星');
    expect(txt).toContain('295 crawlable encyclopedia entries');
    expect(txt).toContain('[Landmarks · 著名地标](https://terrastra.example/landmarks/): 42 entries');
    expect(txt).toContain('[Physical Geography · 自然地理](https://terrastra.example/geography/): 95 entries');
    expect(txt).toContain('[Plate tectonics · 板块构造](https://terrastra.example/#lesson/plates) (Free)');
    expect(txt).toContain('[Phases of the Moon · 月相变化](https://terrastra.example/#astro/moon-phases) (Explorer Pro)');
    expect(txt).toContain('https://terrastra.example/sitemap.xml');
  });
});

describe('3D preview zoom clamping & keyboard shortcut definitions', () => {
  it('clamps preview zoom to safe camera bounds and handles non-finite inputs', () => {
    expect(clampPreviewZoom(1)).toBe(1);
    expect(clampPreviewZoom(0.1)).toBe(PREVIEW_MIN_ZOOM);
    expect(clampPreviewZoom(9.9)).toBe(PREVIEW_MAX_ZOOM);
    expect(clampPreviewZoom(Number.NaN)).toBe(1);
  });

  it('resolves every keyboard shortcut group and item label in both English and Chinese', () => {
    expect(SHORTCUT_GROUPS.length).toBeGreaterThanOrEqual(3);
    for (const g of SHORTCUT_GROUPS) {
      expect(t(g.titleKey, undefined, 'en').length).toBeGreaterThan(2);
      expect(t(g.titleKey, undefined, 'zh').length).toBeGreaterThan(1);
      expect(g.items.length).toBeGreaterThan(0);
      for (const item of g.items) {
        expect(item.keys.length).toBeGreaterThan(0);
        expect(t(item.labelKey, undefined, 'en')).not.toBe(item.labelKey);
        expect(t(item.labelKey, undefined, 'zh')).not.toBe(item.labelKey);
      }
    }
  });
});
