import React, { useEffect, useRef, useState } from 'react';
import api from '../../api/api';

// Counter preview of the office price rule: pickup, transport, delivery and total, from
// the same calculation the backend uses when the parcel is saved. The agent may charge a
// different amount, but then must write a reason (it is saved on the receipt). With no
// suggestion (by kg, no rate for the town) the agent types the price and no reason is asked.
// Swahili, like the rest of the dashboard.

const money = (n) => `TZS ${Number(n || 0).toLocaleString('en-US')}`;
const lineText = (l) => (!l || l.status === 'not_included' ? 'Haihusiki' : l.status === 'free' ? 'Bure' : money(l.amount));
export const REASON_MIN = 3;

export const feeDiffers = (quote, fee) => !!quote && !quote.noSuggestion && String(fee ?? '') !== '' && Number(fee) !== Number(quote.total);

const OfficePricePreview = ({ input, fee, reason, onQuote, onUseTotal, onReasonChange }) => {
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);
  const { declaredValue, weightKg, destinationCity, servicePath, deliveryAddress } = input || {};

  useEffect(() => {
    const value = Number(declaredValue);
    if (!value || value <= 0) { setQuote(null); onQuote?.(null); setError(''); return undefined; }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const { data } = await api.post('/super-agents/me/price-quote', {
          declaredValue: value, weightKg: weightKg ? Number(weightKg) : undefined, destinationCity, servicePath, deliveryAddress,
        });
        if (mine !== seq.current) return;
        setQuote(data); onQuote?.(data);
      } catch (e) {
        if (mine !== seq.current) return;
        setQuote(null); onQuote?.(null);
        setError(e?.response?.data?.message || 'Imeshindwa kupata bei ya ofisi');
      } finally { if (mine === seq.current) setLoading(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [declaredValue, weightKg, destinationCity, servicePath, deliveryAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!quote && !loading && !error) return null;
  const differs = feeDiffers(quote, fee);
  return (
    <div data-testid="office-price-preview" style={{ border: '1px solid #bfdbfe', borderRadius: 12, padding: 12, marginBottom: 10, backgroundColor: '#f8fbff' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#1d4ed8', letterSpacing: 0.5, marginBottom: 6 }}>BEI YA OFISI</div>
      {loading && !quote && <div style={{ fontSize: 13, color: '#64748b' }}>Inahesabu bei…</div>}
      {error && <div role="alert" style={{ fontSize: 13, color: '#b91c1c' }}>{error}</div>}
      {quote?.noSuggestion && (
        <div data-testid="office-price-no-suggestion" style={{ fontSize: 13, color: '#334155' }}>
          Hakuna bei ya kilo ya ofisi kwa mji huu. Andika ada mwenyewe (unaweza kuweka bei ya mji huu kwenye Bei).
        </div>
      )}
      {quote && !quote.noSuggestion && (
        <>
          {[['Kuchukua', lineText(quote.pickup)],
            ['Usafirishaji', quote.transport?.mode === 'same_city' ? 'Haihusiki' : money(quote.transport?.amount)],
            ['Kufikisha', lineText(quote.delivery)]].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', color: '#334155' }}>
              <span>{l}</span><span style={{ fontWeight: 700 }}>{v}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight:800, padding: '6px 0 2px', borderTop: '1px dashed #cbd5e1', marginTop: 4, color: '#0f172a' }}>
            <span>Jumla</span><span>{money(quote.total)}</span>
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            {quote.transport?.mode === 'same_city'
              ? 'Ndani ya Dar es Salaam: ada ya boda boda tu'
              : quote.transport?.mode === 'kg'
                ? `Kwa kilo: ${money(quote.transport.ratePerKg)}/kg, kiwango cha chini ${money(quote.transport.minimum)}`
                : `${quote.transport?.percent}% ya thamani, kiwango cha chini ${money(quote.transport?.minimum)}`}
            {quote.ruleSource === 'default' && ' · Bei ya kawaida (weka yako kwenye Bei)'}
          </div>
          {Number(fee) !== Number(quote.total) && (
            <button type="button" onClick={() => onUseTotal?.(quote.total)}
              style={{ marginTop: 8, minHeight: 36, padding: '0 12px', borderRadius: 8, border: '1px solid #1d4ed8', backgroundColor: '#fff', color: '#1d4ed8', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
              Tumia {money(quote.total)}
            </button>
          )}
          {differs && (
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#b45309', display: 'block', marginBottom: 3 }}>
                Ada ni tofauti na bei ya ofisi. Sababu ya kubadilisha bei *
              </label>
              <input type="text" value={reason || ''} onChange={(e) => onReasonChange?.(e.target.value)} placeholder="mf. Punguzo la mteja wa kudumu"
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9, border: '1px solid #f59e0b', fontSize: 13 }} />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default OfficePricePreview;
