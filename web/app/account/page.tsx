import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AccountActions } from '@/components/AccountActions.tsx';
import { Top } from '@/components/Top.tsx';
import { me } from '@/lib/auth.ts';
import { langOf, pick, type Lang } from '@/lib/lang.ts';
import { stats } from '@/lib/learning.ts';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My learning' };

const T = {
  hello: ['Your learning', '我的学习'],
  since: ['Learning since', '加入于'],
  back: ['Back to the globe', '返回地球'],
  lessons: ['Lessons done', '已完成课程'],
  streak: ['Day streak', '连续学习天数'],
  accuracy: ['Quiz accuracy', '测验正确率'],
  minutes: ['Minutes learning', '学习分钟'],
  labs: ['Lab tasks', '实验任务'],
  daily: ['Daily Planet wins', '每日星球胜场'],
  geo: ['Geography', '地理'],
  astro: ['Astronomy', '天文'],
  courses: ['Courses', '课程'],
  recent: ['Recently', '最近学习'],
  none: ['No lessons yet: open a course on the globe to start.', '还没有学习记录：在地球上打开一门课程开始吧。'],
  done: ['done', '完成'],
  going: ['in progress', '进行中'],
  activity: ['Last 4 weeks', '近四周'],
  activityNote: ['Each square is a day; brighter means more learning.', '每格代表一天，越亮学得越多。'],
  account: ['Account', '账号'],
  accountNote: ['Deleting your account erases all your progress on the server.', '删除账号会清除服务器上的全部学习记录。'],
  signOut: ['Sign out', '退出登录'],
  del: ['Delete account', '删除账号'],
  confirm: ['Delete your account and all your progress? This cannot be undone.', '确定删除账号及全部学习记录？此操作无法撤销。'],
  failed: ['That did not work. Please try again.', '操作失败，请重试。'],
} as const;

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const when = (iso: string, lang: Lang) => new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', { month: 'short', day: 'numeric' }).format(new Date(iso));

export default async function Account({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams, lang = await langOf(q.lang), t = (p: readonly [string, string]) => pick(lang, p);
  const user = await me();
  if (!user) redirect(`/signin?callbackUrl=${encodeURIComponent('/account')}${q.lang ? `&lang=${lang}` : ''}`);
  const s = await stats(user, lang === 'zh');
  const done = s.subjects.reduce((n, x) => n + x.done, 0), total = s.subjects.reduce((n, x) => n + x.total, 0);
  const peak = Math.max(1, ...s.days);
  return (
    <div lang={lang === 'zh' ? 'zh-CN' : 'en'}>
      <Top lang={lang} here="/account"><a className="btn" href="/">{t(T.back)}</a></Top>
      <main className="dash">
        <section className="hello">
          <div>
            <h1>{t(T.hello)}</h1>
            <p>{s.user.handle ? `${s.user.handle} · ` : ''}{s.user.email} · {t(T.since)} {new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', { year: 'numeric', month: 'long' }).format(new Date(s.user.since))}</p>
          </div>
        </section>
        <section className="kpis" data-testid="kpis">
          <div className="kpi"><b>{done}<small>/ {total}</small></b><span>{t(T.lessons)}</span></div>
          <div className="kpi"><b>{s.streak}</b><span>{t(T.streak)}</span></div>
          <div className="kpi"><b>{s.quiz.answered ? `${pct(s.quiz.correct, s.quiz.answered)}%` : '—'}</b><span>{t(T.accuracy)}</span></div>
          <div className="kpi"><b>{s.minutes}</b><span>{t(T.minutes)}</span></div>
          <div className="kpi"><b>{s.labs}</b><span>{t(T.labs)}</span></div>
          <div className="kpi"><b>{s.daily.won}<small>/ {s.daily.played}</small></b><span>{t(T.daily)}</span></div>
        </section>
        <div className="grid2">
          <section className="panel">
            <h2>{t(T.courses)}</h2>
            {s.subjects.map(c => (
              <div className="course" key={c.subject} data-subject={c.subject}>
                <header><b>{t(c.subject === 'geo' ? T.geo : T.astro)} <span className="muted">· {t(c.view.name)}</span></b><span>{c.done} / {c.total}</span></header>
                <div className="bars">
                  {c.groups.map(g => (
                    <div className="bar" key={g.name[0]}>
                      <span title={t(g.name)}>{t(g.name)}</span>
                      <span className={`track ${c.subject}`}><i style={{ width: `${pct(g.done, g.total)}%` }} /></span>
                      <span>{g.done}/{g.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
          <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
            <section className="panel">
              <h2>{t(T.recent)}</h2>
              {s.recent.length ? (
                <ul className="recent">
                  {s.recent.map(r => (
                    <li key={r.id}>
                      <a className="t" href={`/#lesson/${r.id}`}>{t(r.title)}<span className={`tag${r.done ? '' : ' go'}`}>{t(r.done ? T.done : T.going)}</span></a>
                      <span className="s">{r.done ? `${r.best}/${r.of} · ` : ''}{when(r.at, lang)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="empty">{t(T.none)}</p>}
            </section>
            <section className="panel">
              <h2>{t(T.activity)}</h2>
              <div className="heat" aria-label={t(T.activityNote)}>
                {s.days.map((n, i) => <i key={i} data-l={n ? Math.min(3, Math.ceil((n / peak) * 3)) : 0} title={String(n)} />)}
              </div>
              <p className="muted" style={{ margin: '10px 0 0', fontSize: 12 }}>{t(T.activityNote)}</p>
            </section>
          </div>
        </div>
        <section className="panel">
          <h2>{t(T.account)}</h2>
          <div className="danger-zone">
            <p>{t(T.accountNote)}</p>
            <div style={{ display: 'flex', gap: 8 }}><AccountActions t={{ signOut: t(T.signOut), del: t(T.del), confirm: t(T.confirm), failed: t(T.failed) }} /></div>
          </div>
        </section>
      </main>
    </div>
  );
}
