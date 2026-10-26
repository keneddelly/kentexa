import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/api';
import BackBar from '../components/BackBar';
import { STATUS_LABEL, what, tzs, localPhone, page, body, card, primary, outline, MUTED, LINE } from './quoteShared';

/** "Maombi yangu ya bei": my requests and the prices I got; pick one, then call them. */
export default function MyQuoteRequests({ onNavigate }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    api.get('/quote-requests/mine').then((r) => setList(r.data || []))
      .catch((e) => { setList([]); setError(e?.response?.data?.message || 'Haikupatikana.'); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (key, fn) => {
    setBusy(key); setError('');
    try { await fn(); load(); } catch (e) { setError(e?.response?.data?.message || 'Imeshindwa. Jaribu tena.'); }
    finally { setBusy(null); }
  };

  return (
    <div style={page}>
      <BackBar onBack={() => onNavigate('back')} title="Maombi yangu ya bei" top={0} />
      <div style={body}>
        <button type="button" onClick={() => onNavigate('QuoteRequest')} style={{ ...primary, marginBottom: 16 }}>Omba bei mpya</button>
        {error && <div role="alert" style={{ ...card, color: '#b91c1c' }}>{error}</div>}
        {list === null && <div style={{ color: MUTED }}>Inapakia…</div>}
        {list && list.length === 0 && !error && (
          <div style={{ ...card, color: MUTED, fontSize: 15 }}>Bado hujaomba bei. Omba bei ya gari zima au ya mzigo mkubwa.</div>
        )}
        {(list || []).map((r) => (
          <div key={r.id} style={card} data-testid="my-quote">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{r.fromCity} → {r.toCity}</div>
              <div style={{ fontSize: 13, color: MUTED, whiteSpace: 'nowrap' }}>{STATUS_LABEL[r.status] || r.status}</div>
            </div>
            <div style={{ fontSize: 15, color: MUTED, marginTop: 2 }}>{what(r)}{r.travelDate ? ` · ${r.travelDate}` : ''}</div>
            <div style={{ fontSize: 15, marginTop: 6 }}>{r.description}</div>

            <div style={{ marginTop: 12, borderTop: `1px solid ${LINE}` }}>
              {r.offers.length === 0 && r.status === 'open' && (
                <div style={{ fontSize: 15, color: MUTED, paddingTop: 12 }}>Bado hakuna bei. Utaarifiwa bei ikifika.</div>
              )}
              {r.offers.map((o) => (
                <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: `1px solid ${LINE}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{o.responderName}</div>
                    {o.note && <div style={{ fontSize: 13, color: MUTED }}>{o.note}</div>}
                    {o.status === 'accepted' && o.phone && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <a href={`tel:${localPhone(o.phone)}`} style={{ ...outline, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Piga {localPhone(o.phone)}</a>
                        <a href={`https://wa.me/${String(o.phone).replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer"
                          style={{ ...outline, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>WhatsApp</a>
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 17, fontWeight: 800 }}>{tzs(o.price)}</div>
                    {r.status === 'open' && (
                      <button type="button" disabled={busy === `a${o.id}`} onClick={() => act(`a${o.id}`, () => api.post(`/quote-requests/${r.id}/accept/${o.id}`))}
                        style={{ ...outline, marginTop: 6, background: '#0f1419', color: '#ffffff', borderColor: '#0f1419' }}>Chagua</button>
                    )}
                    {o.status === 'accepted' && <div style={{ fontSize: 13, color: '#166534', fontWeight: 700 }}>Umechagua</div>}
                  </div>
                </div>
              ))}
            </div>
            {r.status === 'open' && (
              <button type="button" disabled={busy === `c${r.id}`} onClick={() => act(`c${r.id}`, () => api.post(`/quote-requests/${r.id}/cancel`))}
                style={{ ...outline, marginTop: 12, border: 'none', color: '#b91c1c', padding: 0, height: 32 }}>Ghairi ombi</button>
            )}
          </div>
        ))}
        <div style={{ fontSize: 13, color: MUTED, lineHeight: '18px' }}>KenteXa haishiki pesa: unamlipa moja kwa moja yule uliyemchagua.</div>
      </div>
    </div>
  );
}
