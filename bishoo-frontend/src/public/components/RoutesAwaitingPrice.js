import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';

// Msafirishaji (owner 2026-10-14): the main route from sign-up is created
// switched off and without a price. After approval, the provider sets its
// first price here ("Weka bei"), which also switches the route on.
const card = { backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 14, padding: 14, marginBottom: 10 };
const lbl = { display: 'block', flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: '#475569' };
const inp = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' };

// onCount(n): how many routes wait for a price (the dashboard hides its
// "no routes yet" box while one waits here).
export default function RoutesAwaitingPrice({ onPriced, onCount }) {
  const { t } = useTranslation();
  const [routes, setRoutes] = useState([]);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    const res = await api.get('/transport/routes/awaiting-price').catch(() => ({ data: [] }));
    const list = Array.isArray(res.data) ? res.data : [];
    setRoutes(list);
    if (onCount) onCount(list.length);
  }, [onCount]);
  useEffect(() => { load(); }, [load]);

  const save = async (r) => {
    const d = draft[r.id] || {};
    const perKg = Number(d.pricePerKg); const min = Number(d.fixedFee);
    if (!(perKg > 0) && !(min > 0)) { setMessage({ id: r.id, ok: false, text: t('transport_signup.price_required') }); return; }
    setBusy(r.id); setMessage(null);
    try {
      await api.patch(`/transport/routes/${r.id}`, { pricePerKg: perKg > 0 ? perKg : 0, fixedFee: min > 0 ? min : 0, isActive: true });
      await load();
      if (onPriced) onPriced();
    } catch (err) {
      const m = err?.response?.data?.message;
      setMessage({ id: r.id, ok: false, text: Array.isArray(m) ? m.join(', ') : (m || t('pickup_queue.failed')) });
    } finally { setBusy(null); }
  };

  if (!routes.length) return null;
  return (
    <div data-testid="routes-awaiting-price">
      {routes.map((r) => (
        <div key={r.id} style={card}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#9a3412' }}>{t('transport_signup.weka_bei_title')}</div>
          <div style={{ fontSize: 13, color: '#1e293b', margin: '4px 0 10px' }}>{r.originCity} → {r.destinationCity}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={lbl}>{t('transport_signup.price_per_kg')}
              <input style={{ ...inp, marginTop: 4 }} type="number" inputMode="numeric" min="0" placeholder="500"
                value={draft[r.id]?.pricePerKg ?? ''} onChange={(e) => setDraft((p) => ({ ...p, [r.id]: { ...p[r.id], pricePerKg: e.target.value } }))} />
            </label>
            <label style={lbl}>{t('transport_signup.min_fee')}
              <input style={{ ...inp, marginTop: 4 }} type="number" inputMode="numeric" min="0" placeholder="5000"
                value={draft[r.id]?.fixedFee ?? ''} onChange={(e) => setDraft((p) => ({ ...p, [r.id]: { ...p[r.id], fixedFee: e.target.value } }))} />
            </label>
          </div>
          {message?.id === r.id && <div role="alert" style={{ fontSize: 12, color: '#b91c1c', marginTop: 6 }}>{message.text}</div>}
          <button type="button" disabled={busy === r.id} onClick={() => save(r)}
            style={{ marginTop: 10, width: '100%', padding: 12, border: 'none', borderRadius: 10, background: '#ea580c', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
            {busy === r.id ? '...' : t('transport_signup.weka_bei_button')}
          </button>
        </div>
      ))}
    </div>
  );
}
