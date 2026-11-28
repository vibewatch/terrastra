/** Search entries for everything beyond the globe (loaded only when the search box opens). */
import { BODIES, BODY } from '../../shared/data/solar.ts';
import { SOLAR_FEATURES } from '../../shared/data/solar-features.ts';
import { SOLAR_SITES } from '../../shared/data/solar-sites.ts';
import { CONSTELLATIONS } from '../../shared/data/constellations.ts';
import { DEEP_OBJECTS, SCALE_INFO, type ScaleId } from '../../shared/data/cosmos.ts';
import type { I18n } from '../../shared/data/types.ts';

export interface SpaceHit {
  /** Body id or site/feature/deep-sky/constellation key (also the alias key). */
  key: string;
  name: I18n; emoji: string; /** i18n key of the kind label */ kind: string; hash: string;
  /** The level it lives on, e.g. Solar System or Milky Way. */
  level: I18n;
  /** Catalogue designations (M1–M110, IAU 3-letter constellation codes). */
  aliases?: readonly string[];
  /** Secondary context (agency, host world). */
  other?: readonly string[];
}

const HASH: Record<ScaleId, string> = { universe: 'universe', laniakea: 'laniakea', group: 'localgroup', galaxy: 'milkyway', stars: 'nearbystars', solar: 'solar' };

export function spaceIndex(): SpaceHit[] {
  const SOLAR = SCALE_INFO.solar.name;
  return [
    ...(Object.values(SCALE_INFO)).map(i => ({ key: 'scale_' + i.id, name: i.name, emoji: i.emoji, kind: 'scaleIs', hash: HASH[i.id], level: i.name })),
    ...BODIES.map(b => ({ key: b.id, name: b.name, emoji: b.emoji, kind: 'bk_' + b.kind, hash: 'solar/' + b.id, level: SOLAR })),
    ...SOLAR_SITES.map(s => ({
      key: s.key, name: s.name, emoji: s.emoji, kind: 'sk_' + s.kind, hash: 'solar/' + s.key, level: SOLAR,
      other: [s.agency ?? '', BODY[s.body].name.en, BODY[s.body].name.zh ?? ''].filter(Boolean),
    })),
    ...SOLAR_FEATURES.map(f => ({
      key: f.key, name: f.name, emoji: f.emoji, kind: 'fk_' + f.kind, hash: 'solar/' + f.key, level: SOLAR,
      other: [BODY[f.body].name.en, BODY[f.body].name.zh ?? ''].filter(Boolean),
    })),
    ...DEEP_OBJECTS.map(o => ({
      key: o.key, name: o.name, emoji: o.emoji, kind: 'dk_' + o.kind, hash: HASH[o.scale] + '/' + o.key, level: SCALE_INFO[o.scale].name,
      aliases: o.messier ? ['M' + o.messier] : undefined,
    })),
    ...CONSTELLATIONS.map(c => ({
      key: 'cst_' + c.id, name: c.name, emoji: '✨', kind: 'cst_kind', hash: 'solar/cst_' + c.id, level: SOLAR,
      aliases: [c.id.toUpperCase()],
    })),
  ];
}
