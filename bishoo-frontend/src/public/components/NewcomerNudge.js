/**
 * NewcomerNudge.js — the welcome keeps asking on Home (owner approved 2026-11-02): the
 * photo and the first post were "strong ask, can skip". One small card at a time, at the
 * top of For You:
 *   no photo yet       -> "Weka picha yako" (opens the photo page);
 *   no post yet        -> "Chapisho lako la kwanza" (opens the composer with a ready start).
 * Before both, for people who joined before the new welcome (owner 2026-11-09, "catch up old
 * users"): "Karibu kwenye KenteXa mpya" opens the welcome once (town, topics, what they want to
 * do, communities, follows). Shown when the old welcome is done but the new one never was.
 * "Baadaye" hides it for a day on this phone. The post count comes from the server
 * (GET /feed/profile/:id/summary); nothing is shown when it cannot be read.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import { firstPostStart } from '../../utils/firstPost';

const INK = '#0f1419';
const MUTED = '#536471';
const DAY = 24 * 60 * 60 * 1000;
const hiddenKey = (uid, what) => `kentexa_nudge_${what}_${uid}`;
const hidden = (uid, what) => {
  try { return Date.now() - Number(window.localStorage.getItem(hiddenKey(uid, what)) || 0) < DAY; } catch { return false; }
};

export default function NewcomerNudge({ currentUser, activeProfileId, onNavigate, onOpenMoment, refreshKey = 0 }) {
  const uid = currentUser?.id;
  const [postCount, setPostCount] = useState(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!uid || !activeProfileId) { setPostCount(null); return undefined; }
    let alive = true;
    Promise.resolve(api.get(`/feed/profile/${activeProfileId}/summary`))
      .then((r) => { if (alive) setPostCount(Number.isFinite(Number(r?.data?.postCount)) ? Number(r.data.postCount) : null); })
      .catch(() => { if (alive) setPostCount(null); });
    return () => { alive = false; };
  }, [uid, activeProfileId, refreshKey]);

  if (!uid) return null;
  const later = (what) => { try { window.localStorage.setItem(hiddenKey(uid, what), String(Date.now())); } catch { /* storage blocked */ } setTick((n) => n + 1); };

  let card = null;
  if (currentUser.onboardingCompleted === true && !currentUser.onboardingState?.welcomedAt && !hidden(uid, 'welcome')) {
    card = { what: 'welcome', title: 'Karibu kwenye KenteXa mpya', text: 'Chagua mada, jumuiya na unachotaka kufanya hapa. Inachukua dakika moja.', go: 'Anza',
      act: () => onNavigate('Onboarding') };
  } else if (!currentUser.avatarUrl && !hidden(uid, 'photo')) {
    card = { what: 'photo', title: 'Weka picha yako', text: 'Watu wanakuamini zaidi wakiona sura yako.', go: 'Weka picha', act: () => onNavigate('AddProfilePhoto') };
  } else if (postCount === 0 && !hidden(uid, 'post')) {
    card = { what: 'post', title: 'Chapisho lako la kwanza', text: 'Jitambulishe: watu wa mada zako wataanza kukuona.', go: 'Andika sasa',
      act: () => onOpenMoment?.('moment', { kind: 'moment', text: firstPostStart(currentUser, currentUser.city) }) };
  }
  if (!card) return null;
  return (
    <section data-testid={`nudge-${card.what}`} style={{ margin: '10px 12px 4px', border: '1px solid #e6ebef', borderRadius: 16, padding: 14, background: '#fff',
      display: 'flex', flexDirection: 'column', gap: 8 }}>
      <strong style={{ fontSize: 16, color: INK }}>{card.title}</strong>
      <span style={{ fontSize: 14, color: MUTED }}>{card.text}</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" data-testid="nudge-go" onClick={card.act}
          style={{ height: 34, padding: '0 16px', borderRadius: 17, border: 'none', background: INK, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>{card.go}</button>
        <button type="button" data-testid="nudge-later" onClick={() => later(card.what)}
          style={{ height: 34, padding: '0 16px', borderRadius: 17, border: '1px solid #cfd9de', background: '#fff', color: INK, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Baadaye</button>
      </div>
    </section>
  );
}
