/**
 * Welcome.js — the page a visitor sees before logging in, rebuilt (owner approved
 * 2026-11-02, sketch "New Landing Page"): it shows the live KenteXa a visitor would join,
 * not a long explainer.
 *   top        wordmark + "Ingia"; headline; "Fungua akaunti" / "Ingia"
 *   talk now   up to 3 real public posts (conversations first) from GET /feed
 *   topics     the topics (GET /feed/topics)
 *   communities the biggest open communities (GET /communities)
 *   can do     four short tiles; then "Fungua akaunti, ni bure"
 * A block with nothing real to show is hidden. Tapping a post, a reply or a community asks
 * the visitor to open an account. Campaign links keep their own headline and button
 * (utils/campaignIntent: welcome.intent.<intent>.*).
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { getIntent } from '../../utils/campaignIntent';
import { topicLabel } from '../utils/feedPresentation';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const BLUE = '#1d9bf0';
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

const Welcome = ({ onNavigate }) => {
  const { t } = useTranslation();
  const intent = getIntent();
  const headlineKey = intent ? `welcome.intent.${intent}.headline` : 'welcome.headline';
  const subheadlineKey = intent ? `welcome.intent.${intent}.subheadline` : 'welcome.subheadline';
  const ctaKey = intent ? `welcome.intent.${intent}.cta` : 'welcome.create_account_button';

  const [talk, setTalk] = useState([]);
  const [topics, setTopics] = useState([]);
  const [communities, setCommunities] = useState([]);
  useEffect(() => {
    let alive = true;
    const read = (p, set, pick) => Promise.resolve(p).then((r) => { if (alive) set(pick(r?.data)); }).catch(() => {});
    read(api.get('/feed', { params: { filter: 'for_you', page: 1 } }), setTalk, (d) => pickTalk(d?.items || d));
    read(api.get('/feed/topics'), setTopics, (d) => (Array.isArray(d) ? d : []));
    read(api.get('/communities'), setCommunities, (d) => (Array.isArray(d) ? d.filter((c) => c.joinPolicy !== 'request').slice(0, 3) : []));
    return () => { alive = false; };
  }, []);

  const join = () => onNavigate('Register');
  const section = { padding: '18px 16px', borderBottom: `1px solid ${LINE}`, display: 'flex', flexDirection: 'column', gap: 12 };
  const h2 = { margin: 0, fontSize: 19, fontWeight: 800, color: INK };
  const pill = (dark) => ({ width: '100%', height: 46, borderRadius: 23, fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
    border: dark ? 'none' : '1px solid #cfd9de', background: dark ? INK : '#fff', color: dark ? '#fff' : INK });
  const tiles = [['talk', 'talk_desc'], ['trade', 'trade_desc'], ['ship', 'ship_desc'], ['business', 'business_desc']];

  return (
    <div style={{ background: '#fff', minHeight: '100vh', color: INK }}>
      <div style={{ maxWidth: 600, margin: '0 auto', borderLeft: `1px solid ${LINE}`, borderRight: `1px solid ${LINE}`, minHeight: '100vh' }}>
        <header style={{ position: 'sticky', top: 0, zIndex: 5, background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(10px)',
          padding: 'max(10px, env(safe-area-inset-top)) 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${LINE}` }}>
          <span style={{ fontFamily: 'Manrope, -apple-system, sans-serif', fontSize: 22, fontWeight: 900 }}>Kente<span style={{ color: '#1d4ed8' }}>X</span>a</span>
          <button type="button" data-testid="welcome-login-top" onClick={() => onNavigate('PublicLogin')}
            style={{ border: 'none', background: 'none', fontSize: 15, fontWeight: 700, color: INK, cursor: 'pointer', fontFamily: 'inherit' }}>{t('welcome.log_in_button')}</button>
        </header>

        <section style={section}>
          <h1 style={{ margin: '6px 0 0', fontSize: 30, fontWeight: 800, lineHeight: 1.15, textWrap: 'balance' }}>{t(headlineKey)}</h1>
          <p style={{ margin: 0, fontSize: 16, color: MUTED, lineHeight: 1.45 }}>{t(subheadlineKey)}</p>
          <button type="button" data-testid="welcome-register" onClick={join} style={pill(true)}>{t(ctaKey)}</button>
          <button type="button" onClick={() => onNavigate('PublicLogin')} style={pill(false)}>{t('welcome.log_in_button')}</button>
        </section>

        {talk.length > 0 && (
          <section style={section} data-testid="welcome-talk">
            <h2 style={h2}>{t('welcome.landing.talk_now')}</h2>
            {talk.map((p) => {
              const who = p.business?.storeName || p.business?.name || 'KenteXa';
              const topic = topicLabel(p.topic, topics);
              return (
                <button key={p.id} type="button" onClick={join} data-testid={`welcome-post-${p.id}`}
                  style={{ display: 'flex', gap: 10, textAlign: 'left', border: 'none', borderBottom: `1px solid ${LINE}`, background: 'none', padding: '6px 0 10px', cursor: 'pointer', fontFamily: 'inherit', color: INK }}>
                  <span style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', background: INK, color: '#fff', fontWeight: 800, fontSize: 13, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {p.business?.logo || p.business?.avatarUrl ? <img src={p.business.logo || p.business.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(who)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 14 }}><b>{who}</b><span style={{ color: MUTED }}>{topic ? ` · ${topic}` : ''}{p.createdAt ? ` · ${ago(p.createdAt)}` : ''}</span></span>
                    <span style={{ fontSize: 15, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{String(p.body || p.title).trim()}</span>
                    {Number(p.commentCount) > 0 && <span style={{ fontSize: 13, color: MUTED }}>{t('welcome.landing.replies', { n: Number(p.commentCount) })}</span>}
                  </span>
                </button>
              );
            })}
            <button type="button" onClick={join} style={{ alignSelf: 'flex-start', border: 'none', background: 'none', padding: 0, color: BLUE, fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>
              {t('welcome.landing.join_to_reply')}
            </button>
          </section>
        )}

        {topics.length > 0 && (
          <section style={section} data-testid="welcome-topics">
            <h2 style={h2}>{t('welcome.landing.topics')}</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {topics.map((tp) => (
                <button key={tp.key} type="button" onClick={join}
                  style={{ border: '1px solid #cfd9de', borderRadius: 999, padding: '7px 13px', background: '#fff', fontSize: 14, fontWeight: 700, color: INK, cursor: 'pointer', fontFamily: 'inherit' }}>{tp.label}</button>
              ))}
            </div>
          </section>
        )}

        {communities.length > 0 && (
          <section style={section} data-testid="welcome-communities">
            <h2 style={h2}>{t('welcome.landing.communities')}</h2>
            {communities.map((c) => (
              <button key={c.id} type="button" onClick={join}
                style={{ display: 'flex', alignItems: 'center', gap: 10, border: 'none', background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: INK }}>
                <span style={{ width: 40, height: 40, borderRadius: 10, background: INK, color: '#fff', fontWeight: 800, fontSize: 13, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials(c.name)}</span>
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  <b style={{ fontSize: 15 }}>{c.name}</b>
                  <span style={{ fontSize: 13, color: MUTED }}>{t('welcome.landing.members', { n: Number(c.memberCount || 0).toLocaleString('en-US') })}</span>
                </span>
              </button>
            ))}
          </section>
        )}

        <section style={section}>
          <h2 style={h2}>{t('welcome.landing.can_do')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {tiles.map(([k, d]) => (
              <div key={k} style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <b style={{ fontSize: 15 }}>{t(`welcome.landing.${k}`)}</b>
                <span style={{ fontSize: 13, color: MUTED }}>{t(`welcome.landing.${d}`)}</span>
              </div>
            ))}
          </div>
        </section>

        <section style={{ ...section, borderBottom: 'none', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
          <button type="button" onClick={join} style={pill(true)}>{t('welcome.landing.final')}</button>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, fontSize: 13, color: MUTED }}>
            <span>{t('welcome.made_in_tanzania')}</span>
            <LanguageSwitcher variant="dropdown" />
          </div>
        </section>
      </div>
    </div>
  );
};

export default Welcome;
