/** Generates crawlable static pages (encyclopedia, about, privacy, 404, sitemap) into dist/. */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BY_TYPE, CATALOGUE } from '../src/shared/data/catalogue.ts';
import { CONTINENT_NAMES } from '../src/shared/data/iso.ts';
import { WIKI } from '../src/shared/data/wiki.ts';
import { haversineKm } from '../src/shared/lib/geo.ts';
import { TYPE_META, TYPE_ORDER } from '../src/shared/data/typemeta.ts';
import type { CatalogueItem } from '../src/shared/data/types.ts';
import { icon, TYPE_ICON, type IconName } from '../src/client/ui/icons.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, process.argv[2] ?? 'dist');
const SITE = (process.env.BASE_URL ?? 'https://terrastra.example').replace(/\/$/, '');
// Path prefix when hosted below the domain root (GitHub Pages project site: "/<repo>/").
const BASE = ('/' + (process.env.BASE_PATH ?? '/') + '/').replace(/\/+/g, '/');
const STATIC = process.env.VITE_STATIC === '1';
const withBase = (html: string) => html.replace(/\b(href|src)="\/(?!\/)/g, `$1="${BASE}`);
if (!existsSync(out)) mkdirSync(out, { recursive: true });

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
type Bi = { en: string; zh?: string };
/** Both languages live in the DOM (crawlable); CSS shows the one picked in the app (shared `pp.lang` key). */
const bi = (t: Bi, tag = 'span', cls = '') =>
  `<${tag} class="en${cls ? ' ' + cls : ''}">${esc(t.en)}</${tag}>` + (t.zh ? `<${tag} class="zh${cls ? ' ' + cls : ''}" lang="zh-CN">${esc(t.zh)}</${tag}>` : '');
const T = (en: string, zh: string): Bi => ({ en, zh });

const SECTIONS = TYPE_ORDER.filter(ty => TYPE_META[ty].section && BY_TYPE[ty].length)
  .map(ty => ({ ty, dir: TYPE_META[ty].section, title: TYPE_META[ty].many, one: TYPE_META[ty].one, hint: TYPE_META[ty].hint, items: BY_TYPE[ty], icon: TYPE_ICON[ty] }));
const SECTION_OF = new Map(SECTIONS.flatMap(s => s.items.map(it => [it.key, s] as const)));

const regions = { en: new Intl.DisplayNames(['en'], { type: 'region' }), zh: new Intl.DisplayNames(['zh-Hans'], { type: 'region' }) };
const country = (a2?: string): Bi | null => {
  if (!a2) return null;
  if (a2 === 'XK') return T('Kosovo', '科索沃');
  try { return { en: regions.en.of(a2) ?? a2, zh: regions.zh.of(a2) ?? a2 }; } catch { return { en: a2 }; }
};
const where = (it: CatalogueItem): Bi => {
  const c = country(it.country), k = CONTINENT_NAMES[it.continent];
  return { en: [c?.en, k?.en].filter(Boolean).join(' · '), zh: [c?.zh, k?.zh].filter(Boolean).join(' · ') };
};
const coord = (la: number, lo: number) => `${Math.abs(la).toFixed(2)}°${la >= 0 ? 'N' : 'S'}, ${Math.abs(lo).toFixed(2)}°${lo >= 0 ? 'E' : 'W'}`;
const wikiUrl = (l: 'en' | 'zh', title: string) => `https://${l}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}${l === 'zh' ? '?variant=zh-cn' : ''}`;

const FONT = (f: string, file: string, w: string, range = '') => `@font-face{font-family:"${f}";src:url("${BASE}fonts/${file}") format("woff2");font-weight:${w};font-display:swap${range ? `;unicode-range:${range}` : ''}}`;
const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215';
/* Same "Astrolabe" identity as the app (src/client/hud.css): cut-corner slabs with hairline cuts, ice-cyan ink,
   one amber signal for what is current, Chakra Petch display / Geist Mono data / Geist reading, blueprint grid + stars. */
const CSS = `${FONT('Geist', 'geist.woff2', '100 900')}${FONT('Geist Mono', 'geist-mono.woff2', '100 900')}${FONT('Chakra Petch', 'chakra-petch-500.woff2', '400 500', LATIN)}${FONT('Chakra Petch', 'chakra-petch-600.woff2', '600 700', LATIN)}
:root{--bg:#02060c;--slab:rgba(4,11,20,.86);--slab-hi:rgba(8,24,40,.92);--fill:rgba(125,211,252,.07);--fill-hi:rgba(125,211,252,.15);--line:rgba(125,211,252,.14);--edge:rgba(125,211,252,.26);--edge-hi:rgba(125,211,252,.55);
--hud:#7dd3fc;--hi:#e0f2fe;--dim:rgba(125,211,252,.62);--text:#eef6fb;--text-2:#c4d4df;--muted:#8ea3b4;--sig:#ffb547;--sig-fill:rgba(255,181,71,.11);--sig-line:rgba(255,181,71,.55);
--cjk:"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Noto Sans SC","Source Han Sans SC","Microsoft YaHei";--font:"Geist",var(--cjk),system-ui,-apple-system,"Segoe UI",sans-serif;--disp:"Chakra Petch",var(--cjk),"Geist",system-ui,sans-serif;--mono:"Geist Mono",var(--cjk),ui-monospace,SFMono-Regular,Menlo,monospace;--ease:cubic-bezier(.2,.8,.2,1)}
*{box-sizing:border-box}html{color-scheme:dark;scrollbar-color:rgba(125,211,252,.3) transparent}::selection{background:rgba(255,181,71,.35);color:#fff}
body{margin:0;font:15px/1.7 var(--font);background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased;min-height:100vh;display:flex;flex-direction:column}
body::before{content:"";position:fixed;inset:0;z-index:-2;background:radial-gradient(1000px 560px at 82% -12%,rgba(56,189,248,.16),transparent 70%),radial-gradient(760px 460px at -8% 4%,rgba(99,102,241,.12),transparent 70%),radial-gradient(900px 600px at 50% 120%,rgba(14,116,144,.12),transparent 70%),
linear-gradient(rgba(125,211,252,.035) 1px,transparent 1px) 0 0/56px 56px,linear-gradient(90deg,rgba(125,211,252,.035) 1px,transparent 1px) 0 0/56px 56px}
body::after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.75;background:
radial-gradient(1px 1px at 12% 18%,#fff,transparent),radial-gradient(1px 1px at 72% 9%,#dbeafe,transparent),radial-gradient(1.4px 1.4px at 38% 64%,#fff,transparent),radial-gradient(1px 1px at 88% 52%,#e0f2fe,transparent),
radial-gradient(1px 1px at 22% 86%,#fff,transparent),radial-gradient(1.2px 1.2px at 58% 34%,#fde68a,transparent),radial-gradient(1px 1px at 94% 88%,#fff,transparent),radial-gradient(1px 1px at 4% 48%,#bae6fd,transparent);background-size:420px 420px,530px 530px,610px 610px,470px 470px,380px 380px,690px 690px,560px 560px,500px 500px}
a{color:inherit}html[data-l=zh] .en,html:not([data-l=zh]) .zh{display:none!important}
.ico{flex:none}
.wrap{max-width:1160px;margin:0 auto;padding:0 28px}
/* slab silhouette: two opposed cut corners with hairline cuts */
.slab,.card,.panel,.hero,.stats,.fun,.btn,.search,.lang,.rules li,.credit{--cut:12px;--e:var(--edge);
clip-path:polygon(var(--cut) 0,100% 0,100% calc(100% - var(--cut)),calc(100% - var(--cut)) 100%,0 100%,0 var(--cut));border:1px solid var(--line);
background:linear-gradient(135deg,transparent calc(50% - .5px),var(--e) calc(50% - .5px) calc(50% + 1px),transparent calc(50% + 1px)) left top/var(--cut) var(--cut) no-repeat border-box,
linear-gradient(315deg,transparent calc(50% - .5px),var(--e) calc(50% - .5px) calc(50% + 1px),transparent calc(50% + 1px)) right bottom/var(--cut) var(--cut) no-repeat border-box,var(--bgc,var(--slab))}
.card,.credit,.rules li{--cut:10px}.btn,.search,.lang{--cut:7px}
/* panels carry the amber signal tab (top edge) and ruler ticks (bottom edge) */
.panel,.hero,.stats{background:linear-gradient(var(--sig),var(--sig)) calc(var(--cut) + 8px) 0/18px 2px no-repeat border-box,repeating-linear-gradient(90deg,var(--e) 0 1px,transparent 1px 5px) right calc(var(--cut) + 8px) bottom 2px/36px 4px no-repeat border-box,
linear-gradient(135deg,transparent calc(50% - .5px),var(--e) calc(50% - .5px) calc(50% + 1px),transparent calc(50% + 1px)) left top/var(--cut) var(--cut) no-repeat border-box,
linear-gradient(315deg,transparent calc(50% - .5px),var(--e) calc(50% - .5px) calc(50% + 1px),transparent calc(50% + 1px)) right bottom/var(--cut) var(--cut) no-repeat border-box,var(--bgc,var(--slab))}
/* ---- top bar ---- */
.top{position:sticky;top:0;z-index:5;background:rgba(2,7,14,.82);backdrop-filter:blur(14px) saturate(140%);border-bottom:1px solid var(--line)}
.top::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:1px;background:linear-gradient(90deg,transparent 38%,rgba(224,242,254,.85) 50%,transparent 62%);opacity:0;animation:sweep 9s ease-in-out infinite}
.top .wrap{display:flex;align-items:center;gap:20px;min-height:64px}
.brand{display:flex;align-items:center;gap:12px;text-decoration:none;white-space:nowrap;font:600 1.02rem var(--disp);letter-spacing:.14em;text-transform:uppercase;color:var(--hi);text-shadow:0 0 16px rgba(125,211,252,.4)}
.mark{position:relative;width:20px;height:20px;border-radius:50%;flex:none;background:radial-gradient(circle at 34% 30%,#e0f2fe 0 8%,#38bdf8 32%,#0c4a6e 80%);box-shadow:0 0 0 1px rgba(255,255,255,.18) inset,0 0 16px rgba(56,189,248,.45)}
.mark::after{content:"";position:absolute;inset:3px -7px;border:1px solid var(--sig-line);border-radius:50%;transform:rotate(-22deg)}
.top nav{flex:1;display:flex;gap:2px;overflow-x:auto;scrollbar-width:none;mask-image:linear-gradient(90deg,#000 90%,transparent)}
.top nav a{position:relative;padding:8px 11px;color:var(--dim);text-decoration:none;font:500 .74rem var(--mono);letter-spacing:.1em;text-transform:uppercase;white-space:nowrap;transition:color .15s}
.top nav a:hover{color:var(--hi)}.top nav a[aria-current]{color:var(--hi)}
.top nav a[aria-current]::after{content:"";position:absolute;left:11px;right:11px;bottom:0;height:2px;background:var(--sig);box-shadow:0 0 10px rgba(255,181,71,.6)}
.lang{display:inline-flex;padding:3px;gap:2px;--bgc:var(--fill)}
.lang button{background:none;border:0;color:var(--dim);font:500 .72rem var(--mono);letter-spacing:.08em;padding:6px 10px;cursor:pointer}
html:not([data-l=zh]) .lang [data-set=en],html[data-l=zh] .lang [data-set=zh]{background:var(--sig-fill);color:var(--sig);box-shadow:inset 0 -2px 0 var(--sig)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;min-height:42px;padding:0 18px;--bgc:var(--fill-hi);--e:var(--edge-hi);border-color:var(--edge);color:var(--hi);font:600 .82rem var(--disp);letter-spacing:.12em;text-transform:uppercase;text-decoration:none;white-space:nowrap;transition:background-color .15s,box-shadow .15s,color .15s}
.btn:hover{--bgc:rgba(125,211,252,.24);color:#fff;box-shadow:0 0 18px rgba(125,211,252,.25)}
.btn.sig{--bgc:var(--sig-fill);--e:var(--sig-line);border-color:var(--sig-line);color:var(--sig)}.btn.sig:hover{--bgc:rgba(255,181,71,.2);color:#ffdca8;box-shadow:0 0 18px rgba(255,181,71,.25)}
.btn.ghost{--bgc:transparent;--e:var(--edge);border-color:var(--line);color:var(--dim)}.btn.ghost:hover{color:var(--hi);--bgc:var(--fill)}
/* ---- type ---- */
main{flex:1;padding:44px 0 72px;counter-reset:sec}
.eyebrow{display:flex;align-items:center;gap:10px;margin:0 0 12px;color:var(--dim);font:500 .72rem var(--mono);letter-spacing:.16em;text-transform:uppercase}
.eyebrow::before{content:"";width:18px;height:2px;background:var(--sig);box-shadow:0 0 8px rgba(255,181,71,.6)}
h1{margin:0;font:600 clamp(2.1rem,4.6vw,3.4rem)/1.08 var(--disp);letter-spacing:.02em;color:#f0f9ff;text-shadow:0 0 22px rgba(125,211,252,.28)}
h2{counter-increment:sec;display:flex;align-items:center;gap:12px;margin:44px 0 16px;font:500 .74rem var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
h2::before{content:counter(sec,decimal-leading-zero);color:var(--sig)}h2::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,var(--edge),transparent)}
.sub{color:var(--muted);font-size:1.02rem;max-width:64ch;margin:14px 0 0}
.crumbs{display:flex;gap:10px;align-items:center;color:var(--dim);font:500 .72rem var(--mono);letter-spacing:.12em;text-transform:uppercase;margin-bottom:24px}.crumbs a{color:var(--dim);text-decoration:none}.crumbs a:hover{color:var(--hi)}.crumbs span{opacity:.5}
.mono{font-family:var(--mono);font-size:.86rem;color:var(--text-2);letter-spacing:.04em}
/* ---- search + cards ---- */
.search{margin:28px 0 20px;display:flex;align-items:center;gap:10px;max-width:440px;padding:0 14px;color:var(--dim);--bgc:var(--slab)}
.search input{flex:1;background:none;border:0;outline:0;color:var(--hi);font:500 .9rem var(--mono);letter-spacing:.04em;padding:12px 0}.search input::placeholder{color:var(--dim);opacity:.7}.search:focus-within{--e:var(--edge-hi);border-color:var(--edge)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px;padding:0;margin:0;list-style:none}
.card{position:relative;display:flex;gap:14px;align-items:center;padding:14px 16px;text-decoration:none;height:100%;transition:background-color .18s,border-color .18s,transform .18s var(--ease)}
.card:hover{--bgc:var(--slab-hi);--e:var(--edge-hi);border-color:var(--edge);transform:translateY(-1px)}
.card:hover .tile{color:var(--hi);border-color:var(--edge);box-shadow:0 0 14px rgba(125,211,252,.22) inset}
.tile{flex:none;display:grid;place-items:center;width:44px;height:44px;color:var(--hud);border:1px solid var(--line);background:var(--fill);font:600 1.05rem var(--disp);transition:color .18s,border-color .18s,box-shadow .18s}
.card b{display:block;font-weight:500;font-size:.95rem;line-height:1.35;color:var(--text)}.card small{display:block;color:var(--muted);font-size:.78rem;margin-top:3px;line-height:1.45}
.idx{position:absolute;top:7px;right:12px;font:500 .62rem var(--mono);letter-spacing:.1em;color:var(--dim);opacity:.7;font-style:normal}
.hub .card{align-items:flex-start;padding:20px 18px 18px}.hub .card b{font:600 1.08rem var(--disp);letter-spacing:.04em}
.count{display:inline-flex;align-items:baseline;gap:6px;margin-top:10px!important;font:500 .7rem var(--mono)!important;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)!important}.count strong{font:600 1.1rem var(--mono);color:var(--sig);letter-spacing:0}
/* ---- item page ---- */
.item{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:44px;align-items:start}
.hero{position:relative;display:grid;place-items:center;height:280px;margin-bottom:30px;overflow:hidden;--bgc:radial-gradient(55% 70% at 50% 55%,rgba(56,189,248,.14),transparent 72%),linear-gradient(rgba(125,211,252,.05) 1px,transparent 1px) 0 0/28px 28px,linear-gradient(90deg,rgba(125,211,252,.05) 1px,transparent 1px) 0 0/28px 28px,rgba(3,9,17,.92)}
.hero::before,.hero::after{content:"";position:absolute;background:linear-gradient(90deg,transparent,var(--line) 20% 42%,transparent 42% 58%,var(--line) 58% 80%,transparent)}
.hero::before{left:0;right:0;top:50%;height:1px}.hero::after{top:0;bottom:0;left:50%;width:1px;background:linear-gradient(transparent,var(--line) 20% 34%,transparent 34% 66%,var(--line) 66% 80%,transparent)}
.reticle{position:relative;width:176px;height:176px;display:grid;place-items:center}
.ring{position:absolute;inset:0;border-radius:50%;border:1px solid var(--edge)}
.ring.r2{inset:20px;border:1px dashed rgba(125,211,252,.4);animation:spin 48s linear infinite}
.ring.r3{inset:-30px;border:0;background:repeating-conic-gradient(rgba(125,211,252,.5) 0 .8deg,transparent .8deg 10deg);-webkit-mask:radial-gradient(circle,transparent calc(50% - 7px),#000 calc(50% - 7px) 50%,transparent 50%);mask:radial-gradient(circle,transparent calc(50% - 7px),#000 calc(50% - 7px) 50%,transparent 50%);animation:spin 120s linear infinite reverse}
.ring.r4{inset:-12px;border:0;background:conic-gradient(from 300deg,var(--sig) 0 22deg,transparent 22deg 180deg,var(--sig) 180deg 202deg,transparent 202deg);-webkit-mask:radial-gradient(circle,transparent calc(50% - 2px),#000 calc(50% - 2px) 50%,transparent 50%);mask:radial-gradient(circle,transparent calc(50% - 2px),#000 calc(50% - 2px) 50%,transparent 50%);opacity:.85;animation:spin 18s linear infinite}
.glyph{color:var(--hi);filter:drop-shadow(0 0 12px rgba(125,211,252,.55))}.glyph svg{stroke-width:1.1}
.hc{position:absolute;font:500 .66rem var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}.hc b{color:var(--sig);font-weight:500}
.hc.tl{top:16px;left:22px}.hc.tr{top:16px;right:22px}.hc.bl{bottom:16px;left:22px;color:var(--hi)}.hc.br{bottom:16px;right:22px}
.chip{display:inline-flex;align-items:center;gap:7px;font:500 .7rem var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--sig);padding:4px 10px;border:1px solid var(--sig-line);background:var(--sig-fill)}
.meta{display:flex;flex-wrap:wrap;gap:12px;align-items:center;color:var(--muted);font-size:.86rem;margin:0 0 14px}
.alt{margin:8px 0 0;font:500 .9rem var(--disp);letter-spacing:.08em;color:var(--dim)}.lead{font-size:1.1rem;line-height:1.8;color:var(--text-2);margin:24px 0 0;max-width:68ch}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin:30px 0 0;padding:4px 0}
.stats div{padding:14px 18px;border-left:1px solid var(--line)}.stats div:first-child{border-left:0}
.stats dt{color:var(--dim);font:500 .64rem var(--mono);letter-spacing:.14em;text-transform:uppercase}.stats dd{margin:4px 0 0;font:500 1.06rem var(--mono);color:var(--hi);font-variant-numeric:tabular-nums}
.fun{margin:30px 0 0;padding:18px 20px 18px 22px;color:var(--text-2);--bgc:linear-gradient(var(--sig),var(--sig)) left top/3px 100% no-repeat,rgba(255,181,71,.05);--e:var(--sig-line);border-color:rgba(255,181,71,.25)}
.fun b{display:block;color:var(--sig);font:500 .7rem var(--mono);letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px}
.links{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
.side{position:sticky;top:88px;display:flex;flex-direction:column;gap:12px}
.panel{padding:20px}.panel h3{margin:0 0 12px;font:500 .68rem var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}.panel .btn{width:100%}
.near{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}.near a{display:flex;gap:11px;align-items:center;padding:9px 6px;margin:0 -6px;border-bottom:1px solid rgba(125,211,252,.06);text-decoration:none;font-size:.88rem;color:var(--text-2);transition:color .15s,background-color .15s}
.near li:last-child a{border-bottom:0}.near a:hover{color:var(--hi);background:var(--fill)}.near .ico{color:var(--dim)}.near a:hover .ico{color:var(--hud)}
.near i{margin-left:auto;font:500 .7rem var(--mono);font-style:normal;color:var(--dim)}
.pager{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:44px}.pager a{display:flex;flex-direction:column;gap:2px;padding:14px 16px;text-decoration:none;color:var(--text-2);font-size:.92rem}.pager a:last-child{text-align:right;align-items:flex-end}
.pager small{font:500 .64rem var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
/* ---- prose pages ---- */
.prose{max-width:76ch}.prose p{color:var(--text-2)}.prose a,.credit a{color:var(--hud);text-decoration:none;border-bottom:1px solid var(--edge);transition:color .15s,border-color .15s}.prose a:hover,.credit a:hover{color:var(--hi);border-color:var(--hud)}.credit b a{color:var(--hi);border-bottom-color:transparent}
.rules{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;counter-reset:r}
.rules li{counter-increment:r;display:grid;grid-template-columns:34px 1fr;gap:12px;padding:14px 18px;color:var(--text-2)}.rules li::before{content:counter(r,decimal-leading-zero);font:500 .74rem/1.9 var(--mono);color:var(--sig)}
.credits{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
.credit{display:flex;flex-direction:column;gap:4px;padding:16px 18px}.credit b{font:600 .98rem var(--disp);letter-spacing:.04em;color:var(--hi)}.credit span{color:var(--muted);font-size:.86rem}
.credit em{margin-top:6px;align-self:flex-start;font:500 .64rem var(--mono);font-style:normal;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);border:1px solid var(--line);padding:2px 7px}
.feats{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}.feats .card{align-items:flex-start}
.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:36px}
.empty{display:none;color:var(--muted);padding:20px 0;font-family:var(--mono)}
/* ---- footer ---- */
footer{border-top:1px solid var(--line);background:rgba(2,7,14,.7);color:var(--muted);font-size:.82rem}
footer .wrap{display:flex;flex-wrap:wrap;align-items:center;gap:16px;justify-content:space-between;padding-top:22px;padding-bottom:26px}
.fbrand{display:flex;align-items:center;gap:10px}.fbrand .mark{width:14px;height:14px}.fbrand .mark::after{inset:2px -5px}
footer nav{display:flex;gap:4px}footer nav a{display:inline-flex;align-items:center;gap:7px;padding:8px 10px;color:var(--dim);text-decoration:none;font:500 .72rem var(--mono);letter-spacing:.12em;text-transform:uppercase;transition:color .15s}footer nav a:hover,footer nav a[aria-current]{color:var(--hi)}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes sweep{0%{transform:translateX(-42%);opacity:0}6%{opacity:1}18%{transform:translateX(42%);opacity:0}100%{transform:translateX(42%);opacity:0}}
@media (prefers-reduced-motion:reduce){*,::before,::after{animation:none!important;transition:none!important}}
@media (max-width:900px){.item{grid-template-columns:1fr;gap:28px}.side{position:static}.hero{height:230px}main{padding-top:28px}
.top .wrap{flex-wrap:wrap;gap:10px 14px;padding-top:10px}.top nav{order:3;flex-basis:100%;margin:0 -10px}.lang{margin-left:auto}}
@media (max-width:560px){.wrap{padding:0 16px}.top .btn{display:none}.brand{font-size:.9rem;letter-spacing:.1em}.reticle{transform:scale(.8)}.hc.tr,.hc.br{display:none}.pager{grid-template-columns:1fr}footer nav{flex-wrap:wrap}}`;

const LANG_JS = `(function(){var d=document.documentElement,k='pp.lang',l;try{l=JSON.parse(localStorage.getItem(k))}catch(e){}if(l!=='en'&&l!=='zh')l=(navigator.language||'').slice(0,2)==='zh'?'zh':'en';d.dataset.l=l;
document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-set]');if(!b)return;d.dataset.l=b.dataset.set;try{localStorage.setItem(k,JSON.stringify(b.dataset.set))}catch(e){}});})();`;
const FILTER_JS = `(function(){var q=document.getElementById('q');if(!q)return;var cs=[].slice.call(document.querySelectorAll('[data-q]')),em=document.querySelector('.empty');
q.addEventListener('input',function(){var v=q.value.trim().toLowerCase(),n=0;cs.forEach(function(c){var on=!v||c.dataset.q.indexOf(v)>=0;c.hidden=!on;n+=on?1:0});em.style.display=n?'none':'block'})})();`;

const MARK = '<span class="mark" aria-hidden="true"></span>';
const BRAND = T('Terrastra', '寰星');
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

function page(path: string, title: string, desc: string, body: string, opts: { jsonld?: object; current?: string; script?: string } = {}): void {
  const cur = (k: string) => (opts.current === k ? ' aria-current="page"' : '');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${SITE}${path}"><meta name="theme-color" content="#02060c">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><link rel="icon" href="/favicon.svg">
<link rel="preload" href="/fonts/chakra-petch-600.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/fonts/geist-mono.woff2" as="font" type="font/woff2" crossorigin><script>${LANG_JS}</script>
<style>${CSS}</style>${opts.jsonld ? `<script type="application/ld+json">${JSON.stringify(opts.jsonld).replace(/</g, '\\u003c')}</script>` : ''}</head>
<body><header class="top"><div class="wrap"><a class="brand" href="/">${MARK}${bi(BRAND)}</a>
<nav aria-label="Encyclopedia"><a href="/encyclopedia/"${cur('hub')}>${bi(T('All', '全部'))}</a>${SECTIONS.map(s => `<a href="/${s.dir}/"${cur(s.dir)}>${bi(s.title)}</a>`).join('')}</nav>
<div class="lang" role="group" aria-label="Language"><button data-set="en">EN</button><button data-set="zh">中文</button></div>
<a class="btn" href="/">${icon('globe', 16)}${bi(T('Open globe', '打开地球'))}</a></div></header>
<main><div class="wrap">${body}</div></main>
<footer><div class="wrap"><span class="fbrand">${MARK}${bi(T('Terrastra — an original 3D planet toy for curious kids.', '寰星——为好奇的孩子打造的原创 3D 星球玩具。'))}</span>
<nav aria-label="Site">${FOOT.map(([href, ic, label, key]) => `<a href="${href}"${cur(key)}>${icon(ic, 14)}${bi(label)}</a>`).join('')}</nav></div></footer>
${opts.script ? `<script>${opts.script}</script>` : ''}</body></html>`;
  const file = join(out, path, 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, withBase(html));
}
const FOOT: [string, IconName, Bi, string][] = [['/about/', 'bulb', T('About', '关于'), 'about'], ['/encyclopedia/', 'book', T('Encyclopedia', '百科'), 'hub'], ['/privacy/', 'eye', T('Privacy', '隐私'), 'privacy']];

const num = (n: number) => n.toLocaleString('en');
const era = (y: number): Bi => y < 0 ? T(`${num(-y)} BCE`, `公元前 ${num(-y)} 年`) : T(String(y), `${y} 年`);
const DIET: Record<string, Bi> = { carnivore: T('Meat-eater', '吃肉'), herbivore: T('Plant-eater', '吃植物'), omnivore: T('Eats everything', '什么都吃') };
function stats(it: CatalogueItem): string {
  const f = it.facts ?? {};
  const row: [Bi, Bi][] = [];
  if (f.built !== undefined) row.push([T('Built', '建成'), era(f.built)]);
  if (f.year !== undefined) row.push([T('Year', '年份'), era(f.year)]);
  if (f.born !== undefined) row.push([T('Born', '出生'), era(f.born)]);
  if (f.died !== undefined) row.push([T('Died', '逝世'), era(f.died)]);
  if (f.mya !== undefined) row.push([T('Lived', '生活年代'), T(`${num(f.mya)} million years ago`, `${num(f.mya * 100)} 万年前`)]);
  if (f.heightM) row.push([T('Height', '高度'), T(`${num(f.heightM)} m`, `${num(f.heightM)} 米`)]);
  if (f.lengthM) row.push([T('Length', '长度'), f.lengthM >= 10000 ? T(`${num(Math.round(f.lengthM / 1000))} km`, `${num(Math.round(f.lengthM / 1000))} 千米`) : T(`${num(f.lengthM)} m`, `${num(f.lengthM)} 米`)]);
  if (f.depthM) row.push([T('Depth', '深度'), T(`${num(f.depthM)} m`, `${num(f.depthM)} 米`)]);
  if (f.weightKg) row.push([T('Weight', '重量'), f.weightKg >= 1000 ? T(`${num(Math.round(f.weightKg / 100) / 10)} t`, `${num(Math.round(f.weightKg / 100) / 10)} 吨`) : T(`${num(f.weightKg)} kg`, `${num(f.weightKg)} 千克`)]);
  if (f.speedKmh) row.push([T('Top speed', '最高速度'), T(`${num(f.speedKmh)} km/h`, `${num(f.speedKmh)} 千米/时`)]);
  if (f.lifespanY) row.push([T('Lifespan', '寿命'), T(`${num(f.lifespanY)} years`, `${num(f.lifespanY)} 年`)]);
  if (it.diet) row.push([T('Diet', '食性'), DIET[it.diet] ?? T(it.diet, it.diet)]);
  if (it.habitat) row.push([T('Lives in', '栖息地'), it.habitat]);
  return row.length ? `<dl class="stats">${row.map(([k, v]) => `<div><dt>${bi(k)}</dt><dd>${bi(v)}</dd></div>`).join('')}</dl>` : '';
}

const searchKey = (it: CatalogueItem) => esc([it.name.en, it.name.zh, where(it).en, where(it).zh].filter(Boolean).join(' ').toLowerCase());
const card = (it: CatalogueItem, dir: string, ic: IconName, i: number) => `<li data-q="${searchKey(it)}"><a class="card" href="/${dir}/${it.slug}/">
<span class="tile" aria-hidden="true">${icon(ic, 22)}</span><span><b>${bi(it.name)}</b><small>${bi(where(it))}</small></span><i class="idx">${pad(i + 1, 3)}</i></a></li>`;

const urls: string[] = ['/', '/encyclopedia/', '/about/', '/privacy/'];
const total = SECTIONS.reduce((n, s) => n + s.items.length, 0);
page('/encyclopedia/', 'Encyclopedia — Terrastra', `Explore ${total} places, animals and wonders on a friendly 3D globe for kids.`,
  `<p class="eyebrow">${bi(T('Encyclopedia', '百科'))}</p><h1>${bi(T('Explore the planet', '探索地球'))}</h1>
<p class="sub">${bi(T(`${total} places, animals and wonders — each one has a 3D model waiting on the globe.`, `${total} 个地点、动物和奇观——每一个都在地球上有一个 3D 模型等你发现。`))}</p>
<h2>${bi(T('Sections', '分类'))}</h2><ul class="cards hub">${SECTIONS.map((s, i) => `<li><a class="card" href="/${s.dir}/"><span class="tile" aria-hidden="true">${icon(s.icon, 22)}</span>
<span><b>${bi(s.title)}</b><small>${bi(s.hint)}</small><small class="count"><strong>${s.items.length}</strong>${bi(T('entries', '个条目'))}</small></span><i class="idx">${pad(i + 1)}</i></a></li>`).join('')}</ul>`, { current: 'hub' });

for (const [si, s] of SECTIONS.entries()) {
  page(`/${s.dir}/`, `${s.title.en} — Terrastra`, `Explore ${s.items.length} ${s.title.en.toLowerCase()} on a friendly 3D globe for kids.`,
    `<nav class="crumbs"><a href="/encyclopedia/">${bi(T('Encyclopedia', '百科'))}</a><span>/</span>${pad(si + 1)}</nav>
<p class="eyebrow">${s.items.length} ${bi(T('entries', '个条目'))}</p><h1>${bi(s.title)}</h1><p class="sub">${bi(s.hint)}</p>
<label class="search">${icon('search', 16)}<input id="q" type="search" placeholder="Search · 搜索" aria-label="Search"></label>
<ul class="cards">${s.items.map((it, i) => card(it, s.dir, s.icon, i)).join('')}</ul><p class="empty">${bi(T('Nothing found', '没有找到'))}</p>`,
    { current: s.dir, script: FILTER_JS });
  urls.push(`/${s.dir}/`);
  s.items.forEach((it, i) => {
    const path = `/${s.dir}/${it.slug}/`;
    urls.push(path);
    const w = WIKI[it.key];
    const near = s.items.length && !it.route ? CATALOGUE.filter(o => o.key !== it.key && !o.route && SECTION_OF.has(o.key))
      .map(o => ({ o, d: haversineKm(it.lat, it.lon, o.lat, o.lon) })).sort((a, b) => a.d - b.d).slice(0, 6) : [];
    const prev = s.items[(i - 1 + s.items.length) % s.items.length], next = s.items[(i + 1) % s.items.length];
    const wh = where(it);
    const code = `${pad(si + 1)}·${pad(i + 1, 3)}`;
    page(path, `${it.name.en} — Terrastra`, it.desc.en,
      `<nav class="crumbs"><a href="/encyclopedia/">${bi(T('Encyclopedia', '百科'))}</a><span>/</span><a href="/${s.dir}/">${bi(s.title)}</a><span>/</span>${code}</nav>
<div class="item"><article>
<div class="hero" aria-hidden="true"><div class="reticle"><span class="ring r3"></span><span class="ring r4"></span><span class="ring"></span><span class="ring r2"></span><span class="glyph">${icon(s.icon, 72)}</span></div>
<span class="hc tl"><b>●</b> ${bi(T('Target', '目标'))} ${code}</span><span class="hc tr">${bi(s.one)}</span>
<span class="hc bl">${it.route ? bi(T('Route', '航线')) : coord(it.lat, it.lon)}</span><span class="hc br">${wh.en ? bi(wh) : ''}</span></div>
<p class="meta"><span class="chip">${bi(s.one)}</span>${wh.en ? bi(wh) : ''}</p>
<h1>${bi(it.name)}</h1><p class="alt"><span class="zh">${esc(it.name.en)}</span>${it.name.zh ? `<span class="en" lang="zh-CN">${esc(it.name.zh)}</span>` : ''}</p>
${bi(it.desc, 'p', 'lead')}${stats(it)}
${it.funFact ? `<div class="fun"><b>${bi(T('Fun fact', '趣味知识'))}</b>${bi(it.funFact, 'span')}</div>` : ''}
${w ? `<h2>${bi(T('Read more', '延伸阅读'))}</h2><div class="links"><a class="card" href="${wikiUrl('en', w[0])}" rel="noopener"><span class="tile" aria-hidden="true">W</span><span><b>Wikipedia</b><small>${esc(w[0])}</small></span></a>
${w[1] ? `<a class="card" href="${wikiUrl('zh', w[1])}" rel="noopener" lang="zh-CN"><span class="tile" aria-hidden="true">维</span><span><b>维基百科</b><small>${esc(w[1])}</small></span></a>` : ''}</div>` : ''}
<nav class="pager"><a class="card" href="/${s.dir}/${prev.slug}/"><small>← ${bi(T('Previous', '上一个'))}</small>${bi(prev.name)}</a><a class="card" href="/${s.dir}/${next.slug}/"><small>${bi(T('Next', '下一个'))} →</small>${bi(next.name)}</a></nav>
</article><aside class="side">
<div class="panel"><a class="btn sig" href="/#${it.key}">${icon('globe', 16)}${bi(T('See it on the 3D globe', '在 3D 地球上查看'))}</a></div>
${it.route ? '' : `<div class="panel"><h3>${bi(T('Location', '位置'))}</h3><p class="mono" style="margin:0">${coord(it.lat, it.lon)}</p></div>`}
${near.length ? `<div class="panel"><h3>${bi(T('Nearby', '附近'))}</h3><ul class="near">${near.map(({ o, d }) => { const os = SECTION_OF.get(o.key)!; return `<li><a href="/${os.dir}/${o.slug}/">${icon(os.icon, 16)}${bi(o.name)}<i>${num(Math.round(d))} km</i></a></li>`; }).join('')}</ul></div>` : ''}
</aside></div>`,
      { current: s.dir, jsonld: { '@context': 'https://schema.org', '@type': it.type === 'landmark' ? 'LandmarksOrHistoricalBuildings' : 'Thing', name: it.name.en, alternateName: it.name.zh, description: it.desc.en,
        ...(w ? { sameAs: [wikiUrl('en', w[0])] } : {}),
        ...(it.type === 'landmark' ? { geo: { '@type': 'GeoCoordinates', latitude: it.lat, longitude: it.lon } } : {}) } });
  });
}

// About (with the credits, which used to be a separate in-app modal)
const feat = (ic: IconName, t: Bi, d: Bi) => `<div class="card"><span class="tile" aria-hidden="true">${icon(ic, 22)}</span><span><b>${bi(t)}</b><small>${bi(d)}</small></span></div>`;
const credit = (name: Bi, role: Bi, lic: string, href?: string) => `<div class="credit"><b>${href ? `<a href="${href}" rel="noopener">${bi(name)}</a>` : bi(name)}</b><span>${bi(role)}</span><em>${esc(lic)}</em></div>`;
page('/about/', 'About — Terrastra', 'What Terrastra is, how to use it, and the people and data behind it.', `<div class="prose"><p class="eyebrow">${bi(T('About', '关于'))}</p><h1>${bi(T('About Terrastra', '关于寰星'))}</h1>
${bi(T('Terrastra is a free 3D planet toy for curious kids and the grown-ups who explore with them. Spin the Earth, zoom in to find landmarks, animals, ships, planes and trains, then keep zooming out — past the Moon and the planets to the Milky Way and the cosmic web.',
  '寰星是一个免费的 3D 星球玩具，送给好奇的孩子和陪他们一起探索的大人。转动地球、放大寻找地标、动物、轮船、飞机和火车；再一路缩小——越过月球和行星，直到银河系和宇宙大尺度结构。'), 'p', 'lead')}</div>
<h2>${bi(T('What you can do', '可以做什么'))}</h2><div class="feats">
${feat('globe', T(`${total} things on the globe`, `地球上的 ${total} 个条目`), T('Every landmark, animal and journey is a small 3D model drawn in code.', '每个地标、动物和旅程都是用代码绘制的小 3D 模型。'))}
${feat('planet', T('Solar System to cosmos', '从太阳系到宇宙'), T('Zoom through the planets, the Milky Way, the Local Group and superclusters.', '缩放穿越行星、银河系、本星系群和超星系团。'))}
${feat('telescope', T('Sky theatre', '星空剧场'), T('Watch eclipses, meteor showers and the night sky as they really happen.', '按真实时间观看日食月食、流星雨和星空。'))}
${feat('passport', T('Collect, snap and play', '收集、拍照与游戏'), T('Stamp your passport, take photos and play map games.', '在护照里盖章、拍照，并玩地图游戏。'))}
</div>
<div class="prose"><h2>${bi(T('Your data', '你的数据'))}</h2>
${STATIC ? bi(T('This edition runs entirely in your browser: your collection, photos and game records stay on this device.', '这个版本完全在浏览器中运行：你的收藏、照片和游戏记录都保存在这台设备上。'), 'p')
  : bi(T('Everything works without an account. Signing in with an email link simply keeps your collection in sync across devices.', '不登录也能使用全部功能。用邮箱链接登录只是为了在多台设备之间同步收藏。'), 'p')}
<p><a href="/privacy/">${bi(T('Read the privacy notes →', '查看隐私说明 →'))}</a></p></div>
<h2>${bi(T('Credits', '致谢'))}</h2><div class="credits">
${credit(T('Original 3D models', '原创 3D 模型'), T('Every model, planet and nebula is generated procedurally in code — no downloaded meshes or photos.', '所有模型、行星和星云都由代码程序化生成，没有下载任何网格或照片。'), 'Terrastra')}
${credit(T('three.js', 'three.js'), T('The WebGL 3D engine.', 'WebGL 3D 引擎。'), 'MIT', 'https://threejs.org/')}
${credit(T('Natural Earth · world-atlas', 'Natural Earth · world-atlas'), T('Country shapes and borders, decoded with topojson-client.', '国家轮廓与边界，使用 topojson-client 解码。'), 'Public domain · ISC', 'https://www.naturalearthdata.com/')}
${credit(T('NASA Visible Earth · GEBCO', 'NASA 可见地球 · GEBCO'), T('Land elevation and ocean depth behind the globe’s mountains, snow lines and sea floor.', '地球上的山脉起伏、雪线和海底深浅所用的陆地高程与海洋深度数据。'), 'Public domain', 'https://visibleearth.nasa.gov/images/73934/topography')}
${credit(T('Wikipedia', '维基百科'), T('Longer articles in the in-app reader, loaded live from Wikipedia.', '应用内阅读器中的长篇文章，实时从维基百科加载。'), 'CC BY-SA 4.0', 'https://www.wikipedia.org/')}
${credit(T('Radio Browser', 'Radio Browser 电台目录'), T('The live radio stations on the globe: a free, community-run directory. Streams come straight from each station.', '地球上的直播电台：一个免费、社区维护的电台目录。声音直接来自各个电台。'), 'Public domain', 'https://www.radio-browser.info/')}
${credit(T('Meeus · JPL · Espenak', 'Meeus · JPL · Espenak'), T('Positions of the Sun, Moon and planets, eclipses and ΔT (Astronomical Algorithms; JPL Keplerian elements).', '太阳、月球和行星的位置，日月食与 ΔT（《天文算法》、JPL 开普勒根数）。'), 'Published algorithms')}
${credit(T('d3-celestial · Hipparcos', 'd3-celestial · 依巴谷星表'), T('Stick figures for the 88 constellations and the positions and brightness of their stars.', '88 个星座的连线图形，以及其中恒星的位置与亮度。'), 'BSD-3-Clause © 2015 Olaf Frohn · ESA', 'https://github.com/ofrohn/d3-celestial')}
${credit(T('Geist · Chakra Petch', 'Geist · Chakra Petch'), T('Typefaces for reading, data and display.', '正文、数据与标题字体。'), 'SIL OFL 1.1')}
</div>
<div class="actions"><a class="btn sig" href="/">${icon('globe', 16)}${bi(T('Open the globe', '打开地球'))}</a><a class="btn ghost" href="/encyclopedia/">${icon('book', 16)}${bi(T('Browse the encyclopedia', '浏览百科'))}</a></div>`, { current: 'about' });

const li = (en: string, zh: string) => `<li>${bi(T(en, zh), 'span')}</li>`;
page('/privacy/', 'Privacy — Terrastra', 'How Terrastra handles data.', `<div class="prose"><p class="eyebrow">${bi(T('Privacy', '隐私'))}</p><h1>${bi(T('Privacy', '隐私说明'))}</h1>
${bi(T('Short version: Terrastra shows no ads and has no third-party trackers. Your progress and photos stay on your device unless you sign in or share them yourself. A few features — Wikipedia articles and live radio — load content from other websites when you open them.', '简单来说：寰星本身不投放广告，也没有第三方追踪。除非你登录或自己分享，你的进度和照片都留在你的设备上。少数功能（维基百科文章、直播电台）会在你打开时从其他网站加载内容。'), 'p', 'lead')}
<h2>${bi(T('The details', '具体说明'))}</h2><ol class="rules">
${li('Progress, settings and photos are stored on your device (localStorage and IndexedDB). Photos are only sent somewhere if you use Share or Save yourself. You can export your progress to a file from the menu.', '进度、设置和照片保存在你的设备上（localStorage 和 IndexedDB）。只有你自己点“分享”或“保存”时，照片才会离开这个页面。你可以在菜单中把进度导出为文件。')}
${STATIC ? li('This edition has no server: there are no accounts, cookies or uploads. Clearing site data removes everything.', '这个版本没有服务器：没有账户、Cookie 或上传。清除网站数据即可删除一切。')
  : li('If you choose to sign in, we store your email address, an optional nickname and a copy of your progress so it can sync.', '如果你选择登录，我们会保存你的邮箱、可选的昵称以及进度副本，以便同步。')
  + li('Likes and “I’ve been here” use an anonymous random cookie so each device counts once.', '“喜欢”和“我去过”使用匿名随机 Cookie，每台设备只计一次。')
  + li('Guestbook messages are public, limited to 200 characters, filtered for links and unkind words, and hidden after reports.', '留言板消息是公开的，最多 200 字，会过滤链接和不友善的词语，被举报后会隐藏。')
  + li('You can delete your account and server data any time from the Account panel.', '你可以随时在账户面板中删除账户和服务器数据。')}
${li('Reading an article in the app loads it directly from Wikipedia (wikipedia.org), which sees your IP address like any website.', '在应用中阅读文章时会直接从维基百科（wikipedia.org）加载，维基百科会像任何网站一样看到你的 IP 地址。')}
${li('Listening to the radio connects straight to that station’s own server, which sees your IP address like any website. Stations choose what they broadcast — including news, adverts and talk meant for adults — and we cannot check it. The app asks before the first station plays, shuffle only picks music stations, and you can hide any station on your device. Classroom mode switches live radio and Wikipedia off completely.', '收听电台时会直接连接该电台自己的服务器，它会像任何网站一样看到你的 IP 地址。电台播放什么（包括新闻、广告和面向成人的谈话）由电台决定，我们无法检查。应用会在第一次播放前询问你；随机播放只选音乐电台；你也可以在设备上隐藏任何电台。课堂模式会完全关闭直播电台和维基百科。')}
${li('Terrastra itself shows no ads and uses no third-party trackers or analytics. (Radio stations may broadcast their own adverts.)', '寰星本身不投放广告，也不使用第三方追踪或统计工具。（电台可能会播放它们自己的广告。）')}</ol></div>`, { current: 'privacy' });
page('/404/', 'Not found — Terrastra', 'Page not found.', `<div class="prose" style="padding:40px 0"><p class="eyebrow">404</p><h1>${bi(T('Lost in space?', '迷失在太空了吗？'))}</h1>
${bi(T('We couldn’t find that page.', '我们找不到这个页面。'), 'p', 'lead')}<div class="actions"><a class="btn sig" href="/">${icon('globe', 16)}${bi(T('Back to the globe', '回到地球'))}</a></div></div>`);
writeFileSync(join(out, '404.html'), (await import('node:fs')).readFileSync(join(out, '404', 'index.html'), 'utf8'));

writeFileSync(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${SITE}${u}</loc></url>`).join('\n')}\n</urlset>\n`);
writeFileSync(join(out, 'robots.txt'), `User-agent: *\nAllow: /\n${STATIC ? '' : 'Disallow: /api/\n'}Sitemap: ${SITE}/sitemap.xml\n`);
console.log(`build-pages: wrote ${urls.length} URLs to ${out}`);
