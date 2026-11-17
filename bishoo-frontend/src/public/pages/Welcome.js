/**
 * Welcome.js — the page a visitor sees before logging in (kentexa.com). First approved
 * 2026-11-02 (sketch "New Landing Page"); made the professional sign-up page for Facebook ads on
 * 2026-11-17 (owner: "fix all first then make it look more advanced page for professional people
 * to sign up"). Everything shown is real: posts, topics and communities come from the server, and a
 * block with nothing to show is hidden.
 *   hero        headline (a campaign link keeps its own: utils/campaignIntent), "Endelea na Google",
 *               "Fungua akaunti kwa simu", "Ingia"; live conversations beside it on a computer
 *   for whom    one card per kind of work: seller, buyer, sending a parcel, parcel office, agent,
 *               service provider, hotel, writer; a card starts sign-up with that goal
 *   why         verified businesses, money goes straight to the seller, tracked parcels, Swahili
 *   live        topics and communities
 *   app         Google Play (Android visitors without the app)
 *   final       sign-up again; links to the detailed pages; language; made in Tanzania
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { SocialButtons, SocialFinish } from '../components/SocialSignIn';
import { PlayButton, showGetApp } from '../components/GetAppStrip';
import { getIntent, setIntent } from '../../utils/campaignIntent';
import { topicLabel } from '../utils/feedPresentation';

const CONVERSATION = ['question', 'discussion', 'poll'];
const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const ago = (d) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  if (!Number.isFinite(m)) return '';
  if (m < 60) return `dk ${m}`;
  if (m < 1440) return `saa ${Math.round(m / 60)}`;
  return `siku ${Math.round(m / 1440)}`;
};

/** Up to 3 real public posts, conversations first; listings never (the server keeps them out of Home). */
export const pickTalk = (items) => {
  const list = (Array.isArray(items) ? items : []).filter((p) => p && (String(p.body || p.title || '').trim()));
  return [...list.filter((p) => CONVERSATION.includes(p.intent)), ...list.filter((p) => !CONVERSATION.includes(p.intent))].slice(0, 3);
};

const ICON = {
  store: 'M3 9l1.5-5h15L21 9M3 9h18M3 9v11h18V9M9 20v-6h6v6',
  bag: 'M6 7h12l1 13H5zM9 7a3 3 0 016 0',
  box: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8',
  office: 'M4 21V5l8-3 8 3v16M9 21v-5h6v5M8 9h2M14 9h2M8 13h2M14 13h2',
  bike: 'M5 18a3 3 0 100-6 3 3 0 000 6zM19 18a3 3 0 100-6 3 3 0 000 6zM5 15l4-7h5l3 7M9 8L7 5H5',
  tool: 'M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  dish: 'M3 14h18M5 14a7 7 0 0114 0M12 4v3M2 18h20',
  pen: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4',
  wallet: 'M3 7h16a2 2 0 012 2v8a2 2 0 01-2 2H3zM3 7l12-4 2 4M16 13h2',
  route: 'M6 19a2 2 0 100-4 2 2 0 000 4zM18 9a2 2 0 100-4 2 2 0 000 4zM6 15V9a4 4 0 014-4h4M18 9v6a4 4 0 01-4 4h-4',
  chat: 'M21 12a8 8 0 01-11.6 7.1L3 21l1.9-6.4A8 8 0 1121 12z',
};
const Icon = ({ name, size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICON[name]} />
  </svg>
);

/** Who KenteXa is for. `intent` starts sign-up with that goal; `more` is the detailed page, when there is one. */
export const AUDIENCES = [
  { key: 'seller', icon: 'store', intent: 'seller', more: '/free-pos-tanzania/' },
  { key: 'buyer', icon: 'bag', intent: 'buyer', more: '/online-marketplace-tanzania/' },
  { key: 'ship', icon: 'box', intent: 'ship', more: '/local-delivery-tanzania/' },
  { key: 'office', icon: 'office', intent: 'office', more: '/ofisi-ya-mizigo/' },
  { key: 'agent', icon: 'bike', intent: 'agent', more: null },
  { key: 'service', icon: 'tool', intent: 'service', more: null },
  { key: 'hotel', icon: 'dish', intent: 'business', more: '/hotel-restaurant-qr-menu/' },
  { key: 'writer', icon: 'pen', intent: null, more: null },
];
const WHY = [['verified', 'shield'], ['direct', 'wallet'], ['tracked', 'route'], ['local', 'chat']];
const PAGES = [
  ['/about-kentexa/', 'about'], ['/ofisi-ya-mizigo/', 'office'], ['/free-pos-tanzania/', 'pos'],
  ['/online-marketplace-tanzania/', 'market'], ['/local-delivery-tanzania/', 'delivery'], ['/hotel-restaurant-qr-menu/', 'menu'],
];

const CSS = `
.kxw{--ink:#0f1419;--muted:#536471;--line:#e6ecf0;--blue:#1d4ed8;--sky:#60a5fa;--navy:#0b1224;background:#fff;color:var(--ink);min-height:100vh;font-family:inherit}
.kxw *{box-sizing:border-box}
.kxw-in{max-width:1120px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left));padding-right:max(16px,env(safe-area-inset-right))}
.kxw-top{position:sticky;top:0;z-index:20;background:rgba(11,18,36,.92);backdrop-filter:blur(10px);border-bottom:1px solid #ffffff14}
.kxw-top .kxw-in{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:max(10px,env(safe-area-inset-top));padding-bottom:10px}
.kxw-mark{display:flex;align-items:center;gap:9px;color:#fff;font-size:21px;font-weight:900;letter-spacing:-.4px}
.kxw-mark img{width:30px;height:30px;border-radius:8px}
.kxw-mark span{color:var(--sky)}
.kxw-nav{display:flex;align-items:center;gap:6px}
.kxw-link{border:none;background:none;color:#dbe4f3;font:inherit;font-size:15px;font-weight:700;padding:8px 10px;cursor:pointer;border-radius:999px}
.kxw-link:hover{background:#ffffff14}
.kxw-btn{height:46px;border-radius:23px;padding:0 20px;font:inherit;font-size:15px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap}
.kxw-btn.light{background:#fff;color:var(--ink);border:none}
.kxw-btn.ghost{background:transparent;color:#fff;border:1px solid #ffffff55}
.kxw-btn.dark{background:var(--ink);color:#fff;border:none}
.kxw-btn.small{height:38px;padding:0 16px;font-size:14px}
.kxw-hero{background:radial-gradient(1200px 500px at 85% -10%,#2b4fd6 0%,transparent 60%),linear-gradient(160deg,#0b1224 0%,#13205a 55%,#1d3fb8 100%);color:#fff;padding:56px 0 64px}
.kxw-hero .kxw-in{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:48px;align-items:center}
.kxw-eyebrow{display:inline-flex;align-items:center;gap:8px;border:1px solid #ffffff33;border-radius:999px;padding:6px 12px;font-size:13px;font-weight:700;color:#cfdcff;letter-spacing:.02em}
.kxw-dot{width:7px;height:7px;border-radius:50%;background:#34d399;box-shadow:0 0 0 4px #34d39933}
.kxw-h1{margin:18px 0 14px;font-size:clamp(34px,5.4vw,58px);line-height:1.05;letter-spacing:-.03em;font-weight:900;text-wrap:balance}
.kxw-sub{margin:0;font-size:clamp(16px,1.6vw,19px);line-height:1.55;color:#cfdcff;max-width:560px}
.kxw-start{margin-top:26px;display:flex;flex-direction:column;gap:10px;max-width:380px}
.kxw-start .kxw-btn{width:100%}
.kxw-auth{background:#fff;border-radius:18px;padding:14px;display:flex;flex-direction:column;gap:10px;color:var(--ink)}
.kxw-free{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:16px;font-size:14px;color:#cfdcff}
.kxw-free b{color:#fff}
.kxw-live{background:#ffffff0f;border:1px solid #ffffff22;border-radius:22px;padding:16px;backdrop-filter:blur(6px)}
.kxw-live h2{margin:0 0 6px;font-size:15px;font-weight:800;color:#fff;display:flex;align-items:center;gap:8px}
.kxw-post{display:flex;gap:10px;text-align:left;width:100%;border:none;background:#fff;color:var(--ink);border-radius:14px;padding:12px;margin-top:10px;cursor:pointer;font:inherit}
.kxw-ava{width:38px;height:38px;border-radius:50%;overflow:hidden;background:var(--ink);color:#fff;font-weight:800;font-size:13px;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.kxw-ava img{width:100%;height:100%;object-fit:cover}
.kxw-clamp{overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow-wrap:anywhere}
.kxw-sec{padding:64px 0;border-bottom:1px solid var(--line)}
.kxw-sec.alt{background:#f7f9fb}
.kxw-kicker{font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--blue)}
.kxw-h2{margin:8px 0 10px;font-size:clamp(26px,3.4vw,38px);line-height:1.15;letter-spacing:-.02em;font-weight:900;text-wrap:balance}
.kxw-lead{margin:0;color:var(--muted);font-size:17px;line-height:1.55;max-width:640px}
.kxw-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:28px}
.kxw-card{border:1px solid var(--line);background:#fff;border-radius:18px;padding:18px;display:flex;flex-direction:column;gap:8px;text-align:left;font:inherit;color:var(--ink);min-width:0}
.kxw-card.go{cursor:pointer;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease}
.kxw-card.go:hover{transform:translateY(-2px);box-shadow:0 10px 28px #0f172a14;border-color:#c7d2fe}
.kxw-ic{width:42px;height:42px;border-radius:12px;background:#eef2ff;color:var(--blue);display:flex;align-items:center;justify-content:center}
.kxw-card b{font-size:16px}
.kxw-card p{margin:0;color:var(--muted);font-size:14px;line-height:1.5}
.kxw-card .kxw-more{margin-top:auto;padding-top:4px;display:flex;flex-wrap:wrap;gap:4px 12px;font-size:14px;font-weight:700}
.kxw-card .kxw-more>*{white-space:nowrap}
.kxw-card .kxw-more span{color:var(--blue)}
.kxw-card .kxw-more a{color:var(--muted);text-decoration:none}
.kxw-why{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:22px;margin-top:28px}
.kxw-why div{display:flex;flex-direction:column;gap:8px}
.kxw-why .kxw-ic{background:#ecfdf5;color:#047857}
.kxw-why b{font-size:16px}.kxw-why p{margin:0;color:var(--muted);font-size:14px;line-height:1.5}
.kxw-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}
.kxw-chip{border:1px solid #cfd9de;border-radius:999px;padding:8px 14px;background:#fff;font:inherit;font-size:14px;font-weight:700;color:var(--ink);cursor:pointer}
.kxw-comms{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:18px}
.kxw-comm{display:flex;align-items:center;gap:10px;border:1px solid var(--line);border-radius:14px;padding:12px;background:#fff;cursor:pointer;font:inherit;color:var(--ink);text-align:left;min-width:0}
.kxw-comm .kxw-ava{border-radius:10px}
.kxw-app{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:18px;padding:18px 20px;margin-top:28px}
.kxw-app p{margin:0;font-weight:700;color:#14532d}
.kxw-final{background:linear-gradient(160deg,#0b1224,#13205a);color:#fff;padding:64px 0}
.kxw-final .kxw-in{display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px}
.kxw-final .kxw-btn{min-width:260px}
.kxw-foot{background:#0b1224;color:#9fb0cf;font-size:14px;padding:28px 0 max(28px,env(safe-area-inset-bottom))}
.kxw-foot .kxw-in{display:flex;flex-wrap:wrap;gap:12px 22px;align-items:center;justify-content:space-between}
.kxw-foot nav{display:flex;flex-wrap:wrap;gap:8px 18px}
.kxw-foot a{color:#cfdcff;text-decoration:none}
@media (max-width:980px){.kxw-grid,.kxw-why{grid-template-columns:repeat(2,minmax(0,1fr))}.kxw-comms{grid-template-columns:1fr}}
@media (max-width:860px){.kxw-hero .kxw-in{grid-template-columns:1fr;gap:28px}.kxw-hero{padding:34px 0 40px}.kxw-hide-sm{display:none}.kxw-sec{padding:44px 0}.kxw-start{max-width:none}}
@media (max-width:520px){.kxw-grid{grid-template-columns:1fr}.kxw-why{grid-template-columns:1fr 1fr;gap:18px}.kxw-final .kxw-btn{min-width:0;width:100%}}
`;

const Welcome = ({ onNavigate, onLoginSuccess }) => {
  const { t } = useTranslation();
  const intent = getIntent();
  const headlineKey = intent ? `welcome.intent.${intent}.headline` : 'welcome.headline';
  const subheadlineKey = intent ? `welcome.intent.${intent}.subheadline` : 'welcome.subheadline';
  const ctaKey = intent ? `welcome.intent.${intent}.cta` : 'welcome.create_account_button';

  const [talk, setTalk] = useState([]);
  const [topics, setTopics] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [social, setSocial] = useState(null);
  useEffect(() => {
    let alive = true;
    const read = (p, set, pick) => Promise.resolve(p).then((r) => { if (alive) set(pick(r?.data)); }).catch(() => {});
    read(api.get('/feed', { params: { filter: 'for_you', page: 1 } }), setTalk, (d) => pickTalk(d?.items || d));
    read(api.get('/feed/topics'), setTopics, (d) => (Array.isArray(d) ? d : []));
    read(api.get('/communities'), setCommunities, (d) => (Array.isArray(d) ? d.filter((c) => c.joinPolicy !== 'request').slice(0, 3) : []));
    return () => { alive = false; };
  }, []);

  const join = () => onNavigate('Register');
  const login = () => onNavigate('PublicLogin');
  /** A card: remember the goal, so after sign-up the person lands on that task. */
  const start = (goal) => { if (goal) setIntent(goal); join(); };
  const onSocial = async (data) => {
    if (data?.status === 'need_phone') { setSocial(data); return; }
    if (onLoginSuccess) await onLoginSuccess(data);
  };
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });

  if (social) {
    return <SocialFinish info={social} onLoginSuccess={onLoginSuccess} onCancel={() => setSocial(null)} onNavigate={onNavigate} />;
  }

  return (
    <div className="kxw" data-testid="welcome">
      <style>{CSS}</style>

      <header className="kxw-top">
        <div className="kxw-in">
          <span className="kxw-mark"><img src="/logo192.png" alt="" width="30" height="30" /><b>Kente<span>Xa</span></b></span>
          <nav className="kxw-nav" aria-label="KenteXa">
            <button type="button" className="kxw-link kxw-hide-sm" onClick={() => scrollTo('kxw-for')}>{t('welcome.pro.nav_for')}</button>
            <button type="button" className="kxw-link kxw-hide-sm" onClick={() => scrollTo('kxw-why')}>{t('welcome.pro.nav_why')}</button>
            <button type="button" className="kxw-link" data-testid="welcome-login-top" onClick={login}>{t('welcome.log_in_button')}</button>
            <button type="button" className="kxw-btn light small kxw-hide-sm" onClick={join}>{t('welcome.pro.join_short')}</button>
          </nav>
        </div>
      </header>

      <section className="kxw-hero">
        <div className="kxw-in">
          <div>
            <span className="kxw-eyebrow"><span className="kxw-dot" />{t('welcome.pro.eyebrow')}</span>
            <h1 className="kxw-h1">{t(headlineKey)}</h1>
            <p className="kxw-sub">{t(subheadlineKey)}</p>
            <div className="kxw-start">
              <div className="kxw-auth">
                <SocialButtons onResult={onSocial} />
                <button type="button" data-testid="welcome-register" onClick={join} className="kxw-btn dark">{t(ctaKey)}</button>
              </div>
              <button type="button" onClick={login} className="kxw-btn ghost">{t('welcome.log_in_button')}</button>
            </div>
            <div className="kxw-free">
              <span><b>{t('welcome.pro.free_1a')}</b> {t('welcome.pro.free_1b')}</span>
              <span><b>{t('welcome.pro.free_2a')}</b> {t('welcome.pro.free_2b')}</span>
              <span><b>{t('welcome.pro.free_3a')}</b> {t('welcome.pro.free_3b')}</span>
            </div>
          </div>

          {talk.length > 0 && (
            <div className="kxw-live" data-testid="welcome-talk">
              <h2><span className="kxw-dot" />{t('welcome.landing.talk_now')}</h2>
              {talk.map((p) => {
                const who = p.business?.storeName || p.business?.name || 'KenteXa';
                const topic = topicLabel(p.topic, topics);
                return (
                  <button key={p.id} type="button" className="kxw-post" onClick={join} data-testid={`welcome-post-${p.id}`}>
                    <span className="kxw-ava">{p.business?.logo || p.business?.avatarUrl ? <img src={p.business.logo || p.business.avatarUrl} alt="" /> : initials(who)}</span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 14 }}><b>{who}</b><span style={{ color: '#536471' }}>{topic ? ` · ${topic}` : ''}{p.createdAt ? ` · ${ago(p.createdAt)}` : ''}</span></span>
                      <span className="kxw-clamp" style={{ fontSize: 15, lineHeight: 1.4 }}>{String(p.body || p.title).trim()}</span>
                      {Number(p.commentCount) > 0 && <span style={{ fontSize: 13, color: '#536471' }}>{t('welcome.landing.replies', { n: Number(p.commentCount) })}</span>}
                    </span>
                  </button>
                );
              })}
              <button type="button" onClick={join} className="kxw-link" style={{ marginTop: 8, padding: '8px 0', color: '#bfdbfe' }}>{t('welcome.landing.join_to_reply')} →</button>
            </div>
          )}
        </div>
      </section>

      <section className="kxw-sec" id="kxw-for" data-testid="welcome-for">
        <div className="kxw-in">
          <span className="kxw-kicker">{t('welcome.pro.for_kicker')}</span>
          <h2 className="kxw-h2">{t('welcome.pro.for_title')}</h2>
          <p className="kxw-lead">{t('welcome.pro.for_lead')}</p>
          <div className="kxw-grid">
            {AUDIENCES.map((a) => (
              <div key={a.key} role="button" tabIndex={0} className="kxw-card go" data-testid={`welcome-for-${a.key}`}
                onClick={() => start(a.intent)} onKeyDown={(e) => { if (e.key === 'Enter') start(a.intent); }}>
                <span className="kxw-ic"><Icon name={a.icon} /></span>
                <b>{t(`welcome.pro.aud.${a.key}.title`)}</b>
                <p>{t(`welcome.pro.aud.${a.key}.desc`)}</p>
                <span className="kxw-more">
                  <span>{t(`welcome.pro.aud.${a.key}.cta`)} →</span>
                  {a.more && <a href={a.more} onClick={(e) => e.stopPropagation()}>{t('welcome.pro.read_more')}</a>}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="kxw-sec alt" id="kxw-why" data-testid="welcome-why">
        <div className="kxw-in">
          <span className="kxw-kicker">{t('welcome.pro.why_kicker')}</span>
          <h2 className="kxw-h2">{t('welcome.pro.why_title')}</h2>
          <div className="kxw-why">
            {WHY.map(([k, icon]) => (
              <div key={k}>
                <span className="kxw-ic"><Icon name={icon} /></span>
                <b>{t(`welcome.pro.why.${k}.title`)}</b>
                <p>{t(`welcome.pro.why.${k}.desc`)}</p>
              </div>
            ))}
          </div>
          {showGetApp() && (
            <div className="kxw-app" data-testid="welcome-get-app">
              <p>{t('welcome.pro.app')}</p>
              <PlayButton label={t('welcome.pro.app_button')} testid="welcome-play" />
            </div>
          )}
        </div>
      </section>

      {(topics.length > 0 || communities.length > 0) && (
        <section className="kxw-sec">
          <div className="kxw-in">
            <span className="kxw-kicker">{t('welcome.pro.live_kicker')}</span>
            <h2 className="kxw-h2">{t('welcome.pro.live_title')}</h2>
            {topics.length > 0 && (
              <div className="kxw-chips" data-testid="welcome-topics">
                {topics.map((tp) => <button key={tp.key} type="button" className="kxw-chip" onClick={join}>{tp.label}</button>)}
              </div>
            )}
            {communities.length > 0 && (
              <div className="kxw-comms" data-testid="welcome-communities">
                {communities.map((c) => (
                  <button key={c.id} type="button" className="kxw-comm" onClick={join}>
                    <span className="kxw-ava">{initials(c.name)}</span>
                    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <b style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</b>
                      <span style={{ fontSize: 13, color: '#536471' }}>{t('welcome.landing.members', { n: Number(c.memberCount || 0).toLocaleString('en-US') })}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="kxw-final">
        <div className="kxw-in">
          <h2 className="kxw-h2" style={{ color: '#fff', margin: 0 }}>{t('welcome.pro.final_title')}</h2>
          <p className="kxw-sub" style={{ margin: 0 }}>{t('welcome.pro.final_sub')}</p>
          <button type="button" onClick={join} className="kxw-btn light">{t('welcome.landing.final')}</button>
        </div>
      </section>

      <footer className="kxw-foot">
        <div className="kxw-in">
          <nav aria-label={t('welcome.pro.pages')}>
            {PAGES.map(([href, k]) => <a key={href} href={href}>{t(`welcome.pro.page.${k}`)}</a>)}
            <a href="/privacy">{t('welcome.pro.page.privacy')}</a>
            <a href="/terms">{t('welcome.pro.page.terms')}</a>
          </nav>
          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>{t('welcome.made_in_tanzania')}</span>
            <LanguageSwitcher variant="dropdown" />
          </span>
        </div>
      </footer>
    </div>
  );
};

export default Welcome;
