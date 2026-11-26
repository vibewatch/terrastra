/** Generates lightweight lesson catalog metadata (`src/client/lessons/catalog-meta.json`) from canonical lesson modules. */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

interface RawLesson {
  id: string;
  strand: string;
  level?: string;
  grade?: string;
  tracks: string[];
  unit: readonly [string, string];
  title: readonly [string, string];
  blurb: readonly [string, string];
  icon: string;
  minutes: number;
  exam?: boolean;
}

const root = fileURLToPath(new URL('..', import.meta.url));
const outPath = join(root, 'src/client/lessons/catalog-meta.json');
const dataMod = await import(new URL('../src/client/lessons/data.ts', import.meta.url).href) as {
  LESSONS: RawLesson[];
  course: (v: 'cn' | 'cns') => { lessons: RawLesson[] }[];
};
const astroMod = await import(new URL('../src/client/lessons/astro/data.ts', import.meta.url).href) as {
  ASTRO_LESSONS: RawLesson[];
};

const toMeta = (l: RawLesson) => ({
  id: l.id,
  strand: l.strand,
  ...(l.level ? { level: l.level } : {}),
  ...(l.grade ? { grade: l.grade } : {}),
  tracks: l.tracks,
  unit: l.unit,
  title: l.title,
  blurb: l.blurb,
  icon: l.icon,
  minutes: l.minutes,
  ...(l.exam ? { exam: true } : {}),
});

const cnOrderIds = [...dataMod.course('cn'), ...dataMod.course('cns')].flatMap(g => g.lessons.map(l => l.id));

const payload = {
  geo: dataMod.LESSONS.map(toMeta),
  cnOrderIds,
  astro: astroMod.ASTRO_LESSONS.map(toMeta),
};

writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
console.log(`Wrote ${payload.geo.length} geo + ${payload.astro.length} astro lesson metadata entries to src/client/lessons/catalog-meta.json`);
