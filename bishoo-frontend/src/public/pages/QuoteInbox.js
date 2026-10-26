import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/api';
import BackBar from '../components/BackBar';
import { what, tzs, localPhone, page, body, card, input, outline, MUTED } from './quoteShared';

/**
 * "Maombi ya bei" for an office (large goods / containers it takes, in its town) or a
 * transporter (whole vehicle of a kind it has): give a price; when the customer picks
 * yours, their phone shows here.
 */
export default function QuoteInbox({ onNavigate }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [prices, setPrices] = useState({});
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(null);
  const [sent, setSent] = useState(null);

  const load = useCallback(() => {
    api.get('/quote-requests/inbox').then((r) => setData(r.data))
      .catch((e) => { setData({ requests: [] }); setError(e?.response?.data?.message || 'Haikupatikana.'); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const offer = async (r) => {
    const price = String(prices[r.id] ?? '').replace(/[^0-9]/g, '');
    if (!price) return;
    setBusy(r.id); setError(''); setSent(null);
    try {
      await api.post(`/quote-requests/${r.id}/offer`, { price: Number(price), note: (notes[r.id] || '').trim() || undefined });
      setSent(r.id); load();
    } catch (e) { setError(e?.response?.data?.message || 'Imeshindwa kutuma bei.'); }
    finally { setBusy(null); }
  };

  return (
    <div style={page}>
      <BackBar onBack={() => onNavigate('back')} title="Maombi ya bei" top={0} />
      <div style={body}>
        {data?.responder && (
          <div style={{ fontSize: 15, color: MUTED, marginBottom: 12 }}>
            Kama {data.responder.name}: {data.responder.type === 'office' ? 'mizigo mikubwa na kontena unayopokea (Bei zangu)' : 'kodi ya gari zima'}.
          </div>
        )}
        {error && <div role="alert" style={{ ...card, color: '#b91c1c' }}>{error}</div>}
        {data === null && <div style={{ color: MUTED }}>Inapakia…</div>}
        {data && data.requests.length === 0 && !error && (
          <div style={{ ...card, color: MUTED, fontSize: 15 }}>Hakuna maombi kwa sasa. Utaarifiwa ombi jipya likifika.</div>
        )}
        {(data?.requests || []).map((r) => (
          <div key={r.id} style={card} data-testid="inbox-quote">
            <div style={{ fontSize: 17, fontWeight: 800 }}>{r.fromCity} → {r.toCity}</div>
            <div style={{ fontSize: 15, color: MUTED, marginTop: 2 }}>
              {what(r)}{r.travelDate ? ` · ${r.travelDate}` : ''}{r.weightKg ? ` · ${r.weightKg} kg` : ''}
            </div>
            <div style={{ fontSize: 15, marginTop: 6 }}>{r.description}</div>
            {(r.fromText !== r.fromCity || r.toText !== r.toCity) && (
              <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>{r.fromText} → {r.toText}</div>
            )}

            {r.myOffer?.status === 'accepted' ? (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: '#f0fdf4', color: '#166534', fontSize: 15 }}>
                Mteja amechagua bei yako ({tzs(r.myOffer.price)}).
                {r.phone && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <a href={`tel:${localPhone(r.phone)}`} style={{ ...outline, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Piga {localPhone(r.phone)}</a>
                    <a href={`https://wa.me/${String(r.phone).replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer"
                      style={{ ...outline, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>WhatsApp</a>
                  </div>
                )}
              </div>
            ) : r.myOffer?.status === 'declined' || r.status !== 'open' ? (
              <div style={{ marginTop: 12, fontSize: 15, color: MUTED }}>Mteja amechagua mwingine.</div>
            ) : (
              <div style={{ marginTop: 12 }}>
                {r.myOffer && <div style={{ fontSize: 13, color: MUTED, marginBottom: 6 }}>Bei yako sasa: {tzs(r.myOffer.price)}. Unaweza kuibadilisha.</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <input aria-label="Bei yako (TZS)" inputMode="numeric" placeholder="Bei yako (TZS)" value={prices[r.id] ?? ''}
                    onChange={(e) => setPrices((p) => ({ ...p, [r.id]: e.target.value.replace(/[^0-9]/g, '') }))} style={{ ...input, flex: 1 }} />
                  <button type="button" disabled={busy === r.id || !prices[r.id]} onClick={() => offer(r)}
                    style={{ ...outline, height: 48, background: '#0f1419', color: '#ffffff', borderColor: '#0f1419', opacity: prices[r.id] ? 1 : 0.5 }}>
                    {busy === r.id ? '…' : r.myOffer ? 'Badilisha' : 'Tuma bei'}
                  </button>
                </div>
                <input aria-label="Maelezo (si lazima)" placeholder="Maelezo (si lazima), mf. tunaondoka saa 2 asubuhi" value={notes[r.id] ?? ''}
                  onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} style={{ ...input, marginTop: 8 }} />
                {sent === r.id && <div style={{ fontSize: 13, color: '#166534', marginTop: 6 }}>Bei imetumwa kwa mteja.</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
