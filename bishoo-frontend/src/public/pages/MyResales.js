/**
 * "Uza tena" (resell), owner approved 2026-11-09: the person's reselling in one place.
 *   Ofa zangu        their offers: price, profit for one sale, orders, link to share, stop
 *   Bidhaa za kuuza  products suppliers opened for resellers, with the profit at the shop price
 * GET /resale/mine, GET /resale/products, DELETE /resale/offers/:id.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import { resaleLink } from '../components/ResalePanel';

const B = '#1d4ed8';
const DK = '#0f1419';
const GR = '#536471';
const LINE = '#eff3f4';
const WH = '#ffffff';
const tzs = (n) => `TZS ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const thumb = { width: 56, height: 56, borderRadius: 10, objectFit: 'cover', backgroundColor: '#f7f9f9', flexShrink: 0 };
const small = (bg, color = WH) => ({ height: 36, padding: '0 14px', borderRadius: 18, border: bg === WH ? '1px solid #cfd9de' : 'none', backgroundColor: bg, color,
  fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' });

export default function MyResales({ onNavigate }) {
  const [tab, setTab] = useState('mine');
  const [mine, setMine] = useState(null);
  const [open, setOpen] = useState(null);
  const [msg, setMsg] = useState('');

  const loadMine = () => api.get('/resale/mine').then((r) => setMine(r.data || [])).catch(() => setMine([]));
  useEffect(() => { loadMine(); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once on open
  useEffect(() => {
    if (tab !== 'open' || open) return;
    api.get('/resale/products').then((r) => setOpen(r.data || [])).catch(() => setOpen([]));
  }, [tab, open]);

  const share = async (o) => {
    const link = resaleLink({ id: o.productId, name: o.name }, o.id);
    try { if (navigator.share) { await navigator.share({ title: o.name, url: link }); return; } } catch { return; }
    try { await navigator.clipboard?.writeText(link); setMsg('Kiungo kimenakiliwa.'); } catch { setMsg(link); }
  };
  const stop = async (o) => {
    try { await api.delete(`/resale/offers/${o.id}`); loadMine(); } catch (e) { setMsg(e?.response?.data?.message || 'Imeshindikana.'); }
  };

  const tabBtn = (key, text) => (
    <button type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
      style={{ position: 'relative', height: 48, padding: '0 14px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
        fontSize: 15, fontWeight: tab === key ? 700 : 500, color: tab === key ? DK : GR }}>
      {text}
      {tab === key && <span style={{ position: 'absolute', left: 14, right: 14, bottom: 0, height: 4, borderRadius: 2, backgroundColor: B }} />}
    </button>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: WH, color: DK, maxWidth: 640, margin: '0 auto', paddingBottom: 96 }}>
      <header style={{ padding: '16px 16px 4px' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Uza tena</h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: GR, lineHeight: 1.45 }}>
          Uza bidhaa za maduka kwa bei yako. Duka linafikisha na linapokea malipo, kisha linakulipa faida yako. Hakuna ada ya kujiunga.
        </p>
      </header>
      <div role="tablist" style={{ display: 'flex', borderBottom: `1px solid ${LINE}`, padding: '0 4px' }}>
        {tabBtn('mine', 'Ofa zangu')}
        {tabBtn('open', 'Bidhaa za kuuza')}
      </div>
      {msg && <div role="status" style={{ margin: 16, fontSize: 14, color: '#166534', fontWeight: 600, overflowWrap: 'anywhere' }}>{msg}</div>}

      {tab === 'mine' && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} data-testid="resale-mine">
          {mine === null && <li style={{ padding: 16, color: GR }}>Inapakia...</li>}
          {mine?.length === 0 && (
            <li style={{ padding: 16, color: GR, fontSize: 15 }}>
              Huna ofa bado. <button type="button" onClick={() => setTab('open')} style={{ padding: 0, border: 'none', background: 'none', color: B, fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>Tafuta bidhaa za kuuza</button>
            </li>
          )}
          {(mine || []).map((o) => (
            <li key={o.id} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${LINE}`, opacity: o.isActive ? 1 : 0.6 }}>
              {o.image ? <img src={o.image} alt="" style={thumb} /> : <span style={thumb} />}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button type="button" onClick={() => onNavigate(`ProductDetail-${o.productId}`)}
                  style={{ padding: 0, border: 'none', background: 'none', textAlign: 'left', fontSize: 15, fontWeight: 700, color: DK, cursor: 'pointer', fontFamily: 'inherit' }}>{o.name}</button>
                <div style={{ fontSize: 14, color: GR }}>Bei yako {tzs(o.price)} · faida {tzs(o.profitEach)} kila moja · oda {o.orders}</div>
                {o.needsNewPrice && <div style={{ fontSize: 13, color: '#b45309', fontWeight: 600 }}>Duka limepandisha bei. Badilisha bei yako kabla ya kuuza.</div>}
                {!o.isActive && <div style={{ fontSize: 13, color: GR }}>Imesimamishwa</div>}
                {o.isActive && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button type="button" onClick={() => share(o)} style={small(B)}>Shiriki</button>
                    <button type="button" onClick={() => stop(o)} style={small(WH, DK)}>Simamisha</button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {tab === 'open' && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} data-testid="resale-open-products">
          {open === null && <li style={{ padding: 16, color: GR }}>Inapakia...</li>}
          {open?.length === 0 && <li style={{ padding: 16, color: GR, fontSize: 15 }}>Bado hakuna duka lililofungua bidhaa kwa wauzaji.</li>}
          {(open || []).map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onNavigate(`ProductDetail-${p.id}`)}
                style={{ width: '100%', display: 'flex', gap: 12, padding: '12px 16px', border: 'none', borderBottom: `1px solid ${LINE}`, background: WH, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: DK }}>
                {p.image ? <img src={p.image} alt="" style={thumb} /> : <span style={thumb} />}
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{p.name}</span>
                  <span style={{ fontSize: 14, color: GR }}>{p.supplierName || 'Duka'} · unalipa {tzs(p.supplierPrice)}</span>
                  <span style={{ fontSize: 14, color: '#166534', fontWeight: 600 }}>Ukiuza kwa {tzs(p.publicPrice)} unapata {tzs(p.profitAtShopPrice)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
