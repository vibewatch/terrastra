import type { Lang } from '@/lib/lang.ts';

/** The page header: the brand (back to the globe) and a language switch. */
export function Top({ lang, here, children }: { lang: Lang; here: string; children?: React.ReactNode }) {
  const other = lang === 'zh' ? 'en' : 'zh';
  return (
    <header className="top">
      <a className="brand" href="/"><img src="/favicon.svg" alt="" />{lang === 'zh' ? '寰星' : 'Terrastra'}</a>
      <span className="grow" />
      <nav>
        {children}
        <a className="btn" href={`${here}${here.includes('?') ? '&' : '?'}lang=${other}`} hrefLang={other}>{other === 'zh' ? '中文' : 'EN'}</a>
      </nav>
    </header>
  );
}
