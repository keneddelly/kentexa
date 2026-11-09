/**
 * Admin: the "Uza tena" launch (owner 2026-11-10: "we need this to become our door to the
 * market"). Shops and resellers taking part, resale orders week by week, how fast shops pay
 * resellers, and every late or disputed profit with both phones, so staff can follow up.
 * GET /admin-intelligence/resale. Numbers from the records only; "—" when a part cannot be read.
 */
import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import SendMessageButton from '../components/SendMessageButton';
import api from '../../api/api';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const BLUE = '#1d4ed8';
const RED = '#b91c1c';
const card = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 };
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
const tzs = (n) => (n == null ? '—' : `TZS ${Math.round(Number(n)).toLocaleString('en-US')}`);
const weekLabel = (w) => (w === 0 ? 'Wiki hii' : w === 1 ? 'Wiki iliyopita' : `Wiki ${w} zilizopita`);
const th = { textAlign: 'left', fontSize: 13, color: MUTED, fontWeight: 700, padding: '6px 8px', borderBottom: `1px solid ${LINE}` };
const td = { fontSize: 14, padding: '8px', borderBottom: `1px solid ${LINE}` };
const STATE = { late: ['Imechelewa', RED], disputed: ['Muuzaji hajapokea', RED] };

const Stat = ({ label, value, tone }) => (
  <div style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
    <span style={{ fontSize: 13, color: MUTED }}>{label}</span>
    <b style={{ fontSize: 22, color: tone || INK }}>{value}</b>
  </div>
);

export default function AdminResale({ activePage, onNavigate, onLogout }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/admin-intelligence/resale').then((r) => setData(r.data)).catch((e) => setError(e?.response?.data?.message || 'Imeshindwa kupakia'));
  }, []);
  const n = data?.network;
  const p = data?.profits;
  const maxOrders = Math.max(1, ...((data?.weeks || []).map((w) => w.orders)));

  const people = (list, title, testId) => (
    <section style={{ ...card, flex: '1 1 380px', minWidth: 0 }} data-testid={testId}>
      <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>{title}</h2>
      {!list?.length ? <p style={{ color: MUTED, margin: 0 }}>Bado hakuna.</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Jina</th><th style={th}>Oda</th><th style={th}>Zimefika</th><th style={th}>Faida</th></tr></thead>
          <tbody>
            {list.map((x) => (
              <tr key={x.id}>
                <td style={td}><button type="button" onClick={() => onNavigate('AdminPerson', { userId: x.id })}
                  style={{ background: 'none', border: 'none', padding: 0, color: BLUE, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>{x.name}</button></td>
                <td style={td}>{fmt(x.orders)}</td><td style={td}>{fmt(x.delivered)}</td><td style={td}>{tzs(x.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc', color: INK }}>
      <Sidebar activePage={activePage || 'AdminResale'} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100 }}>
        <header>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Uza tena: wauzaji</h1>
          <p style={{ margin: '4px 0 0', color: MUTED, fontSize: 14 }}>Maduka na wauzaji wanaoshiriki, oda za wiki 8 zilizopita, na kasi ya maduka kulipa faida.</p>
        </header>
        {error && <p role="alert" style={{ color: RED, margin: 0 }}>{error}</p>}
        {!data && !error && <p style={{ color: MUTED }}>Inapakia...</p>}
        {data && (
          <>
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }} data-testid="resale-network">
              <Stat label="Maduka yaliyofungua bidhaa" value={fmt(n?.suppliers)} />
              <Stat label="Bidhaa za kuuza tena" value={fmt(n?.products)} />
              <Stat label="Wauzaji wenye ofa" value={fmt(n?.resellers)} />
              <Stat label="Ofa zilizo wazi" value={fmt(n?.offers)} />
            </section>

            <section style={card} data-testid="resale-weeks">
              <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Oda za wauzaji kwa wiki</h2>
              {!data.weeks ? <p style={{ color: MUTED, margin: 0 }}>—</p> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>Wiki</th><th style={th}>Oda</th><th style={{ ...th, width: '30%' }} aria-label="Mchoro" /><th style={th}>Zimefika</th><th style={th}>Zimeghairiwa</th><th style={th}>Mauzo</th><th style={th}>Faida ya wauzaji</th></tr></thead>
                  <tbody>
                    {[...data.weeks].reverse().map((w) => (
                      <tr key={w.weekAgo} data-testid={`week-${w.weekAgo}`}>
                        <td style={td}>{weekLabel(w.weekAgo)}</td>
                        <td style={td}><b>{fmt(w.orders)}</b></td>
                        <td style={td}><span style={{ display: 'block', height: 10, borderRadius: 5, background: BLUE, width: `${(w.orders / maxOrders) * 100}%`, minWidth: w.orders ? 4 : 0 }} /></td>
                        <td style={td}>{fmt(w.delivered)}</td><td style={td}>{fmt(w.cancelled)}</td><td style={td}>{tzs(w.sales)}</td><td style={td}>{tzs(w.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }} data-testid="resale-profits">
              <Stat label={`Faida inakuja (${fmt(p?.coming?.count)})`} value={tzs(p?.coming?.amount)} />
              <Stat label={`Maduka yanadaiwa (${fmt(p?.owed?.count)})`} value={tzs(p?.owed?.amount)} />
              <Stat label={`Imechelewa, siku 3+ (${fmt(p?.late?.count)})`} value={tzs(p?.late?.amount)} tone={p?.late?.count ? RED : undefined} />
              <Stat label={`Imethibitishwa (${fmt(p?.confirmed?.count)})`} value={tzs(p?.confirmed?.amount)} tone="#166534" />
              <Stat label={`Haijapokelewa (${fmt(p?.disputed?.count)})`} value={tzs(p?.disputed?.amount)} tone={p?.disputed?.count ? RED : undefined} />
              <Stat label="Siku za kulipa (wastani wa kati)" value={data.payDays?.median == null ? '—' : `${data.payDays.median}`} />
            </section>
            {data.payDays?.paid > 0 && (
              <p style={{ margin: 0, color: MUTED, fontSize: 14 }}>
                Faida {fmt(data.payDays.paid)} zimelipwa; {fmt(data.payDays.withinThree)} kati yake ndani ya siku 3.
              </p>
            )}

            <section style={card} data-testid="resale-problems">
              <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Za kufuatilia</h2>
              {!data.problems?.length ? <p style={{ color: MUTED, margin: 0 }}>Hakuna faida iliyochelewa wala malalamiko.</p> : data.problems.map((x) => {
                const [label, color] = STATE[x.state] || [x.state, MUTED];
                return (
                  <div key={x.orderId} data-testid={`problem-${x.orderId}`} style={{ padding: '10px 0', borderTop: `1px solid ${LINE}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <b>Oda #{x.orderId} · {x.product} · {tzs(x.profit)}</b>
                      <span style={{ color, fontWeight: 700, fontSize: 14 }}>{label}</span>
                    </div>
                    <div style={{ fontSize: 14, color: MUTED }}>{[x.paidRef && `Muamala ${x.paidRef}`, x.note].filter(Boolean).join(' · ')}</div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', fontSize: 14 }}>
                      <span>Duka: <b>{x.supplier?.name}</b> {x.supplier?.phone || ''}</span>
                      <SendMessageButton small userId={x.supplier?.id} name={x.supplier?.name} />
                      <span>Muuzaji: <b>{x.reseller?.name}</b> {x.reseller?.phone || ''}</span>
                      <SendMessageButton small userId={x.reseller?.id} name={x.reseller?.name} />
                    </div>
                  </div>
                );
              })}
            </section>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {people(data.topResellers, 'Wauzaji wanaoongoza', 'resale-top-resellers')}
              {people(data.topSuppliers, 'Maduka yanayoongoza', 'resale-top-suppliers')}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
