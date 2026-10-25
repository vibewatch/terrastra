import type { Metadata } from 'next';
import { Top } from '@/components/Top.tsx';
import { langOf, pick } from '@/lib/lang.ts';

export const metadata: Metadata = { title: 'Not found' };

/** Any address that is neither the globe app, one of its pages, nor an API route. */
export default async function NotFound() {
  const lang = await langOf(undefined);
  return (
    <div lang={lang === 'zh' ? 'zh-CN' : 'en'}>
      <Top lang={lang} here="/" />
      <main className="auth">
        <section className="card">
          <h1>{pick(lang, ['Off the map', '地图之外'])}</h1>
          <p className="lead">{pick(lang, ['There is no page at this address.', '这个地址没有页面。'])}</p>
          <a className="btn primary" href="/">{pick(lang, ['Back to the globe', '回到地球'])}</a>
        </section>
      </main>
    </div>
  );
}
