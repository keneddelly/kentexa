/**
 * "Bidhaa za kuuza" (owner 2026-11-10: every product open for reselling in one dedicated place,
 * easy to find). Search, category chips, newest or biggest profit first; each product shows the
 * shop price, what the reseller pays, the profit and stock, and "Uza tena" sets a price and gives
 * the share link without leaving the list. GET /resale/products, POST /resale/offers.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import { resaleLink, shareToStatus, STATUS_DONE } from '../../utils/resaleShare';

const B = '#1d4ed8';
const DK = '#0f1419';
const GR = '#536471';
const LINE = '#eff3f4';
const WH = '#ffffff';
const GREEN = '#166534';
const tzs = (n) => `TZS ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const thumb = { width: 64, height: 64, borderRadius: 10, objectFit: 'cover', backgroundColor: '#f7f9f9', flexShrink: 0 };
const pill = (on) => ({ flexShrink: 0, height: 34, padding: '0 14px', borderRadius: 17, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
  border: `1px solid ${on ? DK : '#cfd9de'}`, background: on ? DK : WH, color: on ? WH : DK });
const btn = (bg, color = WH) => ({ height: 36, padding: '0 14px', borderRadius: 18, border: bg === WH ? '1px solid #cfd9de' : 'none', background: bg, color,
  fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' });
const pretty = (key) => String(key || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

function Row({ p, onNavigate, onSaved, resellerName }) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(String(Math.round(p.publicPrice || p.floor || 0)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [offer, setOffer] = useState(null);
  const mine = Number(price) || 0;
  const profit = mine - p.supplierPrice;

  const save = async () => {
    setErr('');
    if (mine < p.floor) { setErr(`Bei isiwe chini ya ${tzs(p.floor)}.`); return; }
    try {
      setBusy(true);
      const r = await api.post('/resale/offers', { productId: p.id, price: mine });
      setOffer(r.data);
      onSaved?.();
    } catch (e) { setErr(e?.response?.data?.message || 'Imeshindikana.'); } finally { setBusy(false); }
  };
  const share = async () => {
    const link = resaleLink(p, offer.id);
    try { if (navigator.share) { await navigator.share({ title: p.name, text: `${p.name}: ${tzs(offer.price)}`, url: link }); return; } } catch { return; }
    try { await navigator.clipboard?.writeText(link); setErr(''); setOffer({ ...offer, copied: true }); } catch { setOffer({ ...offer, copied: link }); }
  };

  return (
    <li data-testid={`catalogue-${p.id}`} style={{ padding: '12px 16px', borderBottom: `1px solid ${LINE}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 12 }}>
        {p.image ? <img src={p.image} alt="" style={thumb} /> : <span style={thumb} />}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <button type="button" onClick={() => onNavigate(`ProductDetail-${p.id}`)}
            style={{ padding: 0, border: 'none', background: 'none', textAlign: 'left', fontSize: 15, fontWeight: 700, color: DK, cursor: 'pointer', fontFamily: 'inherit' }}>{p.name}</button>
          <span style={{ fontSize: 13, color: GR }}>{p.supplierName || 'Duka'} · inatoka {p.fromCity || 'Dar es Salaam'} · dukani {tzs(p.publicPrice)} · zimebaki {p.stock}</span>
          {/* The shop's record of paying resellers (owner 2026-11-10). */}
          <span data-testid={`catalogue-record-${p.id}`} style={{ fontSize: 13, color: p.shopRecord?.late ? '#b91c1c' : GR }}>
            {p.shopRecord?.paid
              ? `Limewalipa wauzaji mara ${p.shopRecord.paid}, kwa wakati ${p.shopRecord.onTime}${p.shopRecord.late ? ` · ${p.shopRecord.late} limechelewa` : ''}`
              : p.shopRecord?.late ? `Malipo ${p.shopRecord.late} kwa wauzaji yamechelewa` : 'Duka jipya kwenye Uza tena'}
          </span>
          <span style={{ fontSize: 14, color: DK }}>Unalipa duka <b>{tzs(p.supplierPrice)}</b></span>
          <span style={{ fontSize: 14, color: GREEN, fontWeight: 700 }}>Faida {tzs(p.profitAtShopPrice)} kwa bei ya duka, zaidi ukiongeza</span>
        </div>
      </div>
      {!open && !offer && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" data-testid={`catalogue-resell-${p.id}`} onClick={() => setOpen(true)} style={btn(B)}>Uza tena</button>
          <button type="button" onClick={() => onNavigate(`ProductDetail-${p.id}`)} style={btn(WH, DK)}>Ona bidhaa</button>
        </div>
      )}
      {open && !offer && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: GR }}>Bei yako ya kuuza</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ''))} aria-label={`Bei yako ya kuuza ${p.name}`}
              data-testid={`catalogue-price-${p.id}`}
              style={{ flex: 1, minWidth: 0, height: 40, padding: '0 10px', borderRadius: 10, border: '1px solid #cfd9de', fontSize: 16, fontFamily: 'inherit' }} />
            <button type="button" onClick={save} disabled={busy} data-testid={`catalogue-save-${p.id}`} style={btn(DK)}>{busy ? 'Inahifadhi...' : 'Hifadhi'}</button>
          </div>
          {profit >= 0 && <span style={{ fontSize: 14, color: GREEN, fontWeight: 700 }}>Faida yako: {tzs(profit)} kwa kila moja</span>}
          {err && <span role="alert" style={{ fontSize: 14, color: '#b91c1c', fontWeight: 600 }}>{err}</span>}
        </div>
      )}
      {offer && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, color: GREEN, fontWeight: 700 }}>Tayari kwa {tzs(offer.price)}. Iko kwenye wasifu wako (Anauza).</span>
          <button type="button" onClick={share} data-testid={`catalogue-share-${p.id}`} style={btn(B)}>Shiriki kiungo</button>
          <button type="button" data-testid={`catalogue-status-${p.id}`} style={btn('#16a34a')}
            onClick={async () => {
              const r = await shareToStatus({ product: p, offer, resellerName });
              if (STATUS_DONE[r]) setOffer({ ...offer, copied: STATUS_DONE[r] });
            }}>Weka Status</button>
          {offer.copied === true && <span style={{ fontSize: 13, color: GR }}>Kiungo kimenakiliwa.</span>}
          {typeof offer.copied === 'string' && <span style={{ fontSize: 13, color: GR, overflowWrap: 'anywhere' }}>{offer.copied}</span>}
        </div>
      )}
    </li>
  );
}

export default function ResaleCatalogue({ onNavigate, supplierId = null, onSaved, resellerName = null }) {
  const [text, setText] = useState('');
  const [filters, setFilters] = useState({ q: '', category: '', sort: 'new', city: '' });
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [labels, setLabels] = useState({});

  useEffect(() => {
    api.get('/categories').then((r) => {
      const m = {};
      (r?.data || []).forEach((c) => { if (c?.key) m[c.key] = c.label || c.name || pretty(c.key); });
      setLabels(m);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    const params = { page, sort: filters.sort, ...(filters.q ? { q: filters.q } : {}), ...(filters.category ? { category: filters.category } : {}),
      ...(filters.city ? { city: filters.city } : {}),
      ...(supplierId ? { supplierId } : {}) };
    api.get('/resale/products', { params }).then((r) => {
      if (!alive) return;
      const d = r?.data || {};
      setData((prev) => ({
        items: page > 1 && prev ? [...prev.items, ...(d.items || [])] : (d.items || []),
        categories: d.categories || prev?.categories || [],
        cities: d.cities || prev?.cities || [],
        hasMore: !!d.hasMore,
      }));
    }).catch(() => { if (alive) setData((prev) => prev || { items: [], categories: [], hasMore: false }); });
    return () => { alive = false; };
  }, [filters, page, supplierId]);

  const apply = (next) => { setPage(1); setData(null); setFilters((f) => ({ ...f, ...next })); };

  return (
    <div data-testid="resale-open-products">
      <form onSubmit={(e) => { e.preventDefault(); apply({ q: text.trim() }); }} style={{ display: 'flex', gap: 8, padding: '12px 16px 4px' }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Tafuta bidhaa ya kuuza" aria-label="Tafuta bidhaa ya kuuza" data-testid="catalogue-search"
          style={{ flex: 1, minWidth: 0, height: 40, padding: '0 14px', borderRadius: 20, border: '1px solid #cfd9de', fontSize: 15, fontFamily: 'inherit' }} />
        <button type="submit" style={btn(DK)}>Tafuta</button>
      </form>
      <div role="tablist" aria-label="Aina" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '8px 16px', scrollbarWidth: 'none' }}>
        <button type="button" role="tab" aria-selected={!filters.category} onClick={() => apply({ category: '' })} style={pill(!filters.category)}>Zote</button>
        {(data?.categories || []).map((c) => (
          <button type="button" role="tab" key={c.key} aria-selected={filters.category === c.key} data-testid={`catalogue-cat-${c.key}`}
            onClick={() => apply({ category: c.key })} style={pill(filters.category === c.key)}>
            {labels[c.key] || pretty(c.key)} ({c.count})
          </button>
        ))}
      </div>
      {(data?.cities || []).length > 1 && (
        <div role="tablist" aria-label="Mahali" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 16px 8px', scrollbarWidth: 'none', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: GR, flexShrink: 0 }}>Inatoka:</span>
          <button type="button" role="tab" aria-selected={!filters.city} onClick={() => apply({ city: '' })} style={pill(!filters.city)}>Kote</button>
          {data.cities.map((c) => (
            <button type="button" role="tab" key={c.key} aria-selected={filters.city === c.key} data-testid={`catalogue-city-${c.key}`}
              onClick={() => apply({ city: c.key })} style={pill(filters.city === c.key)}>{c.key} ({c.count})</button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, padding: '0 16px 8px', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: GR }}>Panga:</span>
        <button type="button" onClick={() => apply({ sort: 'new' })} aria-pressed={filters.sort === 'new'} style={pill(filters.sort === 'new')}>Mpya</button>
        <button type="button" onClick={() => apply({ sort: 'profit' })} aria-pressed={filters.sort === 'profit'} data-testid="catalogue-sort-profit" style={pill(filters.sort === 'profit')}>Faida kubwa</button>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: `1px solid ${LINE}` }}>
        {data === null && <li style={{ padding: 16, color: GR }}>Inapakia...</li>}
        {data?.items.length === 0 && (
          <li style={{ padding: 16, color: GR, fontSize: 15 }}>
            {filters.q || filters.category ? 'Hakuna bidhaa inayolingana. Jaribu neno jingine.' : 'Bado hakuna duka lililofungua bidhaa kwa wauzaji.'}
          </li>
        )}
        {(data?.items || []).map((p) => <Row key={p.id} p={p} onNavigate={onNavigate} onSaved={onSaved} resellerName={resellerName} />)}
      </ul>
      {data?.hasMore && (
        <button type="button" onClick={() => setPage((n) => n + 1)} style={{ ...btn(WH, DK), display: 'block', margin: '12px auto' }}>Onyesha zaidi</button>
      )}
    </div>
  );
}
