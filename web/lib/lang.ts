import { headers } from 'next/headers';

export type Lang = 'en' | 'zh';
/** The page language: `?lang=`, else the browser's preference. */
export async function langOf(q: string | string[] | undefined): Promise<Lang> {
  if (q === 'zh' || q === 'en') return q;
  return /^zh\b/i.test((await headers()).get('accept-language') ?? '') ? 'zh' : 'en';
}
export const pick = (lang: Lang, p: readonly [string, string]): string => (lang === 'zh' ? p[1] : p[0]);
