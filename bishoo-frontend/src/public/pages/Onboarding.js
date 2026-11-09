/**
 * Onboarding.js — "Karibu KenteXa", the welcome after signup (owner approved 2026-11-02,
 * sketch "New Login and Signup"; owner: "onboarding remember to include our new style
 * social engagement like jumuiya"). Five short steps in the new look:
 *   1 Mahali    the person's town (local talk, communities and businesses);
 *   2 Mada      at least 3 topics (POST /feed/topics/follow; Home will not ask again);
 *   2b Malengo  "Unataka kufanya nini?" (owner 2026-11-09): several choices, kept in
 *               onboardingState.goals; Kazi then lists the ones still to finish (utils/goals);
 *   3 Jumuiya   join communities in those topics (skipped by itself when there are none);
 *   4 Fuata     follow businesses and people (/profiles/onboarding/suggestions);
 *   5 Chapisho  the first post: a strong ask that can be skipped (owner's choice):
 *               Salamu / Swali open the composer with a ready start, Bidhaa and Huduma
 *               open their forms; "Baadaye" goes to Home, which keeps asking.
 * Finishing marks onboardingCompleted (and the town); a place the person was going before
 * signup (kentexa_after_login) is respected. Only real records are shown.
 */
import React, { useEffect, useMemo, useState } from 'react';
import api from '../../api/api';
import { AUTH } from '../components/AuthShell';
import { firstPostStart } from '../../utils/firstPost';
import { GOALS } from '../../utils/goals';

const CITIES = ['Dar es Salaam', 'Mwanza', 'Arusha', 'Dodoma', 'Mbeya', 'Morogoro', 'Tanga', 'Zanzibar', 'Kigoma', 'Shinyanga', 'Tabora', 'Iringa',
  'Mtwara', 'Lindi', 'Musoma', 'Bukoba', 'Sumbawanga', 'Songea', 'Kahama', 'Moshi', 'Geita', 'Singida'];
const STEPS = ['city', 'topics', 'goals', 'communities', 'follow', 'post'];
export const MIN_TOPICS = 3;
const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

const chip = (on) => ({ padding: '8px 14px', borderRadius: 999, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  border: `1px solid ${on ? AUTH.INK : AUTH.LINE}`, background: on ? AUTH.INK : '#fff', color: on ? '#fff' : AUTH.INK });
const pill = (dark = true, small = false) => ({ height: small ? 32 : 46, padding: small ? '0 14px' : '0 18px', borderRadius: 999, fontWeight: 700,
  fontSize: small ? 13 : 16, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, width: small ? 'auto' : '100%',
  border: dark ? 'none' : `1px solid ${small ? AUTH.INK : AUTH.LINE}`, background: dark ? AUTH.INK : '#fff', color: dark ? '#fff' : AUTH.INK });
const row = { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #eff3f4' };

const Onboarding = ({ onNavigate, currentUser, onUserUpdated, onOpenMoment }) => {
  const [step, setStep] = useState('city');
  const [city, setCity] = useState(currentUser?.city || '');
  const [allCities, setAllCities] = useState(false);
  const [topics, setTopics] = useState([]);
  const [chosen, setChosen] = useState([]);
  const [goals, setGoals] = useState(() => (Array.isArray(currentUser?.onboardingState?.goals) ? currentUser.onboardingState.goals : []));
  const [communities, setCommunities] = useState(null);
  const [profiles, setProfiles] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const index = STEPS.indexOf(step);
  const go = (next) => { setError(''); setStep(next); };

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

  // Communities in the chosen topics, biggest first (the server's order), not joined yet.
  useEffect(() => {
    if (step !== 'communities') return undefined;
    let alive = true;
    setCommunities(null);
    api.get('/communities').then((r) => {
      if (!alive) return;
      const list = (Array.isArray(r?.data) ? r.data : []).filter((c) => !c.myStatus && (!chosen.length || chosen.includes(c.topicKey))).slice(0, 8);
      setCommunities(list);
      if (!list.length) setStep('follow');
    }).catch(() => { if (alive) setStep('follow'); });
    return () => { alive = false; };
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step !== 'follow') return undefined;
    let alive = true;
    setProfiles(null);
    api.get('/profiles/onboarding/suggestions', { params: { city } })
      .then((r) => { if (alive) setProfiles(Array.isArray(r?.data) ? r.data : []); })
      .catch(() => { if (alive) setProfiles([]); });
    return () => { alive = false; };
  }, [step, city]);

  const saveTopics = async () => {
    if (chosen.length < MIN_TOPICS) return;
    setBusy('topics'); setError('');
    try {
      await api.post('/feed/topics/follow', { keys: chosen });
      try { localStorage.setItem('kentexa_topics_asked', '1'); } catch { /* storage blocked */ }
      go('goals');
    } catch (err) { setError(err?.response?.data?.message || 'Mada hazikuhifadhiwa. Jaribu tena.'); } finally { setBusy(null); }
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
      const onboardingState = { ...(currentUser?.onboardingState || {}), goals, welcomedAt: new Date().toISOString() };
      const res = await api.patch(`/users/${currentUser.id}`, { onboardingCompleted: true, onboardingState, ...(city ? { city } : {}) });
      onUserUpdated?.({ ...currentUser, ...res.data, onboardingCompleted: true, onboardingState });
      let intended = null;
      try { intended = localStorage.getItem('kentexa_after_login'); if (intended) localStorage.removeItem('kentexa_after_login'); } catch { /* storage blocked */ }
      if (then) then(); else onNavigate(intended || 'Home');
    } catch { setError('Imeshindikana kumaliza. Jaribu tena.'); } finally { setBusy(null); }
  };

  const firstPost = (choice) => finish(() => {
    if (choice === 'hello') { onNavigate('Home'); onOpenMoment?.('moment', { kind: 'moment', text: firstPostStart(currentUser, city) }); }
    else if (choice === 'question') { onNavigate('Home'); onOpenMoment?.('moment', { kind: 'question', text: '' }); }
    else if (choice === 'product') onNavigate('CreateClassified');
    else if (choice === 'service') onNavigate('PostService');
  });

  const cities = useMemo(() => (allCities ? CITIES : CITIES.slice(0, 6)), [allCities]);
  const title = (h, p) => (
    <>
      <h1 style={{ margin: '4px 0 0', fontSize: 26, fontWeight: 800, color: AUTH.INK, lineHeight: 1.15 }}>{h}</h1>
      {p && <p style={{ margin: 0, fontSize: 15, color: AUTH.MUTED, lineHeight: 1.45 }}>{p}</p>}
    </>
  );

  return (
    <main style={{ minHeight: '100vh', background: '#fff', color: AUTH.INK, display: 'flex', justifyContent: 'center', boxSizing: 'border-box',
      padding: 'max(16px, env(safe-area-inset-top)) 16px 24px' }}>
      <div data-testid={`welcome-${step}`} style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div aria-label={`Hatua ${index + 1} kati ya ${STEPS.length}`} style={{ display: 'flex', gap: 4 }}>
          {STEPS.map((s, i) => <span key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= index ? '#1d9bf0' : '#eff3f4' }} />)}
        </div>

        {step === 'city' && (
          <>
            {title(`Karibu${currentUser?.name ? `, ${currentUser.name.split(' ')[0]}` : ''}. Uko mji gani?`, 'Tunakuonyesha mazungumzo, jumuiya na biashara za karibu nawe.')}
            <div role="radiogroup" aria-label="Mji" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {cities.map((c) => <button key={c} type="button" role="radio" aria-checked={city === c} onClick={() => setCity(c)} style={chip(city === c)}>{c}</button>)}
              {!allCities && <button type="button" onClick={() => setAllCities(true)} style={chip(false)}>Zaidi</button>}
            </div>
            <div style={{ flex: 1 }} />
            <button type="button" data-testid="welcome-next" disabled={!city} onClick={() => go('topics')} style={{ ...pill(), opacity: city ? 1 : 0.5 }}>Endelea</button>
            <button type="button" onClick={() => { setCity(''); go('topics'); }} style={pill(false)}>Ruka</button>
          </>
        )}

        {step === 'topics' && (
          <>
            {title('Unapenda kuzungumzia nini?', `Chagua angalau ${MIN_TOPICS}. Mwanzo utaanza na mazungumzo haya.`)}
            <div role="group" aria-label="Mada" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {topics.map((t) => {
                const on = chosen.includes(t.key);
                return (
                  <button key={t.key} type="button" aria-pressed={on} data-testid={`welcome-topic-${t.key}`} style={chip(on)}
                    onClick={() => setChosen((cur) => (on ? cur.filter((k) => k !== t.key) : [...cur, t.key]))}>{t.label}</button>
                );
              })}
            </div>
            <div style={{ flex: 1 }} />
            <button type="button" data-testid="welcome-next" disabled={chosen.length < MIN_TOPICS || busy === 'topics'} onClick={saveTopics}
              style={{ ...pill(), opacity: chosen.length < MIN_TOPICS ? 0.5 : 1 }}>
              {chosen.length < MIN_TOPICS ? `Chagua ${MIN_TOPICS - chosen.length} zaidi` : `Endelea (${chosen.length})`}
            </button>
          </>
        )}

        {step === 'goals' && (
          <>
            {title('Unataka kufanya nini KenteXa?', 'Chagua yote yanayokuhusu. Tutakuonyesha hatua fupi kwenye Kazi.')}
            <div role="group" aria-label="Malengo" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {GOALS.map((g) => {
                const on = goals.includes(g.key);
                return (
                  <button key={g.key} type="button" aria-pressed={on} data-testid={`welcome-goal-${g.key}`}
                    onClick={() => setGoals((cur) => (on ? cur.filter((k) => k !== g.key) : [...cur, g.key]))}
                    style={{ textAlign: 'left', border: `1px solid ${on ? AUTH.INK : AUTH.LINE}`, borderRadius: 12, padding: '10px 14px', background: on ? '#f7f9f9' : '#fff',
                      cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 12, color: AUTH.INK }}>
                    <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, border: on ? 'none' : `1.5px solid ${AUTH.LINE}`, background: on ? AUTH.INK : '#fff',
                      color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{on ? '✓' : ''}</span>
                    <span style={{ display: 'flex', flexDirection: 'column' }}>
                      <b style={{ fontSize: 15 }}>{g.label}</b>
                      <span style={{ fontSize: 13, color: AUTH.MUTED }}>{g.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div style={{ flex: 1 }} />
            <button type="button" data-testid="welcome-next" onClick={() => go('communities')} style={pill()}>{goals.length ? `Endelea (${goals.length})` : 'Endelea'}</button>
            {!goals.length && <button type="button" onClick={() => go('communities')} style={pill(false)}>Ruka</button>}
          </>
        )}

        {step === 'communities' && (
          <>
            {title('Jiunge na jumuiya', 'Za mada ulizochagua, kubwa kwanza. Unaweza kuondoka wakati wowote.')}
            {communities === null ? <p style={{ color: AUTH.MUTED }}>Inapakia...</p> : (
              <div>
                {communities.map((c) => {
                  const joined = c.myStatus === 'active'; const pending = c.myStatus === 'pending';
                  return (
                    <div key={c.id} style={row} data-testid={`welcome-community-${c.id}`}>
                      <span style={{ width: 40, height: 40, borderRadius: 10, background: AUTH.INK, color: '#fff', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials(c.name)}</span>
                      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                        <b style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</b>
                        <small style={{ fontSize: 13, color: AUTH.MUTED }}>Wanachama {Number(c.memberCount || 0).toLocaleString('en-US')}{c.joinPolicy === 'request' ? ' · Kwa ombi' : ''}</small>
                      </span>
                      <button type="button" data-testid={`welcome-join-${c.id}`} disabled={joined || pending || busy === `c${c.id}`} onClick={() => join(c)} style={pill(!(joined || pending), true)}>
                        {joined ? 'Umejiunga' : pending ? 'Ombi limetumwa' : c.joinPolicy === 'request' ? 'Omba' : 'Jiunge'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ flex: 1 }} />
            <button type="button" data-testid="welcome-next" onClick={() => go('follow')} style={pill()}>Endelea</button>
          </>
        )}

        {step === 'follow' && (
          <>
            {title('Fuata biashara na watu', 'Wa karibu nawe na wanaozungumzia mada zako.')}
            {profiles === null ? <p style={{ color: AUTH.MUTED }}>Inapakia...</p> : profiles.length === 0 ? (
              <p style={{ color: AUTH.MUTED, fontSize: 15 }}>Bado hakuna wa kupendekeza{city ? ` ${city}` : ''}. Utawapata Mwanzo.</p>
            ) : (
              <div>
                {profiles.map((p) => (
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
                ))}
              </div>
            )}
            <div style={{ flex: 1 }} />
            <button type="button" data-testid="welcome-next" onClick={() => go('post')} style={pill()}>Endelea</button>
          </>
        )}

        {step === 'post' && (
          <>
            {title('Chapisho lako la kwanza', 'Wajulishe watu uko KenteXa. Chagua unachotaka kuanza nacho.')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                ['hello', 'Salamu', 'Jitambulishe kwa wote'],
                ['question', 'Swali', 'Uliza jambo lolote'],
                ['product', 'Bidhaa', 'Weka kitu unachouza'],
                ['service', 'Huduma', 'Tangaza unachofanya'],
              ].map(([key, name, hint]) => (
                <button key={key} type="button" data-testid={`welcome-post-${key}`} disabled={busy === 'finish'} onClick={() => firstPost(key)}
                  style={{ textAlign: 'left', border: `1px solid ${AUTH.LINE}`, borderRadius: 14, padding: 14, background: '#fff', cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', flexDirection: 'column', gap: 4, minHeight: 84 }}>
                  <b style={{ fontSize: 16, color: AUTH.INK }}>{name}</b>
                  <span style={{ fontSize: 13, color: AUTH.MUTED }}>{hint}</span>
                </button>
              ))}
            </div>
            <div style={{ flex: 1 }} />
            <button type="button" data-testid="welcome-later" disabled={busy === 'finish'} onClick={() => finish(null)} style={pill(false)}>Baadaye</button>
          </>
        )}

        {error && <p role="alert" style={{ margin: 0, fontSize: 14, color: AUTH.RED }}>{error}</p>}
      </div>
    </main>
  );
};

export default Onboarding;
