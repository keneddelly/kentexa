import React, { useEffect, useState } from 'react';
import api from '../../api/api';

// Office settings: does this office collect parcels from senders? (owner 2026-10-23)
// Free pickup or its own price makes the office stand out in the customer's send form.
// Optional distance limit from the office's own point (e.g. only around Kariakoo).
// Hidden until the server has it switched on (503) or for a non-office account.

const MODES = [
  ['none', 'Sichukui mzigo kwa mteja', 'Mteja analeta ofisini, au wakala anauleta'],
  ['free', 'Nachukua bure', 'Ofisi yako inaenda kuchukua mzigo bila malipo'],
  ['fixed', 'Nachukua kwa bei', 'Unaweka bei yako ya kuchukua'],
];
const input = { width: '100%', height: 48, boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 10, padding: '0 12px', fontSize: 16, fontFamily: 'inherit' };
const digits = (v) => String(v ?? '').replace(/[^0-9]/g, '');

const OfficePickupCard = () => {
  const [data, setData] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [mode, setMode] = useState('none');
  const [fee, setFee] = useState('');
  const [maxKm, setMaxKm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const apply = (d) => {
    setData(d);
    setMode(d.mode || 'none');
    setFee(d.fee != null ? String(d.fee) : '');
    setMaxKm(d.maxKm != null ? String(d.maxKm) : '');
  };

  useEffect(() => {
    api.get('/super-agents/me/pickup').then((r) => apply(r.data)).catch(() => setHidden(true));
  }, []);

  if (hidden || !data) return null;

  const save = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const { data: saved } = await api.put('/super-agents/me/pickup', {
        mode, fee: mode === 'fixed' ? Number(digits(fee)) : undefined, maxKm: mode !== 'none' && digits(maxKm) ? Number(digits(maxKm)) : null,
      });
      apply(saved);
      setMessage('Imehifadhiwa. Wateja wataona huduma hii wakituma mzigo.');
    } catch (e) {
      setError(e?.response?.data?.message || 'Imeshindikana kuhifadhi.');
    } finally { setBusy(false); }
  };

  const canSave = mode !== 'fixed' || Number(digits(fee)) > 0;

  return (
    <div data-testid="office-pickup-card" style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginTop: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>Kuchukua mzigo kwa mteja</div>
      <div style={{ fontSize: 13, color: '#475569', margin: '4px 0 12px', lineHeight: 1.45 }}>
        Ukichukua bure au kwa bei nzuri, ofa yako inaonekana vizuri zaidi mteja akitafuta usafiri.
      </div>
      <div role="radiogroup" aria-label="Kuchukua mzigo">
        {MODES.map(([value, title, hint]) => (
          <button key={value} type="button" role="radio" aria-checked={mode === value} onClick={() => setMode(value)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 52, padding: '8px 12px', marginBottom: 8,
              borderRadius: 12, border: mode === value ? '2px solid #1d4ed8' : '1px solid #cbd5e1', background: mode === value ? '#eff6ff' : '#fff',
              fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
            <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: 9, boxSizing: 'border-box', flexShrink: 0,
              border: mode === value ? '5px solid #1d4ed8' : '2px solid #94a3b8', background: '#fff' }} />
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{title}</span>
              <span style={{ fontSize: 12, color: '#475569' }}>{hint}</span>
            </span>
          </button>
        ))}
      </div>
      {mode === 'fixed' && (
        <div style={{ marginTop: 6 }}>
          <label htmlFor="pickup-fee" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>Bei ya kuchukua (TZS)</label>
          <input id="pickup-fee" inputMode="numeric" value={digits(fee) ? Number(digits(fee)).toLocaleString('en-US') : ''} onChange={(e) => setFee(digits(e.target.value))} placeholder="2,000" style={input} />
        </div>
      )}
      {mode !== 'none' && (
        <div style={{ marginTop: 10 }}>
          <label htmlFor="pickup-km" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>Umbali wa juu kutoka ofisini (km, hiari)</label>
          <input id="pickup-km" inputMode="numeric" value={maxKm} onChange={(e) => setMaxKm(digits(e.target.value))} placeholder="Mfano 3" style={input} />
          <div style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 1.4 }}>
            Ukiacha wazi, unachukua popote mjini kwako.
            {digits(maxKm) && !data.officePointSet ? ' Weka kwanza mahali pa ofisi kwenye ramani juu, la sivyo umbali hautaweza kupimwa.' : ''}
          </div>
        </div>
      )}
      {error && <div role="alert" style={{ fontSize: 13, color: '#b91c1c', marginTop: 10 }}>{error}</div>}
      {message && <div role="status" style={{ fontSize: 13, color: '#15803d', marginTop: 10 }}>{message}</div>}
      <button type="button" onClick={save} disabled={busy || !canSave}
        style={{ width: '100%', height: 48, marginTop: 12, border: 0, borderRadius: 10, background: '#1d4ed8', color: '#fff',
          fontFamily: 'inherit', fontSize: 15, fontWeight: 700, cursor: busy || !canSave ? 'not-allowed' : 'pointer', opacity: busy || !canSave ? 0.6 : 1 }}>
        {busy ? 'Inahifadhi…' : 'Hifadhi'}
      </button>
    </div>
  );
};

export default OfficePickupCard;
