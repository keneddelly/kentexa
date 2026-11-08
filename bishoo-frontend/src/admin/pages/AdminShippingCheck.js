/**
 * Admin: "Kwa nini hakuna?" (owner 2026-11-08: "run a check on agent, office ... the system says no
 * agent available ... no office available"). One trip in; every agent and every office out, each
 * with whether it is offered and the exact reason when not (POST /transport/service-offers/explain,
 * the same rules as the customer's search). Read-only.
 */
import React, { useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';
import IntelligentLocationInput from '../../public/components/IntelligentLocationInput';

const INK = '#0f1419';
const MUTED = '#536471';
const GREEN = '#05603a';
const RED = '#b42318';
const input = { height: 40, padding: '0 12px', borderRadius: 8, border: '1px solid #cfd9de', fontSize: 15, fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' };
const card = { background: '#fff', border: '1px solid #eff3f4', borderRadius: 14, padding: 14 };
const sideOf = (resolved, text) => (resolved?.placeRef
  ? { place: { providerKey: resolved.placeRef.providerKey, providerPlaceId: resolved.placeRef.providerPlaceId } }
  : { text: String(text || '').trim() });

function Row({ item, kind }) {
  return (
    <div data-testid={`check-${kind}-${item.id}`} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid #eff3f4' }}>
      <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 5, marginTop: 6, flexShrink: 0, background: item.ok ? GREEN : RED }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, color: INK }}>{item.name || `#${item.id}`}
          <span style={{ fontWeight: 400, color: MUTED }}> · {[item.city, item.district, item.region].filter(Boolean).join(', ') || 'mji haujawekwa'}
            {item.distanceKm != null ? ` · km ${item.distanceKm}` : ''}{kind === 'agent' && !item.hasBase ? ' · hana kituo' : ''}
            {kind === 'office' ? ` · ${item.chargeMode}` : ''}</span>
        </div>
        {item.ok
          ? <div style={{ color: GREEN, fontSize: 14 }}>Anaonekana{item.note ? ` — ${item.note}` : ''}</div>
          : item.reasons.map((r) => <div key={r} style={{ color: RED, fontSize: 14 }}>{r}</div>)}
        {kind === 'office' && item.routes?.length > 0 && <div style={{ color: MUTED, fontSize: 13 }}>Inatuma: {item.routes.join(', ')}</div>}
      </div>
    </div>
  );
}

export default function AdminShippingCheck({ activePage, onNavigate, onLogout }) {
  const [form, setForm] = useState({ fromCity: 'Dar es Salaam', toCity: 'Dar es Salaam', weightKg: '1', declaredValue: '50000', door: true });
  const [fromText, setFromText] = useState(''); const [fromPlace, setFromPlace] = useState(null);
  const [toText, setToText] = useState(''); const [toPlace, setToPlace] = useState(null);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const run = async () => {
    setBusy(true); setError('');
    try {
      const sameTown = form.fromCity.trim().toLowerCase() === form.toCity.trim().toLowerCase();
      const r = await api.post('/transport/service-offers/explain', {
        fromCity: form.fromCity, toCity: form.toCity, weightKg: Number(form.weightKg) || 1,
        declaredValue: Number(String(form.declaredValue).replace(/\D/g, '')) || undefined,
        pickup: form.door ? 'door' : 'point', delivery: sameTown && form.door ? 'door' : 'collect',
        origin: fromPlace || fromText ? sideOf(fromPlace, fromText) : undefined,
        destination: toPlace || toText ? sideOf(toPlace, toText) : undefined,
      });
      setData(r.data);
    } catch (e) { setError(e?.response?.data?.message || 'Imeshindikana'); setData(null); } finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f7f9f9' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32, maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 14, color: INK }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Kwa nini hakuna?</h1>
        <p style={{ margin: 0, color: MUTED }}>Weka safari: utaona kila wakala na kila ofisi, na sababu kama haonekani.</p>
        <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <label>Mji wa kutoka<input aria-label="Mji wa kutoka" style={input} value={form.fromCity} onChange={set('fromCity')} /></label>
          <label>Mji wa kwenda<input aria-label="Mji wa kwenda" style={input} value={form.toCity} onChange={set('toCity')} /></label>
          <label>Uzito (kg)<input aria-label="Uzito" style={input} inputMode="decimal" value={form.weightKg} onChange={set('weightKg')} /></label>
          <label>Thamani (TZS)<input aria-label="Thamani" style={input} inputMode="numeric" value={form.declaredValue} onChange={set('declaredValue')} /></label>
          <div><IntelligentLocationInput label="Mahali pa kuchukua (si lazima)" value={fromText} onTextChange={setFromText} onResolved={setFromPlace} /></div>
          <div><IntelligentLocationInput label="Mahali pa kufikisha (si lazima)" value={toText} onTextChange={setToText} onResolved={setToPlace} /></div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={form.door} onChange={set('door')} /> Achukuliwe mlangoni</label>
          <button type="button" data-testid="check-run" disabled={busy} onClick={run}
            style={{ height: 40, borderRadius: 20, border: 'none', background: INK, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>
            {busy ? 'Inaangalia…' : 'Angalia'}
          </button>
        </div>
        {error && <p role="alert" style={{ margin: 0, color: RED }}>{error}</p>}
        {data && (
          <>
            <div style={card} data-testid="check-found">
              <b>Mteja anaona: </b>{data.found.length ? data.found.map((f) => `${f.name}${f.price != null ? ` (TZS ${Number(f.price).toLocaleString('en-US')})` : ''}`).join(' · ') : 'hakuna kitu'}
              {data.notes.map((n) => <div key={n} style={{ color: MUTED, fontSize: 14, marginTop: 4 }}>{n}</div>)}
              <div style={{ color: MUTED, fontSize: 13, marginTop: 4 }}>Kikomo cha umbali: wakala km {data.radiusKm.agent}, ofisi km {data.radiusKm.office}.</div>
            </div>
            <div style={card}>
              <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>Mawakala ({data.agents.filter((a) => a.ok).length} kati ya {data.agents.length})</h2>
              {data.agents.map((a) => <Row key={a.id} item={a} kind="agent" />)}
            </div>
            <div style={card}>
              <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>Ofisi ({data.offices.filter((o) => o.ok).length} kati ya {data.offices.length})</h2>
              {data.offices.map((o) => <Row key={o.id} item={o} kind="office" />)}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
