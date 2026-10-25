import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SignInForm } from '@/components/SignInForm.tsx';
import { Top } from '@/components/Top.tsx';
import { authOptions, me } from '@/lib/auth.ts';
import { devLogin } from '@/lib/http.ts';
import { langOf, pick } from '@/lib/lang.ts';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sign in' };

const T = {
  title: ['Sign in to Terrastra', '登录寰星'],
  lead: ['No password: we e-mail you a one-time link.', '无需密码：我们会发送一次性登录链接到你的邮箱。'],
  email: ['E-mail', '邮箱'],
  send: ['E-mail me a sign-in link', '发送登录链接'],
  sending: ['Sending…', '发送中…'],
  sent: ['Check your inbox: the link works for 15 minutes.', '请查收邮件：链接 15 分钟内有效。'],
  or: ['or', '或'],
  with: ['Continue with', '使用'],
  devLink: ['Development: open the sign-in link', '开发模式：打开登录链接'],
  failed: ['That did not work. Check the address and try again in a moment.', '没有成功。请检查邮箱地址，稍后再试。'],
  perks: [
    ['Every course: 112 lessons with labs and quizzes', '全部课程：112 节课，含实验与测验'],
    ['Your progress and scores, saved on every device', '学习进度和成绩，多设备同步'],
    ['A learning dashboard and Daily Planet streaks', '学习看板与每日星球连胜记录'],
  ],
  fine: ['Signing in creates an account if you do not have one.', '若尚无账号，登录时会自动创建。'],
  closed: ['Sign-in is not available on this server.', '此服务器暂未开放登录。'],
  errors: {
    Verification: ['That link has expired or was already used. Ask for a new one.', '该链接已过期或已使用，请重新获取。'],
    OAuthAccountNotLinked: ['That e-mail is already linked to another sign-in method.', '该邮箱已关联其他登录方式。'],
    EmailSignin: ['We could not send the e-mail. Try again in a moment.', '邮件发送失败，请稍后再试。'],
  } as Record<string, [string, string]>,
  error: ['Sign-in failed. Please try again.', '登录失败，请重试。'],
} as const;

/** Only same-site paths: a sign-in link must not send the learner elsewhere. */
const safePath = (s: unknown): string => (typeof s === 'string' && /^\/(?!\/|\\)/.test(s) ? s : '/#signed-in');

export default async function SignIn({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams, lang = await langOf(q.lang), t = (p: readonly [string, string]) => pick(lang, p);
  const callbackUrl = safePath(q.callbackUrl);
  if (await me()) redirect(callbackUrl);
  const list = authOptions.providers.map(p => ({ id: p.id, name: p.name, type: p.type }));
  const email = list.some(p => p.type === 'email');
  const oauth = list.filter(p => p.type === 'oauth').map(({ id, name }) => ({ id, name }));
  const err = typeof q.error === 'string' ? (T.errors[q.error] ?? T.error) : null;
  return (
    <div lang={lang === 'zh' ? 'zh-CN' : 'en'}>
      <Top lang={lang} here={`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`} />
      <main className="auth">
        <section className="card">
          <h1>{t(T.title)}</h1>
          <p className="lead">{t(T.lead)}</p>
          {q.sent && <p className="note ok" role="status">{t(T.sent)}</p>}
          {err && <p className="note err" role="alert">{t(err)}</p>}
          {email || oauth.length
            ? <SignInForm t={{ email: t(T.email), send: t(T.send), sending: t(T.sending), sent: t(T.sent), or: t(T.or), with: t(T.with), devLink: t(T.devLink), failed: t(T.failed) }}
                email={email} oauth={oauth} callbackUrl={callbackUrl} dev={devLogin()} />
            : <p className="note err">{t(T.closed)}</p>}
          <ul className="perks">{T.perks.map(p => <li key={p[0]}>{t(p)}</li>)}</ul>
          <p className="fine">{t(T.fine)}</p>
        </section>
      </main>
    </div>
  );
}
