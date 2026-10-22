import React, { useEffect, useRef, useState } from 'react';
import api from '../../api/api';

// Counter: the anonymous market range on this office's route (all live offices' per-kg
// rates, rounded) and where this office sits in it. Never another office's name or exact
// price: the backend only sends the rounded range and a position. Swahili, like the counter.

const money = (n) => `TZS ${Number(n || 0).toLocaleString('en-US')}`;
export const POSITION_SW = { low: 'Bei yako iko chini sokoni', middle: 'Bei yako iko katikati ya soko', high: 'Bei yako iko juu sokoni' };

const RouteRangePanel = ({ destinationCity, weightKg }) => {
  const [data, setData] = useState(null);
  const seq = useRef(0);

  useEffect(() => {
    const city = String(destinationCity || '').trim();
    if (!city) { setData(null); return undefined; }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const { data: d } = await api.get('/super-agents/me/route-range', {
          params: { destinationCity: city, weightKg: Number(weightKg) > 0 ? Number(weightKg) : undefined },
        });
        if (mine === seq.current) setData(d);
      } catch { if (mine === seq.current) setData(null); }
    }, 400);
    return () => clearTimeout(t);
  }, [destinationCity, weightKg]);

  if (!data) return null;
  return (
    <div data-testid="route-range" style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, marginBottom: 10, backgroundColor: '#f8fafc' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#475569', letterSpacing: 0.5, marginBottom: 6 }}>
        BEI SOKONI · {data.destinationCity} · {data.weightKg} kg
      </div>
      {data.range ? (
        <>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{money(data.range.low)} – {money(data.range.high)}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Katikati: {money(data.range.middle)} · ofisi {data.officeCount}</div>
          {data.position
            ? <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', marginTop: 4 }}>{POSITION_SW[data.position]} ({money(data.mine)})</div>
            : <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Hujaweka bei ya kilo ya mji huu.</div>}
        </>
      ) : (
        <div style={{ fontSize: 12, color: '#64748b' }}>Ofisi chache mno kwenye njia hii kuonyesha bei ya soko.</div>
      )}
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Ni mwongozo tu: unaweza kuandika ada yoyote.</div>
    </div>
  );
};

export default RouteRangePanel;
