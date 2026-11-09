/**
 * Kazi: "Maliza kujiunga" (owner 2026-11-09). What the person said at the welcome they want to do
 * (onboardingState.goals) and has not finished yet: each row opens its short form. Done is read
 * from the person's real roles and businesses (utils/goals). Hidden on this phone with "Ficha".
 */
import React, { useState } from 'react';
import { goalsToFinish } from '../../utils/goals';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const KEY = 'kentexa_goals_hidden';

export default function GoalsCard({ currentUser, roleOptions, businesses, onNavigate }) {
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } });
  const left = goalsToFinish(currentUser?.onboardingState?.goals, { roles: roleOptions || [], businesses: businesses || [] });
  if (hidden || !left.length) return null;
  const hide = () => { try { localStorage.setItem(KEY, '1'); } catch { /* storage blocked */ } setHidden(true); };
  return (
    <section data-testid="goals-card" style={{ border: `1px solid ${LINE}`, borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, color: INK }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <strong style={{ fontSize: 17 }}>Maliza kujiunga</strong>
        <button type="button" onClick={hide} style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', padding: 0 }}>Ficha</button>
      </div>
      <span style={{ fontSize: 14, color: MUTED }}>Ulisema unataka kufanya haya. Kila moja ni fomu fupi.</span>
      {left.map((g) => (
        <button key={g.key} type="button" data-testid={`goal-${g.key}`} onClick={() => onNavigate(g.page)}
          style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12,
            padding: '10px 14px', cursor: 'pointer', fontFamily: 'inherit', color: INK }}>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <b style={{ fontSize: 15 }}>{g.label}</b>
            <span style={{ fontSize: 13, color: MUTED }}>{g.hint}</span>
          </span>
          <span aria-hidden="true" style={{ color: MUTED, fontSize: 20 }}>›</span>
        </button>
      ))}
    </section>
  );
}
