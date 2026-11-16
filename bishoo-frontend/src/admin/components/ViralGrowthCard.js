import React, { useEffect, useState } from 'react';
import api from '../../api/api';

// Viral engine stage E (issue #381, owner approved 2026-11-16): what sharing brings. Plain counts
// from recorded shares, opens and new accounts (no estimates).
const CHANNEL = { whatsapp: 'WhatsApp', status: 'WhatsApp Status', facebook: 'Facebook', telegram: 'Telegram', x: 'X', copy: 'Kiungo kilichonakiliwa', native: 'Njia za simu', image: 'Picha', link: 'Kiungo' };
const pct = (v) => (v == null ? '–' : `${v}%`);
const short = (s) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > 60 ? `${t.slice(0, 59)}…` : t; };

export default function ViralGrowthCard() {
  const [days, setDays] = useState(30);
  const [r, setR] = useState(null);
  const [state, setState] = useState('loading');
  useEffect(() => {
    setState('loading');
    api.get('/share-links/admin/report', { params: { days } })
      .then((res) => { setR(res.data); setState('ready'); })
      .catch(() => setState('error'));
  }, [days]);

  const stat = (n, label) => (
    <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px', minWidth: 0 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{n}</div>
      <div style={{ fontSize: 12, color: '#64748b' }}>{label}</div>
    </div>
  );
  const t = r?.totals || {};
  return (
    <div data-testid="viral-growth-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Ukuaji kupitia kushiriki</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Viungo vilivyoshirikiwa, vilivyofunguliwa na watu wapya waliojiunga.</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d}
              style={{ borderRadius: 999, padding: '6px 12px', border: '1px solid #cbd5e1', background: days === d ? '#0f172a' : '#fff', color: days === d ? '#fff' : '#0f172a', fontWeight: 700, cursor: 'pointer' }}>
              Siku {d}
            </button>
          ))}
        </div>
      </div>
      {state === 'loading' && <div style={{ fontSize: 13, color: '#64748b', marginTop: 12 }}>Inapakia...</div>}
      {state === 'error' && <div role="alert" style={{ fontSize: 13, color: '#b91c1c', marginTop: 12 }}>Imeshindikana kupakia ripoti.</div>}
      {state === 'ready' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginTop: 14 }}>
            {stat(t.links, 'viungo vilivyoshirikiwa')}
            {stat(t.sharers, 'watu walioshiriki')}
            {stat(t.opens, 'mara vimefunguliwa')}
            {stat(t.guestOpens, 'wageni waliofungua')}
            {stat(t.joined, 'watu wapya waliojiunga')}
            {stat(t.firstParticipation7d, 'walishiriki ndani ya siku 7')}
            {stat(t.resharingNewMembers, 'wapya walioshiriki tena')}
            {stat(r.rates?.newMembersPerSharer ?? '–', 'wapya kwa kila mshiriki')}
          </div>
          <div style={{ fontSize: 13, color: '#334155', marginTop: 10 }}>
            Mgeni → kujiunga: <b>{pct(r.rates?.openToJoinPct)}</b> · Kujiunga → kushiriki (siku 7): <b>{pct(r.rates?.joinToParticipatePct)}</b>
          </div>
          {r.byChannel?.length > 0 && (
            <table data-testid="viral-by-channel" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14, fontSize: 13 }}>
              <thead><tr style={{ textAlign: 'left', color: '#64748b' }}><th>Njia</th><th>Viungo</th><th>Vimefunguliwa</th><th>Wamejiunga</th></tr></thead>
              <tbody>{r.byChannel.map((c) => (
                <tr key={c.channel} style={{ borderTop: '1px solid #f1f5f9' }}><td>{CHANNEL[c.channel] || c.channel}</td><td>{c.links}</td><td>{c.opens}</td><td>{c.joined}</td></tr>
              ))}</tbody>
            </table>
          )}
          {r.topContent?.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Vinavyoleta watu zaidi</div>
              {r.topContent.map((c) => (
                <div key={`${c.contentType}-${c.contentId}`} style={{ fontSize: 13, color: '#334155', padding: '4px 0', borderTop: '1px solid #f1f5f9' }}>
                  {c.contentType === 'community' ? 'Jumuiya' : 'Chapisho'} #{c.contentId}: {short(c.title && c.title !== 'Moment' ? c.title : c.body)} · {c.opens} wamefungua · {c.joined} wamejiunga
                </div>
              ))}
            </div>
          )}
          {r.topCommunities?.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Jumuiya zinazovutia wageni</div>
              {r.topCommunities.map((c) => (
                <div key={c.id} style={{ fontSize: 13, color: '#334155', padding: '4px 0', borderTop: '1px solid #f1f5f9' }}>{short(c.name)} · {c.opens} wamefungua · {c.joined} wamejiunga</div>
              ))}
            </div>
          )}
          {!t.links && <div style={{ fontSize: 13, color: '#64748b', marginTop: 12 }}>Bado hakuna viungo vilivyoshirikiwa katika kipindi hiki.</div>}
        </>
      )}
    </div>
  );
}
