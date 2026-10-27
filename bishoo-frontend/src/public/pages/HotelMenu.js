/**
 * HotelMenu.js — a hotel's menu and the customer's order (approved mockup "KenteXa Hoteli",
 * boards 1 and 2, owner 2026-10-27).
 *
 * Opened from the hotel's page, or from a QR code on a table or room (/menu/:businessId?meza=4),
 * which fills in the table. Anyone can look; ordering needs an account. Prices shown are the
 * hotel's menu; the server prices the order again from the menu. The customer pays the hotel
 * directly (Lipa Namba, after eating, or on pickup when the hotel allows it).
 */
import React, { useEffect, useMemo, useState } from 'react';
import api from '../../api/api';
import BackBar from '../components/BackBar';
import { PageLoading } from '../components/Loading';
import { LineIcon } from '../components/LineIcon';
import { tzs, foodPaymentOptions, PAY_LABEL, MODE_LABEL, FOOD_COLORS as C } from '../../utils/food';

const cartKey = (id) => `kentexa_food_cart_${id}`;
const readCart = (id) => { try { return JSON.parse(sessionStorage.getItem(cartKey(id)) || '{}') || {}; } catch { return {}; } };
const saveCart = (id, cart) => { try { sessionStorage.setItem(cartKey(id), JSON.stringify(cart)); } catch { /* private mode */ } };

const pill = (on) => ({
  minHeight: 56, borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', color: C.ink, display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: 2, padding: 6,
  border: on ? `2px solid ${C.blue}` : `1px solid ${C.border}`, background: on ? C.blueSoft : '#fff',
});
const TINTS = ['#fef3c7', '#ecfccb', '#ffedd5', '#fee2e2', '#e0f2fe', '#ede9fe'];

const Verified = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" role="img" aria-label="Imethibitishwa"><circle cx="12" cy="12" r="10" fill={C.blue} /><path d="M8 12.5l2.5 2.5L16 9.5" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" /></svg>
);

export default function HotelMenu({ businessId, placeType: qrType, placeNumber: qrNumber, onNavigate, isLoggedIn }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState(qrType ? 'dine_in' : null);
  const [placeType, setPlaceType] = useState(qrType || 'table');
  const [placeNumber, setPlaceNumber] = useState(qrNumber ? String(qrNumber) : '');
  const [cart, setCart] = useState(() => readCart(businessId));
  const [step, setStep] = useState('menu'); // 'menu' | 'order'
  const [note, setNote] = useState('');
  const [payment, setPayment] = useState(null);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api.get(`/food/menu/${businessId}`)
      .then((res) => {
        if (!alive) return;
        setData(res.data);
        const s = res.data?.settings || {};
        setMode((m) => m || (s.dineIn ? 'dine_in' : s.pickup ? 'pickup' : null));
      })
      .catch((err) => alive && setLoadError(err?.response?.data?.message || 'Menyu haikupatikana. Jaribu tena.'));
    return () => { alive = false; };
  }, [businessId]);

  useEffect(() => { saveCart(businessId, cart); }, [businessId, cart]);

  const items = useMemo(() => (data?.sections || []).flatMap((s) => s.items), [data]);
  const lines = items.filter((i) => cart[i.id] > 0 && i.availableToday).map((i) => ({ ...i, qty: cart[i.id] }));
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const total = lines.reduce((n, l) => n + l.qty * l.price, 0);
  const settings = data?.settings || {};
  const payOptions = mode ? foodPaymentOptions(settings, mode) : [];
  const chosenPay = payOptions.includes(payment) ? payment : payOptions[0] || null;

  const setQty = (id, q) => setCart((c) => {
    const next = { ...c };
    if (q > 0) next[id] = Math.min(q, 50); else delete next[id];
    return next;
  });

  if (loadError) return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <BackBar onBack={() => onNavigate('back')} title="Menyu" top={0} />
      <div role="alert" style={{ padding: '48px 24px', textAlign: 'center', color: C.muted, fontSize: 15, lineHeight: 1.5 }}>{loadError}</div>
    </div>
  );
  if (!data) return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <BackBar onBack={() => onNavigate('back')} title="Menyu" top={0} />
      <PageLoading label="Inapakia menyu" />
    </div>
  );

  const { hotel } = data;
  const openProfile = () => hotel.ownerId && onNavigate(`CommerceProfile-${hotel.ownerId}`, hotel.commerceProfileId ? { commerceProfileId: hotel.commerceProfileId } : undefined);
  const message = () => (isLoggedIn
    ? onNavigate(`MessageSeller-${hotel.ownerId}`, hotel.commerceProfileId ? { commerceProfileId: hotel.commerceProfileId } : undefined)
    : onNavigate('PublicLogin'));

  const place = async () => {
    setError('');
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    if (!mode) { setError('Chagua kula hapa au kuchukua.'); return; }
    if (mode === 'dine_in' && !(Number(placeNumber) > 0)) { setError('Andika namba ya meza au chumba.'); return; }
    if (!chosenPay) { setError('Hoteli hii haina njia ya kulipa kwa huduma hii. Wasiliana nao.'); return; }
    setPlacing(true);
    try {
      const res = await api.post('/food/orders', {
        businessId: hotel.businessId, mode, paymentMethod: chosenPay, note: note.trim() || undefined,
        placeType: mode === 'dine_in' ? placeType : undefined, placeNumber: mode === 'dine_in' ? Number(placeNumber) : undefined,
        items: lines.map((l) => ({ itemId: l.id, qty: l.qty })),
      });
      setCart({});
      onNavigate(`FoodOrder-${res.data.id}`);
    } catch (err) {
      const m = err?.response?.data?.message;
      setError(Array.isArray(m) ? m.join(', ') : m || 'Oda haikutumwa. Jaribu tena.');
    } finally { setPlacing(false); }
  };

  // ── Board 2: my order ──────────────────────────────────────────────────
  if (step === 'order') {
    return (
      <div style={{ minHeight: '100vh', background: '#fff', color: C.ink }}>
        <BackBar onBack={() => setStep('menu')} title="Oda yangu" top={0} />
        <div style={{ maxWidth: 560, margin: '0 auto', paddingBottom: 24 }}>
          <div style={{ padding: '4px 16px 0', fontSize: 14, color: C.muted }}>{hotel.name}</div>
          <section data-testid="food-lines" style={{ padding: '8px 16px 4px' }}>
            {lines.length === 0 && <div style={{ padding: '24px 0', color: C.muted, fontSize: 15 }}>Bado hujachagua chakula.</div>}
            {lines.map((l) => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `1px solid ${C.line}` }}>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <strong style={{ fontSize: 15 }}>{l.name}</strong>
                  <span style={{ fontSize: 14, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>{tzs(l.price * l.qty)}</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', border: `1px solid ${C.border}`, borderRadius: 22, height: 44 }}>
                  <button type="button" aria-label={`Punguza ${l.name}`} onClick={() => setQty(l.id, l.qty - 1)}
                    style={{ width: 44, height: 44, border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: C.ink }}>−</button>
                  <strong style={{ minWidth: 20, textAlign: 'center', fontSize: 15 }}>{l.qty}</strong>
                  <button type="button" aria-label={`Ongeza ${l.name}`} onClick={() => setQty(l.id, l.qty + 1)}
                    style={{ width: 44, height: 44, border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: C.ink }}>+</button>
                </span>
              </div>
            ))}
          </section>

          <label style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.muted }}>Maelekezo kwa jikoni (si lazima)</span>
            <textarea rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="mf. Chipsi bila pilipili"
              style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 14px', fontSize: 16, fontFamily: 'inherit', resize: 'none', color: C.ink }} />
          </label>

          <section style={{ padding: '18px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>Chakula kitakuja wapi</span>
            {mode === 'dine_in' ? (
              <div style={{ padding: 14, borderRadius: 16, border: `2px solid ${C.blue}`, background: C.blueSoft, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <strong style={{ fontSize: 16 }}>Kula hapa</strong>
                <div style={{ display: 'flex', gap: 8 }}>
                  {settings.roomCount > 0 && (
                    <select aria-label="Meza au chumba" value={placeType} onChange={(e) => setPlaceType(e.target.value)}
                      style={{ height: 48, borderRadius: 12, border: `1px solid ${C.border}`, padding: '0 10px', fontSize: 16, fontFamily: 'inherit', background: '#fff' }}>
                      <option value="table">Meza</option>
                      <option value="room">Chumba</option>
                    </select>
                  )}
                  <input data-testid="food-place-number" type="number" inputMode="numeric" min="1" value={placeNumber} onChange={(e) => setPlaceNumber(e.target.value)}
                    aria-label={placeType === 'room' ? 'Namba ya chumba' : 'Namba ya meza'} placeholder={placeType === 'room' ? 'Namba ya chumba' : 'Namba ya meza'}
                    style={{ flex: 1, minWidth: 0, height: 48, borderRadius: 12, border: `1px solid ${C.border}`, padding: '0 14px', fontSize: 16, fontFamily: 'inherit' }} />
                </div>
                {qrType && <span style={{ fontSize: 13, color: C.muted }}>Namba imetoka kwenye QR uliyopiga picha.</span>}
              </div>
            ) : (
              <div style={{ padding: 14, borderRadius: 16, border: `2px solid ${C.blue}`, background: C.blueSoft, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <strong style={{ fontSize: 16 }}>Chukua</strong>
                <span style={{ fontSize: 14, color: C.muted }}>Utapita hotelini kuchukua. Tutakujulisha kikiwa tayari.</span>
              </div>
            )}
          </section>

          <section style={{ padding: '18px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>Utalipaje</span>
            {payOptions.length === 0 && (
              <div style={{ fontSize: 14, color: C.red }}>Hoteli hii bado haijaweka njia ya kulipa kwa huduma hii.</div>
            )}
            <div role="radiogroup" aria-label="Utalipaje" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {payOptions.map((p) => {
                const on = chosenPay === p;
                return (
                  <button key={p} type="button" role="radio" aria-checked={on} data-testid={`food-pay-${p}`} onClick={() => setPayment(p)}
                    style={{ minHeight: 60, borderRadius: 14, padding: '10px 14px', display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer',
                      fontFamily: 'inherit', color: C.ink, textAlign: 'left',
                      border: on ? `2px solid ${C.blue}` : `1px solid ${C.border}`, background: on ? C.blueSoft : '#fff' }}>
                    <span style={{ width: 20, height: 20, borderRadius: 10, boxSizing: 'border-box', flexShrink: 0,
                      border: on ? `6px solid ${C.blue}` : '2px solid #8b98a5', background: '#fff' }} />
                    <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <strong style={{ fontSize: 15 }}>{PAY_LABEL[p].label}</strong>
                      <span style={{ fontSize: 13, color: C.muted }}>{PAY_LABEL[p].hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {chosenPay === 'lipa_namba' && (
              <div style={{ padding: 16, borderRadius: 16, background: '#f7f9f9', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 13, color: C.muted }}>Lipa Namba ya {hotel.name}</span>
                <strong data-testid="food-lipa-namba" style={{ fontSize: 28, letterSpacing: 1, fontVariantNumeric: 'tabular-nums' }}>{settings.lipaNamba}</strong>
                {settings.lipaNambaName && <span style={{ fontSize: 14 }}>{settings.lipaNambaName}</span>}
                <span style={{ fontSize: 14, color: C.muted, lineHeight: 1.4 }}>Tuma oda, lipa kiasi kamili, kisha tuma picha ya ujumbe wa malipo. Hoteli itathibitisha.</span>
              </div>
            )}
          </section>

          <section style={{ margin: '20px 0 0', padding: 16, borderTop: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 15, color: C.muted }}>Jumla ya kulipa</span>
              <strong data-testid="food-total" style={{ fontSize: 30, fontVariantNumeric: 'tabular-nums' }}>{tzs(total)}</strong>
            </div>
            {error && <div role="alert" style={{ fontSize: 14, color: C.red }}>{error}</div>}
            <button type="button" data-testid="food-place-order" onClick={place} disabled={placing || lines.length === 0 || !settings.acceptingOrders}
              style={{ height: 56, borderRadius: 28, border: 'none', background: lines.length && settings.acceptingOrders ? C.blue : '#94a3b8', color: '#fff',
                fontSize: 17, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              {placing ? 'Inatuma' : isLoggedIn ? 'Tuma oda jikoni' : 'Ingia ili utume oda'}
            </button>
            <span style={{ fontSize: 13, color: C.muted, textAlign: 'center' }}>Unalipa hoteli moja kwa moja. KenteXa haishiki pesa yako.</span>
          </section>
        </div>
      </div>
    );
  }

  // ── Board 1: the menu ──────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: C.ink, paddingBottom: 96 }}>
      <BackBar onBack={() => onNavigate('back')} title="Menyu" top={0} />
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <section data-testid="hotel-identity" style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
          {hotel.logo
            ? <img src={hotel.logo} alt="" style={{ width: 60, height: 60, borderRadius: 30, objectFit: 'cover', flexShrink: 0 }} />
            : <span style={{ width: 60, height: 60, borderRadius: 30, background: '#7c2d12', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, fontWeight: 800, flexShrink: 0 }}>{String(hotel.name || 'H').trim().charAt(0).toUpperCase()}</span>}
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <strong style={{ fontSize: 18 }}>{hotel.name}</strong>
              {hotel.isVerified && <Verified />}
            </span>
            {hotel.area && <span style={{ fontSize: 14, color: C.muted }}>{hotel.area}</span>}
            <span style={{ fontSize: 14, fontWeight: 700, color: settings.acceptingOrders ? C.green : C.amber }}>
              {settings.acceptingOrders ? 'Inapokea oda' : 'Haipokei oda kwa sasa'}{settings.openingHours ? ` · ${settings.openingHours}` : ''}
            </span>
          </span>
        </section>
        <div style={{ padding: '0 16px 14px', display: 'flex', gap: 8 }}>
          <button type="button" onClick={openProfile}
            style={{ flex: 1, height: 40, borderRadius: 20, background: C.ink, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Ukurasa wa hoteli</button>
          <button type="button" onClick={message}
            style={{ flex: 1, height: 40, borderRadius: 20, border: `1px solid ${C.border}`, background: '#fff', color: C.ink, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Ujumbe</button>
          {hotel.phone && (
            <a href={`tel:${hotel.phone}`}
              style={{ flex: 1, height: 40, borderRadius: 20, border: `1px solid ${C.border}`, color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>Piga simu</a>
          )}
        </div>

        {qrType && qrNumber && (
          <div data-testid="food-qr-place" style={{ margin: '0 16px 14px', padding: '12px 14px', borderRadius: 14, background: C.blueSoft, display: 'flex', gap: 10, alignItems: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2M18 14h2v2M14 18h2v2M18 18h2v2" /></svg>
            <span style={{ fontSize: 14, lineHeight: 1.4 }}>
              <strong>{qrType === 'room' ? 'Chumba' : 'Meza'} namba {qrNumber}.</strong> Oda itakuja {qrType === 'room' ? 'chumbani' : 'mezani'} kwako.
            </span>
          </div>
        )}

        {(settings.dineIn || settings.pickup) && (
          <div role="radiogroup" aria-label="Utapokeaje chakula" style={{ padding: '0 16px 14px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            {['dine_in', 'pickup'].filter((m) => (m === 'dine_in' ? settings.dineIn : settings.pickup)).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} data-testid={`food-mode-${m}`} onClick={() => setMode(m)} style={pill(mode === m)}>
                <strong style={{ fontSize: 14 }}>{MODE_LABEL[m].label}</strong>
                <span style={{ fontSize: 12, color: C.muted }}>{MODE_LABEL[m].hint}</span>
              </button>
            ))}
          </div>
        )}

        {data.sections.length > 1 && (
          <nav aria-label="Makundi ya menyu" style={{ display: 'flex', gap: 6, padding: '0 16px 10px', overflowX: 'auto', borderBottom: `1px solid ${C.line}` }}>
            {data.sections.map((s, i) => (
              <button key={s.name} type="button"
                onClick={() => { const el = document.getElementById(`food-sec-${i}`); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                style={{ height: 36, padding: '0 14px', borderRadius: 18, border: `1px solid ${C.border}`, background: '#fff', color: C.ink, fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>{s.name}</button>
            ))}
          </nav>
        )}

        {data.sections.length === 0 && (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: C.muted, fontSize: 15 }}>Hoteli bado haijaweka vyakula kwenye menyu.</div>
        )}

        {data.sections.map((s, si) => (
          <section key={s.name} id={`food-sec-${si}`}>
            <h2 style={{ margin: 0, padding: '16px 16px 4px', fontSize: 16, fontWeight: 800 }}>{s.name}</h2>
            {s.items.map((d, di) => {
              const q = cart[d.id] || 0;
              return (
                <div key={d.id} data-testid={`food-item-${d.id}`} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${C.line}`, alignItems: 'center', opacity: d.availableToday ? 1 : 0.55 }}>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <strong style={{ fontSize: 15 }}>{d.name}</strong>
                    {d.description && <span style={{ fontSize: 13, color: C.muted, lineHeight: 1.35 }}>{d.description}</span>}
                    <span style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{tzs(d.price)}</span>
                  </span>
                  <span style={{ position: 'relative', width: 84, height: 84, flexShrink: 0 }}>
                    {d.photoUrl
                      ? <img src={d.photoUrl} alt="" style={{ width: 84, height: 84, borderRadius: 14, objectFit: 'cover' }} />
                      : <span style={{ position: 'absolute', inset: 0, borderRadius: 14, background: TINTS[(si + di) % TINTS.length], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="13" r="7" /><circle cx="12" cy="13" r="3.5" /><path d="M3 4v6M5 4v6M4 10v10M20 4c-1.5 1-2 3-2 5h2v11" /></svg>
                        </span>}
                    {d.availableToday ? (
                      <button type="button" aria-label={`Ongeza ${d.name}`} data-testid={`food-add-${d.id}`} onClick={() => setQty(d.id, q + 1)} disabled={!settings.acceptingOrders}
                        style={{ position: 'absolute', right: -6, bottom: -6, minWidth: 36, height: 36, padding: '0 8px', borderRadius: 18, border: '2px solid #fff',
                          background: settings.acceptingOrders ? C.blue : '#94a3b8', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {q ? `+ ${q}` : '+'}
                      </button>
                    ) : (
                      <span style={{ position: 'absolute', left: 6, bottom: 6, padding: '2px 8px', borderRadius: 10, background: C.ink, color: '#fff', fontSize: 11, fontWeight: 700 }}>Imeisha leo</span>
                    )}
                  </span>
                </div>
              );
            })}
          </section>
        ))}
      </div>

      {count > 0 && (
        <button type="button" data-testid="food-cart-bar" onClick={() => setStep('order')}
          style={{ position: 'fixed', left: 16, right: 16, bottom: 20, maxWidth: 528, margin: '0 auto', height: 56, borderRadius: 28, background: C.blue, color: '#fff',
            display: 'flex', alignItems: 'center', padding: '0 20px', gap: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 6px 20px rgba(15,20,25,0.18)' }}>
          <span style={{ minWidth: 26, height: 26, borderRadius: 13, background: '#fff', color: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>{count}</span>
          <strong style={{ flex: 1, fontSize: 16, textAlign: 'left' }}>Angalia oda</strong>
          <strong style={{ fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>{tzs(total)}</strong>
          <LineIcon name="cart" size={18} color="#fff" />
        </button>
      )}
    </div>
  );
}
