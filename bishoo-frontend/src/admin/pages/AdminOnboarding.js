/**
 * Admin: onboarding progress (owner 2026-11-09). Of the people who joined in the last 7 / 30 / 90
 * days, how many reached each welcome step, and what they said they want to do on KenteXa.
 * GET /admin-intelligence/onboarding?days=N. Counts only, from the database; "—" when a step
 * cannot be read.
 */
import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';
import { GOALS } from '../../utils/goals';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const card = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 };
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));

export default function AdminOnboarding({ activePage, onNavigate, onLogout }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setData(null); setError('');
    api.get('/admin-intelligence/onboarding', { params: { days } }).then((r) => setData(r.data)).catch((e) => setError(e?.response?.data?.message || 'Imeshindwa kupakia'));
  }, [days]);
  const joined = data?.steps?.[0]?.count || 0;
  const goalMax = Math.max(1, ...((data?.goals || []).map((g) => g.count || 0)));
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc', color: INK }}>
      <Sidebar activePage={activePage || 'AdminOnboarding'} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1000 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Karibu: wanaojiunga</h1>
            <p style={{ margin: '4px 0 0', color: MUTED, fontSize: 14 }}>Waliojiunga siku {days} zilizopita: wangapi wamefika kila hatua, na wanataka kufanya nini.</p>
          </div>
          <div role="tablist" style={{ display: 'flex', gap: 6 }}>
            {[7, 30, 90].map((d) => (
              <button key={d} type="button" role="tab" aria-selected={days === d} onClick={() => setDays(d)}
                style={{ border: days === d ? 'none' : `1px solid ${LINE}`, background: days === d ? INK : '#fff', color: days === d ? '#fff' : INK, borderRadius: 18, padding: '7px 14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>
                Siku {d}
              </button>
            ))}
          </div>
        </header>
        {error && <p role="alert" style={{ color: '#b91c1c', margin: 0 }}>{error}</p>}
        {!data && !error && <p style={{ color: MUTED }}>Inapakia...</p>}
        {data && (
          <>
            <section style={card} data-testid="onboarding-steps">
              <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Hatua za karibu</h2>
              {joined === 0 && <p style={{ color: MUTED, margin: 0 }}>Hakuna aliyejiunga katika siku hizi.</p>}
              {joined > 0 && data.steps.map((s, i) => {
                const prev = i > 0 ? data.steps[i - 1].count : null;
                const lost = i > 1 && prev != null && s.count != null && prev > s.count ? prev - s.count : null;
                return (
                  <div key={s.key} data-testid={`step-${s.key}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 260px) 1fr 120px', gap: 12, alignItems: 'center', padding: '6px 0' }}>
                    <span style={{ fontSize: 14 }}>{s.label}</span>
                    <span style={{ height: 12, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: `${s.percent ?? 0}%`, background: '#1d4ed8', borderRadius: 6 }} />
                    </span>
                    <span style={{ fontSize: 14, textAlign: 'right' }}>
                      <b>{fmt(s.count)}</b>{s.percent != null ? <span style={{ color: MUTED }}> · {s.percent}%</span> : null}
                      {lost ? <span style={{ display: 'block', fontSize: 12, color: '#b91c1c' }}>-{fmt(lost)} hapa</span> : null}
                    </span>
                  </div>
                );
              })}
            </section>
            <section style={card} data-testid="onboarding-goals">
              <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Wanataka kufanya nini</h2>
              {data.goals.map((g) => {
                const meta = GOALS.find((x) => x.key === g.key);
                return (
                  <div key={g.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 260px) 1fr 80px', gap: 12, alignItems: 'center', padding: '6px 0' }}>
                    <span style={{ fontSize: 14 }}>{meta?.label || g.key}</span>
                    <span style={{ height: 12, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: `${((g.count || 0) / goalMax) * 100}%`, background: '#0f1419', borderRadius: 6 }} />
                    </span>
                    <b style={{ fontSize: 14, textAlign: 'right' }}>{fmt(g.count)}</b>
                  </div>
                );
              })}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
