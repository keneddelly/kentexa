/**
 * ResaleStartCard.js — "Anza kuuza tena" on Home (owner 2026-11-10, growth plan): for a person who
 * chose "Pata kipato bila duka" at the welcome but has no offer yet. A member sees the two products
 * with the biggest profit right now and opens the list; a person who has not joined is invited to
 * join (no prices before joining). Gone after the first offer; "Ficha" hides it for 7 days.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';

const INK = '#0f1419';
const MUTED = '#536471';
const BLUE = '#2563EB';
const HIDE_KEY = 'kx_resale_start_hidden';
const tzs = (n) => `TZS ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const hiddenRecently = () => {
  try { return Date.now() - Number(localStorage.getItem(HIDE_KEY) || 0) < 7 * 86400000; } catch { return false; }
};

export default function ResaleStartCard({ currentUser, onNavigate }) {
  const wantsResell = (currentUser?.onboardingState?.goals || []).includes('resell');
  const [hidden, setHidden] = useState(hiddenRecently);
  const [state, setState] = useState(null); // { member, products }

  useEffect(() => {
    if (!wantsResell || hidden) return undefined;
    let alive = true;
    (async () => {
      try {
        const [m, mine] = await Promise.all([api.get('/resale/membership'), api.get('/resale/mine').catch(() => ({ data: [] }))]);
        if (!alive) return;
        if (Array.isArray(mine?.data) && mine.data.length > 0) { setState(null); return; } // already reselling
        const member = !!m?.data?.member;
        let products = [];
        if (member) {
          const r = await api.get('/resale/products', { params: { sort: 'profit' } }).catch(() => null);
          products = (r?.data?.items || []).filter((p) => Number(p.profitAtShopPrice) > 0).slice(0, 2);
        }
        if (alive) setState({ member, products });
      } catch { if (alive) setState(null); }
    })();
    return () => { alive = false; };
  }, [wantsResell, hidden]);

  if (!wantsResell || hidden || !state) return null;
  const hide = () => { try { localStorage.setItem(HIDE_KEY, String(Date.now())); } catch { /* storage blocked */ } setHidden(true); };
  const link = { padding: 0, border: 'none', background: 'none', color: BLUE, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' };

  return (
    <section data-testid="resale-start" aria-label="Anza kuuza tena"
      style={{ margin: '8px 12px', border: '1px solid #e6ebef', borderRadius: 14, padding: '10px 12px', background: '#f7f9fa', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <strong style={{ fontSize: 14, color: INK }}>Anza kuuza tena</strong>
        <button type="button" onClick={hide} data-testid="resale-start-hide" style={{ ...link, color: MUTED, fontWeight: 500, fontSize: 13 }}>Ficha</button>
      </div>
      {!state.member ? (
        <>
          <span style={{ fontSize: 14, color: MUTED, lineHeight: 1.45 }}>Uza bidhaa za maduka kwa bei yako, bila duka wala mtaji. Jiunge kwa kubonyeza mara moja.</span>
          <button type="button" data-testid="resale-start-join" onClick={() => onNavigate('MyResales', { tab: 'open' })} style={{ ...link, alignSelf: 'flex-start' }}>Jiunge na Uza tena</button>
        </>
      ) : (
        <>
          {state.products.length > 0
            ? state.products.map((p) => (
              <button key={p.id} type="button" data-testid={`resale-start-${p.id}`} onClick={() => onNavigate(`ProductDetail-${p.id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 0, border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
                {p.image ? <img src={p.image} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} /> : null}
                <span style={{ minWidth: 0, fontSize: 14, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 13, fontWeight: 700, color: '#166534' }}>faida {tzs(p.profitAtShopPrice)}</span>
              </button>
            ))
            : <span style={{ fontSize: 14, color: MUTED }}>Chagua bidhaa ya kwanza, weka bei yako na shiriki kwenye WhatsApp Status.</span>}
          <button type="button" data-testid="resale-start-all" onClick={() => onNavigate('MyResales', { tab: 'open' })} style={{ ...link, alignSelf: 'flex-start' }}>Ona bidhaa zote za kuuza</button>
        </>
      )}
    </section>
  );
}
