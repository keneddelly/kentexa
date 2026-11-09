/**
 * Onboarding.js — "Karibu KenteXa", the welcome after signup. Rebuilt 2026-11-10 (owner: "do as you
 * recommend"): three short steps instead of six.
 *   1 Lengo     "Unataka kufanya nini KenteXa?" one choice, Uza tena (income without a shop) first;
 *   2 Mahali    town and at least 3 topics on one screen (both can be skipped);
 *   3 Ifuatayo  one step that fits the goal: Uza tena joins and shows products to resell; a seller,
 *               service, agent, office... opens its short form; a buyer or someone looking around
 *               gets communities and people to follow together (owner 2026-11-02: the welcome
 *               includes jumuiya and following).
 * Then Home, which keeps asking for a photo and the first post (NewcomerNudge). Someone who signed
 * up from a link (kentexa_after_login) answers the goal only and goes straight back to it.
 * Finishing marks onboardingCompleted, the town and onboardingState.goals. Only real records.
 */
import React, { useEffect, useMemo, useState } from 'react';
import api from '../../api/api';
import { AUTH } from '../components/AuthShell';
import { GOALS } from '../../utils/goals';
import ResaleCatalogue from '../components/ResaleCatalogue';
import { JoinResale } from './MyResales';

const CITIES = ['Dar es Salaam', 'Mwanza', 'Arusha', 'Dodoma', 'Mbeya', 'Morogoro', 'Tanga', 'Zanzibar', 'Kigoma', 'Shinyanga', 'Tabora', 'Iringa',
  'Mtwara', 'Lindi', 'Musoma', 'Bukoba', 'Sumbawanga', 'Songea', 'Kahama', 'Moshi', 'Geita', 'Singida'];
const STEPS = ['goal', 'place', 'next'];
export const MIN_TOPICS = 3;
const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

const chip = (on) => ({ padding: '8px 14px', borderRadius: 999, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  border: `1px solid ${on ? AUTH.INK : AUTH.LINE}`, background: on ? AUTH.INK : '#fff', color: on ? '#fff' : AUTH.INK });
const pill = (dark = true, small = false) => ({ height: small ? 32 : 46, padding: small ? '0 14px' : '0 18px', borderRadius: 999, fontWeight: 700,
  fontSize: small ? 13 : 16, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, width: small ? 'auto' : '100%',
  border: dark ? 'none' : `1px solid ${small ? AUTH.INK : AUTH.LINE}`, background: dark ? AUTH.INK : '#fff', color: dark ? '#fff' : AUTH.INK });
const row = { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #eff3f4' };

const Onboarding = ({ onNavigate, currentUser, onUserUpdated, onOpenMoment }) => {
  // Owner 2026-11-10 ("do as you recommend"): goal first, then town and topics on one screen, then
  // one step that fits the goal; then Home. Someone who signed up from a link (a product, a
  // reseller's offer) answers the goal only and goes straight back to it.
  const [intended] = useState(() => { try { return localStorage.getItem('kentexa_after_login') || null; } catch { return null; } });
  const STEPS_NOW = intended ? ['goal'] : STEPS;
  const [step, setStep] = useState('goal');
  const [city, setCity] = useState(currentUser?.city || '');
  const [allCities, setAllCities] = useState(false);
  const [topics, setTopics] = useState([]);
  const [chosen, setChosen] = useState([]);
  const saved = Array.isArray(currentUser?.onboardingState?.goals) ? currentUser.onboardingState.goals : [];
  const [goal, setGoal] = useState(saved[0] || null);
  const [communities, setCommunities] = useState(null);
  const [profiles, setProfiles] = useState(null);
  const [member, setMember] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const index = STEPS_NOW.indexOf(step);
  const go = (next) => { setError(''); setStep(next); };
  const goalInfo = GOALS.find((g) => g.key === goal) || null;
  const social = !goal || goal === 'buy';

  useEffect(() => {
    let alive = true;
    api.get('/feed/topics').then((r) => {
      if (!alive) return;
      const list = Array.isArray(r?.data) ? r.data : [];
      setTopics(list);
      setChosen((cur) => (cur.length ? cur : list.filter((t) => t.following).map((t) => t.key)));
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // The last step for buyers and people looking around: communities and people to follow, together.
  useEffect(() => {
    if (step !== 'next' || !social) return undefined;
    let alive = true;
    setCommunities(null); setProfiles(null);
    api.get('/communities').then((r) => {
      if (!alive) return;
      setCommunities((Array.isArray(r?.data) ? r.data : []).filter((c) => !c.myStatus && (!chosen.length || chosen.includes(c.topicKey))).slice(0, 5));
    }).catch(() => { if (alive) setCommunities([]); });
    api.get('/profiles/onboarding/suggestions', { params: { city } })
      .then((r) => { if (alive) setProfiles((Array.isArray(r?.data) ? r.data : []).slice(0, 6)); })
      .catch(() => { if (alive) setProfiles([]); });
    return () => { alive = false; };
  }, [step, social]); // eslint-disable-line react-hooks/exhaustive-deps

  // Uza tena: already a member goes straight to the products.
  useEffect(() => {
    if (step !== 'next' || goal !== 'resell') return undefined;
    let alive = true;
    api.get('/resale/membership').then((r) => { if (alive) setMember(!!r?.data?.member); }).catch(() => { if (alive) setMember(false); });
    return () => { alive = false; };
  }, [step, goal]);

  const savePlace = async () => {
    setError('');
    if (chosen.length >= MIN_TOPICS) {
      setBusy('topics');
      try {
        await api.post('/feed/topics/follow', { keys: chosen });
        try { localStorage.setItem('kentexa_topics_asked', '1'); } catch { /* storage blocked */ }
      } catch (err) { setError(err?.response?.data?.message || 'Mada hazikuhifadhiwa. Jaribu tena.'); setBusy(null); return; }
      setBusy(null);
    }
    go('next');
  };

  const join = async (c) => {
    setBusy(`c${c.id}`); setError('');
    try {
      const r = await api.post(`/communities/${c.id}/join`);
      setCommunities((list) => list.map((x) => (x.id === c.id ? { ...x, ...r.data } : x)));
    } catch (err) { setError(err?.response?.data?.message || 'Imeshindikana kujiunga. Jaribu tena.'); } finally { setBusy(null); }
  };

  const follow = async (p) => {
    setBusy(`p${p.id}`); setError('');
    try {
      const r = await api.post(`/profiles/${p.id}/follow`);
      setProfiles((list) => list.map((x) => (x.id === p.id ? { ...x, isFollowing: !!r.data?.following } : x)));
    } catch { setError('Imeshindikana kufuata. Jaribu tena.'); } finally { setBusy(null); }
  };

  /** Marks the welcome done; then does what the person chose (or goes where they were going). */
  const finish = async (then) => {
    setBusy('finish'); setError('');
    try {
      const onboardingState = { ...(currentUser?.onboardingState || {}), goals: goal ? [goal] : [], welcomedAt: new Date().toISOString() };
      const res = await api.patch(`/users/${currentUser.id}`, { onboardingCompleted: true, onboardingState, ...(city ? { city } : {}) });
      onUserUpdated?.({ ...currentUser, ...res.data, onboardingCompleted: true, onboardingState });
      let after = null;
      try { after = localStorage.getItem('kentexa_after_login'); if (after) localStorage.removeItem('kentexa_after_login'); } catch { /* storage blocked */ }
      if (after) onNavigate(after);
      else if (then) then();
      else onNavigate('Home');
    } catch { setError('Imeshindikana kumaliza. Jaribu tena.'); } finally { setBusy(null); }
  };

  const afterGoal = () => (intended ? finish(null) : go('place'));

  const cities = useMemo(() => (allCities ? CITIES : CITIES.slice(0, 6)), [allCities]);
  const title = (h, p) => (
    <>
      <h1 style={{ margin: '4px 0 0', fontSize: 26, fontWeight: 800, color: AUTH.INK, lineHeight: 1.15 }}>{h}</h1>
      {p && <p style={{ margin: 0, fontSize: 15, color: AUTH.MUTED, lineHeight: 1.45 }}>{p}</p>}
    </>
  );

  const communityRow = (c) => {
    const joined = c.myStatus === 'active'; const pending = c.myStatus === 'pending';
    return (
      <div key={c.id} style={row} data-testid={`welcome-community-${c.id}`}>
        <span style={{ width: 40, height: 40, borderRadius: 10, background: AUTH.INK, color: '#fff', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials(c.name)}</span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <b style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</b>
          <small style={{ fontSize: 13, color: AUTH.MUTED }}>Jumuiya · wanachama {Number(c.memberCount || 0).toLocaleString('en-US')}{c.joinPolicy === 'request' ? ' · kwa ombi' : ''}</small>
        </span>
        <button type="button" data-testid={`welcome-join-${c.id}`} disabled={joined || pending || busy === `c${c.id}`} onClick={() => join(c)} style={pill(!(joined || pending), true)}>
          {joined ? 'Umejiunga' : pending ? 'Ombi limetumwa' : c.joinPolicy === 'request' ? 'Omba' : 'Jiunge'}
        </button>
      </div>
    );
  };
  const profileRow = (p) => (
    <div key={p.id} style={row} data-testid={`welcome-profile-${p.id}`}>
      <span style={{ width: 40, height: 40, borderRadius: p.type === 'personal' ? '50%' : 10, overflow: 'hidden', background: AUTH.INK, color: '#fff', fontWeight: 800, fontSize: 13,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {p.photoUrl ? <img src={p.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(p.displayName)}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <b style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.displayName}</b>
        <small style={{ fontSize: 13, color: AUTH.MUTED }}>
          {p.isOfficialPlatformProfile ? 'Ukurasa rasmi wa KenteXa' : [p.location, p.isLocalSuggestion ? 'karibu nawe' : null].filter(Boolean).join(' · ') || (p.username ? `@${p.username}` : '')}
        </small>
      </span>
      <button type="button" data-testid={`welcome-follow-${p.id}`} disabled={busy === `p${p.id}`} onClick={() => follow(p)} style={pill(!p.isFollowing, true)}>
        {p.isFollowing ? 'Unafuata' : 'Fuata'}
      </button>
    </div>
  );

  return (
    <main style={{ minHeight: '100vh', background: '#fff', color: AUTH.INK, display: 'flex', justifyContent: 'center', boxSizing: 'border-box',
      padding: 'max(16px, env(safe-area-inset-top)) 16px 24px' }}>
      <div data-testid={`welcome-${step}`} style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {STEPS_NOW.length > 1 && (
          <div aria-label={`Hatua ${index + 1} kati ya ${STEPS_NOW.length}`} style={{ display: 'flex', gap: 4 }}>
            {STEPS_NOW.map((s, i) => <span key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= index ? '#1d9bf0' : '#eff3f4' }} />)}
          </div>
        )}

        {step === 'goal' && (
          <>
            {title(`Karibu${currentUser?.name ? `, ${currentUser.name.split(' ')[0]}` : ''}. Unataka kufanya nini KenteXa?`, 'Chagua moja. Tutakuonyesha hatua fupi inayofuata.')}
            <div role="radiogroup" aria-label="Lengo" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {GOALS.map((g) => {
                const on = goal === g.key;
                const lead = g.key === 'resell';
                return (
                  <button key={g.key} type="button" role="radio" aria-checked={on} data-testid={`welcome-goal-${g.key}`} onClick={() => setGoal(g.key)}
                    style={{ textAlign: 'left', border: `${on ? 2 : 1}px solid ${on ? AUTH.INK : lead ? '#1d9bf0' : AUTH.LINE}`, borderRadius: 12, padding: '10px 14px',
                      background: on ? '#f7f9f9' : lead ? '#f0f8ff' : '#fff', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', color: AUTH.INK }}>
                    <b style={{ fontSize: 15 }}>{g.label}</b>
                    <span style={{ fontSize: 13, color: AUTH.MUTED }}>{g.hint}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ flex: 1 }} />
            <button type="button" data-testid="welcome-next" disabled={busy === 'finish'} onClick={afterGoal} style={pill()}>{goal ? 'Endelea' : 'Ruka'}</button>
          </>
        )}

        {step === 'place' && (
          <>
            {title('Uko wapi, na unapenda nini?', `Mji wako na angalau mada ${MIN_TOPICS}: Mwanzo utaanza na mazungumzo na biashara za karibu.`)}
            <div role="radiogroup" aria-label="Mji" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {cities.map((c) => <button key={c} type="button" role="radio" aria-checked={city === c} onClick={() => setCity(c)} style={chip(city === c)}>{c}</button>)}
              {!allCities && <button type="button" onClick={() => setAllCities(true)} style={chip(false)}>Zaidi</button>}
            </div>
            <div role="group" aria-label="Mada" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, borderTop: `1px solid ${AUTH.LINE}`, paddingTop: 12 }}>
              {topics.map((t) => {
                const on = chosen.includes(t.key);
                return (
                  <button key={t.key} type="button" aria-pressed={on} data-testid={`welcome-topic-${t.key}`} style={chip(on)}
                    onClick={() => setChosen((cur) => (on ? cur.filter((k) => k !== t.key) : [...cur, t.key]))}>{t.label}</button>
                );
              })}
            </div>
            <div style={{ flex: 1 }} />
            <button type="button" data-testid="welcome-next" disabled={(chosen.length > 0 && chosen.length < MIN_TOPICS) || busy === 'topics'} onClick={savePlace}
              style={{ ...pill(), opacity: chosen.length > 0 && chosen.length < MIN_TOPICS ? 0.5 : 1 }}>
              {chosen.length > 0 && chosen.length < MIN_TOPICS ? `Chagua mada ${MIN_TOPICS - chosen.length} zaidi` : 'Endelea'}
            </button>
            <button type="button" onClick={() => { setChosen([]); go('next'); }} style={pill(false)}>Ruka</button>
          </>
        )}

        {step === 'next' && goal === 'resell' && (
          <>
            {title('Pata kipato bila duka', 'Jiunge na Uza tena, kisha chagua bidhaa, weka bei yako na shiriki kiungo.')}
            {member === null && <p style={{ color: AUTH.MUTED }}>Inapakia...</p>}
            {member === false && <JoinResale onJoined={(m) => setMember(!!m?.member)} />}
            {member && <ResaleCatalogue onNavigate={onNavigate} />}
            <div style={{ flex: 1 }} />
            <button type="button" data-testid="welcome-finish" disabled={busy === 'finish'} onClick={() => finish(member ? () => onNavigate('MyResales', { tab: 'mine' }) : null)} style={pill()}>
              {member ? 'Maliza' : 'Baadaye'}
            </button>
          </>
        )}

        {step === 'next' && social && (
          <>
            {title('Jumuiya na watu wa kufuata', 'Wa karibu nawe na wa mada zako. Unaweza kuongeza zaidi baadaye.')}
            {communities === null || profiles === null ? <p style={{ color: AUTH.MUTED }}>Inapakia...</p> : (
              communities.length + profiles.length === 0
                ? <p data-testid="welcome-follow-empty" style={{ color: AUTH.MUTED, fontSize: 15 }}>Bado hakuna wa kupendekeza{city ? ` ${city}` : ''}. Utawapata Mwanzo.</p>
                : <div data-testid="welcome-social">{communities.map(communityRow)}{profiles.map(profileRow)}</div>
            )}
            <div style={{ flex: 1 }} />
            <button type="button" data-testid="welcome-finish" disabled={busy === 'finish'} onClick={() => finish(null)} style={pill()}>Maliza</button>
          </>
        )}

        {step === 'next' && !social && goal !== 'resell' && goalInfo && (
          <>
            {title(goalInfo.label, `${goalInfo.hint}. Ni fomu fupi; unaweza pia kuimaliza baadaye kwenye Kazi.`)}
            <div style={{ flex: 1 }} />
            <button type="button" data-testid="welcome-finish" disabled={busy === 'finish'} onClick={() => finish(() => onNavigate(goalInfo.page))} style={pill()}>Anza sasa</button>
            <button type="button" data-testid="welcome-later" disabled={busy === 'finish'} onClick={() => finish(null)} style={pill(false)}>Baadaye</button>
          </>
        )}

        {error && <p role="alert" style={{ margin: 0, fontSize: 14, color: AUTH.RED }}>{error}</p>}
      </div>
    </main>
  );
};

export default Onboarding;
