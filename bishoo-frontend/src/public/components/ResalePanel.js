/**
 * "Uza tena" (resell), owner approved 2026-11-09, on a product page.
 *
 *  - The supplier (owner of the product) opens it for resellers: the price a reseller pays it
 *    and an optional lowest selling price (PATCH /products/:id).
 *  - Anyone else, signed in, taps "Uza tena", sets their own price on top and gets a link to
 *    share (POST /resale/offers). An order from that link goes to the supplier with the reseller
 *    on it; the supplier delivers, collects and pays the reseller's profit.
 * The supplier price is read from GET /resale/products/:id (signed in), never from the product.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import { productLink } from '../utils/shareLinks';

const B = '#1d4ed8';
const DK = '#0f1419';
const GR = '#536471';
const LINE = '#eff3f4';
const WH = '#ffffff';
const tzs = (n) => `TZS ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const box = { margin: 16, padding: 14, border: `1px solid ${LINE}`, borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 10 };
const input = { height: 44, padding: '0 12px', borderRadius: 10, border: '1px solid #cfd9de', fontSize: 16, fontFamily: 'inherit', color: DK, width: '100%', boxSizing: 'border-box' };
const btn = (bg, color = WH) => ({ height: 44, padding: '0 18px', borderRadius: 22, border: bg === WH ? '1px solid #cfd9de' : 'none', backgroundColor: bg, color,
  fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' });
const label = { fontSize: 13, fontWeight: 700, color: GR };
const num = (v) => (v === '' || v == null ? null : Number(String(v).replace(/[^0-9.]/g, '')));

/** The link a reseller shares: the product page with their offer on it. */
export const resaleLink = (product, offerId) => `${productLink(product.id, product.name)}?offer=${offerId}`;

export default function ResalePanel({ product, isOwner, isLoggedIn, onNavigate }) {
  const [terms, setTerms] = useState(null);
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [allow, setAllow] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(null);

  const pid = product?.id;
  const pOpen = !!product?.resaleOpen;
  const showForReseller = !isOwner && pOpen;
  useEffect(() => {
    if (!isLoggedIn || !pid || (!isOwner && !pOpen)) return undefined;
    let alive = true;
    api.get(`/resale/products/${pid}`).then((r) => {
      if (!alive) return;
      const t = r?.data || null;
      setTerms(t);
      if (t?.own) {
        setAllow(!!t.open);
        setPrice(t.supplierPrice != null ? String(t.supplierPrice) : '');
        setMinPrice(t.minPrice != null ? String(t.minPrice) : '');
      } else if (t?.offer) {
        setPrice(String(t.offer.price));
        setNote(t.offer.note || '');
        if (t.offer.isActive) setSaved(t.offer);
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, [isLoggedIn, isOwner, pid, pOpen]);

  if (!product) return null;
  if (!isOwner && !product.resaleOpen) return null;

  // ── The supplier: open the product for resellers ─────────────────────────
  if (isOwner) {
    if (!terms?.own) return null;
    const pub = Number(terms.publicPrice) || 0;
    const sup = num(price);
    const saveTerms = async () => {
      setErr(''); setMsg('');
      if (allow && !(sup > 0)) { setErr('Weka bei ya wauzaji kwanza.'); return; }
      try {
        setBusy(true);
        await api.patch(`/products/${product.id}`, { resaleOpen: allow, resalePrice: sup, resaleMinPrice: num(minPrice) });
        setMsg(allow ? 'Imefunguliwa. Wauzaji wanaweza kuiuza sasa.' : 'Imefungwa kwa wauzaji.');
      } catch (e) {
        setErr(e?.response?.data?.message || 'Imeshindikana kuhifadhi.');
      } finally { setBusy(false); }
    };
    return (
      <section data-testid="resale-owner" style={box}>
        <div style={{ fontSize: 16, fontWeight: 800, color: DK }}>Wauzaji wengine (Uza tena)</div>
        <div style={{ fontSize: 14, color: GR, lineHeight: 1.45 }}>
          Ruhusu watu wengine waiuze bidhaa hii kwa bei yao. Oda inakuja kwako; unafikisha, unapokea malipo, kisha unamlipa muuzaji faida yake.
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 600, color: DK }}>
          <input type="checkbox" checked={allow} onChange={(e) => setAllow(e.target.checked)} data-testid="resale-allow" style={{ width: 20, height: 20 }} />
          Ruhusu wauzaji kuiuza
        </label>
        <div>
          <div style={label}>Bei ya wauzaji (wanayokulipa wewe)</div>
          <input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={pub ? `Chini ya ${tzs(pub)}` : 'Mfano 42000'}
            aria-label="Bei ya wauzaji" data-testid="resale-supplier-price" style={input} />
        </div>
        <div>
          <div style={label}>Bei ya chini ya kuuza (si lazima)</div>
          <input inputMode="numeric" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="Wasiuze chini ya hii"
            aria-label="Bei ya chini ya kuuza" style={input} />
        </div>
        {sup > 0 && pub > sup && (
          <div style={{ fontSize: 14, color: GR }}>Muuzaji akiuza kwa bei yako ya duka ({tzs(pub)}) anapata {tzs(pub - sup)} kwa kila moja; anaweza kuongeza juu.</div>
        )}
        {err && <div role="alert" style={{ fontSize: 14, color: '#b91c1c', fontWeight: 600 }}>{err}</div>}
        {msg && <div role="status" style={{ fontSize: 14, color: '#166534', fontWeight: 600 }}>{msg}</div>}
        <button type="button" onClick={saveTerms} disabled={busy} data-testid="resale-save-terms" style={btn(DK)}>{busy ? 'Inahifadhi...' : 'Hifadhi'}</button>
      </section>
    );
  }

  // ── Anyone else: "Uza tena" ───────────────────────────────────────────────
  if (!showForReseller) return null;
  if (!isLoggedIn) {
    return (
      <section style={box}>
        <div style={{ fontSize: 15, fontWeight: 800, color: DK }}>Uza bidhaa hii upate faida</div>
        <div style={{ fontSize: 14, color: GR }}>Weka bei yako, shiriki kiungo. Duka linafikisha na linakulipa faida yako.</div>
        <button type="button" onClick={() => onNavigate('PublicLogin')} style={btn(DK)}>Ingia ili uuze tena</button>
      </section>
    );
  }
  const sup = Number(terms?.supplierPrice) || 0;
  const floor = Number(terms?.floor) || 0;
  const mine = num(price);
  const profit = mine && sup ? mine - sup : null;
  const link = saved ? resaleLink(product, saved.id) : '';
  const shareLink = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: product.name, text: `${product.name}: ${tzs(saved.price)}`, url: link }); return; }
    } catch { return; }
    try { await navigator.clipboard?.writeText(link); setMsg('Kiungo kimenakiliwa.'); } catch { setMsg(link); }
  };
  const saveOffer = async () => {
    setErr(''); setMsg('');
    if (!(mine > 0)) { setErr('Weka bei yako ya kuuza.'); return; }
    if (floor && mine < floor) { setErr(`Bei yako isiwe chini ya ${tzs(floor)}.`); return; }
    try {
      setBusy(true);
      const r = await api.post('/resale/offers', { productId: product.id, price: mine, note: note.trim() || undefined });
      setSaved(r.data);
      setMsg('Tayari. Shiriki kiungo chako.');
    } catch (e) {
      setErr(e?.response?.data?.message || 'Imeshindikana kuhifadhi.');
    } finally { setBusy(false); }
  };

  return (
    <section data-testid="resale-reseller" style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: DK }}>Uza tena upate faida</div>
        {!open && !saved && <button type="button" onClick={() => setOpen(true)} data-testid="resale-open" style={btn(B)}>Uza tena</button>}
      </div>
      {!open && !saved && terms?.open && Number(terms.publicPrice) > sup && (
        <div data-testid="resale-hint-profit" style={{ fontSize: 15, fontWeight: 700, color: '#166534' }}>
          Unaweza kuuza hii: faida {tzs(Number(terms.publicPrice) - sup)} kwa bei ya duka, zaidi ukiongeza
        </div>
      )}
      {!open && !saved && <div style={{ fontSize: 14, color: GR }}>Huhitaji duka wala mzigo. Weka bei yako juu ya bei ya duka; duka linafikisha na linakulipa faida.</div>}
      {!open && !saved && (
        <button type="button" onClick={() => onNavigate('MyResales', { tab: 'open' })}
          style={{ padding: 0, border: 'none', background: 'none', color: B, fontSize: 14, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start', fontFamily: 'inherit' }}>
          Bidhaa zote za kuuza tena
        </button>
      )}
      {(open || saved) && terms?.open && (
        <>
          <div style={{ fontSize: 14, color: DK }}>Unalipa duka: <b>{tzs(sup)}</b> kwa kila moja{terms.minPrice ? ` · usiuze chini ya ${tzs(terms.minPrice)}` : ''}</div>
          <div>
            <div style={label}>Bei yako ya kuuza</div>
            <input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={`Kuanzia ${tzs(floor)}`}
              aria-label="Bei yako ya kuuza" data-testid="resale-my-price" style={input} />
          </div>
          {profit != null && profit >= 0 && <div data-testid="resale-profit" style={{ fontSize: 15, fontWeight: 700, color: '#166534' }}>Faida yako: {tzs(profit)} kwa kila moja</div>}
          <div>
            <div style={label}>Maelezo yako (si lazima)</div>
            <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Mfano: Napeleka bure Kinondoni" aria-label="Maelezo yako" style={input} />
          </div>
          {err && <div role="alert" style={{ fontSize: 14, color: '#b91c1c', fontWeight: 600 }}>{err}</div>}
          {msg && <div role="status" style={{ fontSize: 14, color: '#166534', fontWeight: 600, overflowWrap: 'anywhere' }}>{msg}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={saveOffer} disabled={busy} data-testid="resale-save" style={{ ...btn(DK), flex: 1 }}>
              {busy ? 'Inahifadhi...' : saved ? 'Badilisha bei' : 'Hifadhi na pata kiungo'}
            </button>
            {saved && <button type="button" onClick={shareLink} data-testid="resale-share" style={{ ...btn(B), flex: 1 }}>Shiriki kiungo</button>}
          </div>
          {saved && <button type="button" onClick={() => onNavigate('MyResales')} style={{ padding: 0, border: 'none', background: 'none', color: B, fontSize: 14, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start', fontFamily: 'inherit' }}>Ofa zangu zote</button>}
        </>
      )}
    </section>
  );
}
