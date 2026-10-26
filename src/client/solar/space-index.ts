/** Search entries for everything beyond the globe (loaded only when the search box opens). */
import { BODIES } from '../../shared/data/solar.ts';
import { SOLAR_FEATURES } from '../../shared/data/solar-features.ts';
import { SOLAR_SITES } from '../../shared/data/solar-sites.ts';
import { DEEP_OBJECTS, SCALE_INFO, type ScaleId } from '../../shared/data/cosmos.ts';
import type { I18n } from '../../shared/data/types.ts';

export interface SpaceHit {
  /** Body id or site/feature/deep-sky key (also the alias key). */
  key: string;
  name: I18n; emoji: string; /** i18n key of the kind label */ kind: string; hash: string;
  /** The level it lives on, e.g. Solar System or Milky Way. */
  level: I18n;
}

const HASH: Record<ScaleId, string> = { universe: 'universe', laniakea: 'laniakea', group: 'localgroup', galaxy: 'milkyway', stars: 'nearbystars', solar: 'solar' };

export function spaceIndex(): SpaceHit[] {
  const SOLAR = SCALE_INFO.solar.name;
  return [
    ...(Object.values(SCALE_INFO)).map(i => ({ key: 'scale_' + i.id, name: i.name, emoji: i.emoji, kind: 'scaleIs', hash: HASH[i.id], level: i.name })),
    ...BODIES.map(b => ({ key: b.id, name: b.name, emoji: b.emoji, kind: 'bk_' + b.kind, hash: 'solar/' + b.id, level: SOLAR })),
    ...SOLAR_SITES.map(s => ({ key: s.key, name: s.name, emoji: s.emoji, kind: 'sk_' + s.kind, hash: 'solar/' + s.key, level: SOLAR })),
    ...SOLAR_FEATURES.map(f => ({ key: f.key, name: f.name, emoji: f.emoji, kind: 'fk_' + f.kind, hash: 'solar/' + f.key, level: SOLAR })),
    ...DEEP_OBJECTS.map(o => ({ key: o.key, name: o.name, emoji: o.emoji, kind: 'dk_' + o.kind, hash: HASH[o.scale] + '/' + o.key, level: SCALE_INFO[o.scale].name })),
  ];
}
