/**
 * HotelMenuManager.js — "Menyu yangu" for a hotel (approved mockup "KenteXa Hoteli", board 5,
 * owner 2026-10-27; "some hotel allow COD").
 *
 *  - dishes and drinks by group, each with a "kipo leo" switch (off = the customer sees
 *    "Imeisha leo", it is not hidden), edit and remove;
 *  - how the hotel serves: eat here, pick up; which ways it takes payment: after eating,
 *    cash on pickup (COD); its Lipa Namba; opening hours;
 *  - QR codes for its tables and rooms: printed and put on each table, they open the menu
 *    with that table's number;
 *  - delivery ("Letewa"): where the wakala collects (a place from the search) and on/off.
 *    The fee is KenteXa's; the customer pays the wakala on delivery.
 */
import React, { useEffect, useMemo, useState } from 'react';
import api from '../../api/api';
import BackBar from '../components/BackBar';
import { PageLoading, Spinner } from '../components/Loading';
import { tzs, menuLink, FOOD_COLORS as C } from '../../utils/food';
import { hotelBusinessId, NoHotel } from './HotelKitchen';
import PlaceSearchField from '../components/PlaceSearchField';

const EMPTY = { id: null, name: '', section: '', price: '', description: '', photoUrl: '' };
const input = { height: 48, border: `1px solid ${C.border}`, borderRadius: 14, padding: '0 14px', fontSize: 16, fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' };
const label = { display: 'flex', flexDirection: 'column', gap: 6 };
const labelText = { fontSize: 14, fontWeight: 600, color: C.muted };
const msg = (err, fallback) => { const m = err?.response?.data?.message; return Array.isArray(m) ? m.join(', ') : m || fallback; };

function Switch({ on, onChange, label: aria, testId, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={aria} data-testid={testId} onClick={onChange} disabled={disabled}
      style={{ width: 52, height: 32, borderRadius: 16, border: 'none', padding: 3, cursor: 'pointer', display: 'flex', flexShrink: 0,
        justifyContent: on ? 'flex-end' : 'flex-start', background: on ? C.green : C.border }}>
      <span style={{ width: 26, height: 26, borderRadius: 13, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
    </button>
  );
}

function ItemForm({ item, sections, onSave, onCancel, onRemove, busy }) {
  const [f, setF] = useState(item);
  const [uploading, setUploading] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('files', file);
      const res = await api.post('/upload/images', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = res.data?.urls?.[0] || res.data?.url;
      if (url) setF((x) => ({ ...x, photoUrl: url }));
    } catch { /* the form shows no photo; the hotel can try again */ } finally { setUploading(false); }
  };
  return (
    <section data-testid="food-item-form" style={{ margin: 16, padding: 16, borderRadius: 16, border: `2px solid ${C.blue}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <strong style={{ fontSize: 16 }}>{f.id ? 'Badilisha chakula' : 'Chakula kipya'}</strong>
      <label style={label}><span style={labelText}>Jina</span>
        <input style={input} value={f.name} onChange={set('name')} maxLength={80} placeholder="mf. Pilau ya nyama" /></label>
      <label style={label}><span style={labelText}>Kundi</span>
        <input style={input} value={f.section} onChange={set('section')} maxLength={40} list="food-sections" placeholder="mf. Mchana" />
        <datalist id="food-sections">{sections.map((s) => <option key={s} value={s} />)}</datalist></label>
      <label style={label}><span style={labelText}>Bei (TZS)</span>
        <input style={input} type="number" inputMode="numeric" min="1" value={f.price} onChange={set('price')} placeholder="7000" /></label>
      <label style={label}><span style={labelText}>Maelezo mafupi (si lazima)</span>
        <input style={input} value={f.description || ''} onChange={set('description')} maxLength={200} placeholder="mf. Na kachumbari na ndizi" /></label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {f.photoUrl && <img src={f.photoUrl} alt="" style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover' }} />}
        <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 16px', borderRadius: 22,
          border: `1px solid ${C.border}`, cursor: 'pointer', fontWeight: 700, fontSize: 14, color: C.ink }}>
          {uploading ? <Spinner size={16} color={C.ink} /> : null}
          {f.photoUrl ? 'Badilisha picha' : 'Weka picha'}
          <input type="file" accept="image/*" onChange={upload} disabled={uploading} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {f.id && (
          <button type="button" onClick={() => onRemove(f.id)} disabled={busy}
            style={{ height: 48, padding: '0 16px', borderRadius: 24, border: `1px solid ${C.border}`, background: '#fff', color: C.red, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Ondoa</button>
        )}
        <button type="button" onClick={onCancel}
          style={{ height: 48, padding: '0 16px', borderRadius: 24, border: `1px solid ${C.border}`, background: '#fff', color: C.ink, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Acha</button>
        <button type="button" data-testid="food-item-save" onClick={() => onSave(f)} disabled={busy || uploading}
          style={{ flex: 1, height: 48, borderRadius: 24, border: 'none', background: C.blue, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Hifadhi</button>
      </div>
    </section>
  );
}

function QrSheet({ businessId, tables, rooms, name, onClose }) {
  const codes = [
    ...Array.from({ length: tables }, (_, i) => ({ key: `t${i + 1}`, title: `Meza ${i + 1}`, url: menuLink(businessId, 'table', i + 1) })),
    ...Array.from({ length: rooms }, (_, i) => ({ key: `r${i + 1}`, title: `Chumba ${i + 1}`, url: menuLink(businessId, 'room', i + 1) })),
  ];
  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: C.ink }}>
      <BackBar onBack={onClose} title="QR za meza na vyumba" top={0}
        right={<button type="button" onClick={() => window.print()} style={{ height: 36, padding: '0 14px', borderRadius: 18, border: 'none', background: C.blue, color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Chapisha</button>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, padding: 16 }}>
        {codes.map((c) => (
          <div key={c.key} style={{ border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, breakInside: 'avoid' }}>
            <strong style={{ fontSize: 13 }}>{name}</strong>
            <img alt={`QR ${c.title}`} width="150" height="150"
              src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(c.url)}&color=0F172A&bgcolor=FFFFFF`} />
            <strong style={{ fontSize: 20 }}>{c.title}</strong>
            <span style={{ fontSize: 12, color: C.muted, textAlign: 'center' }}>Piga picha uagize chakula</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HotelMenuManager({ businessId: routeBusinessId, activeContext, onNavigate, isLoggedIn }) {
  const businessId = hotelBusinessId(routeBusinessId, activeContext);
  const [info, setInfo] = useState(null);
  const [items, setItems] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(null); // settings being edited
  const [showQr, setShowQr] = useState(false);
  const [pickupArea, setPickupArea] = useState(null);

  const loadAll = async () => {
    try {
      const [s, i] = await Promise.all([api.get(`/food/hotel/${businessId}/settings`), api.get(`/food/hotel/${businessId}/items`)]);
      setInfo(s.data); setItems(i.data || []); setLoadError('');
      const st = s.data?.settings;
      setForm({
        dineIn: st ? !!st.dineIn : true, pickup: st ? !!st.pickup : true, payAfterDineIn: st ? !!st.payAfterDineIn : true,
        codPickup: st ? !!st.codPickup : false, tableCount: String(st?.tableCount ?? 0), roomCount: String(st?.roomCount ?? 0),
        openingHours: st?.openingHours || '', lipaNamba: st?.lipaNamba || '', lipaNambaName: st?.lipaNambaName || '',
        enabled: st ? !!st.enabled : true, delivery: !!st?.delivery,
      });
      if (!(i.data || []).length) setEditing({ ...EMPTY });
    } catch (err) { setLoadError(msg(err, 'Imeshindikana kupakia menyu.')); }
  };

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    if (businessId) loadAll();
  }, [businessId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sections = useMemo(() => [...new Set((items || []).map((i) => i.section))], [items]);

  if (!businessId) return <NoHotel onNavigate={onNavigate} title="Menyu yangu" />;
  if (loadError) return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <BackBar onBack={() => onNavigate('back')} title="Menyu yangu" top={0} />
      <div role="alert" style={{ padding: '48px 24px', textAlign: 'center', color: C.muted, fontSize: 15 }}>{loadError}</div>
    </div>
  );
  if (!info || !items || !form) return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <BackBar onBack={() => onNavigate('back')} title="Menyu yangu" top={0} />
      <PageLoading label="Inapakia menyu" />
    </div>
  );
  if (showQr) return <QrSheet businessId={businessId} tables={Number(form.tableCount) || 0} rooms={Number(form.roomCount) || 0} name={info.hotel?.name} onClose={() => setShowQr(false)} />;

  const run = async (fn, okText) => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); if (okText) setNotice(okText); return true; } catch (err) { setError(msg(err, 'Imeshindikana. Jaribu tena.')); return false; } finally { setBusy(false); }
  };
  const saveItem = (f) => run(async () => {
    const body = { name: f.name, section: f.section, price: Number(f.price), description: f.description || null, photoUrl: f.photoUrl || null };
    const r = f.id ? await api.patch(`/food/hotel/${businessId}/items/${f.id}`, body) : await api.post(`/food/hotel/${businessId}/items`, body);
    setItems(r.data); setEditing(null);
    if (!info.settings) setInfo((x) => ({ ...x, settings: {} }));
  }, 'Imehifadhiwa');
  const removeItem = (id) => run(async () => { const r = await api.delete(`/food/hotel/${businessId}/items/${id}`); setItems(r.data); setEditing(null); }, 'Imeondolewa');
  const toggleToday = (it) => run(async () => {
    const r = await api.patch(`/food/hotel/${businessId}/items/${it.id}`, { availableToday: !it.availableToday });
    setItems(r.data);
  });
  const saveSettings = (patch) => run(async () => {
    const next = { ...form, ...patch };
    const r = await api.patch(`/food/hotel/${businessId}/settings`, {
      ...next, tableCount: Number(next.tableCount) || 0, roomCount: Number(next.roomCount) || 0,
    });
    setInfo(r.data); setForm(next);
  }, 'Imehifadhiwa');

  const shown = filter ? items.filter((i) => i.section === filter) : items;
  const chip = (on) => ({
    height: 36, padding: '0 14px', borderRadius: 18, fontSize: 14, fontWeight: on ? 700 : 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
    border: on ? 'none' : `1px solid ${C.border}`, background: on ? C.ink : '#fff', color: on ? '#fff' : C.ink,
  });
  const row = (title, hint, key) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 15 }}>
      <span style={{ display: 'flex', flexDirection: 'column' }}><span>{title}</span>{hint && <span style={{ fontSize: 12, color: C.muted }}>{hint}</span>}</span>
      <Switch on={!!form[key]} onChange={() => saveSettings({ [key]: !form[key] })} label={title} testId={`food-setting-${key}`} disabled={busy} />
    </div>
  );
  const publicUrl = menuLink(businessId);

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: C.ink, paddingBottom: 40 }}>
      <BackBar onBack={() => onNavigate('back')} title="Menyu yangu" top={0}
        right={(
          <button type="button" data-testid="food-add-item" onClick={() => setEditing({ ...EMPTY, section: filter || sections[0] || '' })}
            style={{ height: 40, padding: '0 16px', borderRadius: 20, border: 'none', background: C.blue, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            + Chakula
          </button>
        )} />
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <section style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 14, color: C.muted, lineHeight: 1.4 }}>Washa kilichopo leo. Kilichozimwa kinaonekana "Imeisha leo" kwa mteja, hakifichwi.</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => onNavigate('HotelKitchen', { businessId })}
              style={{ flex: 1, height: 44, borderRadius: 22, border: 'none', background: C.ink, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Oda za jikoni</button>
            <button type="button" onClick={() => onNavigate(`HotelMenu-${businessId}`)}
              style={{ flex: 1, height: 44, borderRadius: 22, border: `1px solid ${C.border}`, background: '#fff', color: C.ink, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Ona kama mteja</button>
          </div>
          {sections.length > 0 && (
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
              <button type="button" style={chip(!filter)} onClick={() => setFilter('')}>Vyote · {items.length}</button>
              {sections.map((s) => <button key={s} type="button" style={chip(filter === s)} onClick={() => setFilter(s)}>{s} · {items.filter((i) => i.section === s).length}</button>)}
            </div>
          )}
        </section>

        {notice && <div role="status" style={{ margin: '0 16px 12px', padding: '10px 14px', borderRadius: 12, background: '#ecfdf3', color: '#166534', fontSize: 14 }}>{notice}</div>}
        {error && <div role="alert" style={{ margin: '0 16px 12px', padding: '10px 14px', borderRadius: 12, background: '#fef2f2', color: C.red, fontSize: 14 }}>{error}</div>}

        {editing && <ItemForm key={editing.id || 'new'} item={editing} sections={sections} busy={busy} onSave={saveItem} onRemove={removeItem} onCancel={() => setEditing(null)} />}

        <div style={{ borderTop: `1px solid ${C.line}` }}>
          {shown.map((it) => (
            <div key={it.id} data-testid={`food-manage-${it.id}`} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${C.line}` }}>
              <button type="button" onClick={() => setEditing({ ...it, price: String(it.price) })} aria-label={`Badilisha ${it.name}`}
                style={{ flex: 1, minWidth: 0, display: 'flex', gap: 12, alignItems: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: C.ink }}>
                {it.photoUrl
                  ? <img src={it.photoUrl} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
                  : <span style={{ width: 56, height: 56, borderRadius: 12, background: '#f1f5f9', flexShrink: 0 }} />}
                <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <strong style={{ fontSize: 15 }}>{it.name}</strong>
                  <span style={{ fontSize: 14, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>{tzs(it.price)} · {it.section}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: it.availableToday ? C.green : '#b45309' }}>{it.availableToday ? 'Kipo leo' : 'Imeisha leo'}</span>
                </span>
              </button>
              <Switch on={it.availableToday} onChange={() => toggleToday(it)} label={`${it.name} kipo leo`} testId={`food-today-${it.id}`} disabled={busy} />
            </div>
          ))}
        </div>

        <section style={{ margin: '20px 16px 0', padding: 16, borderRadius: 16, border: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <strong style={{ fontSize: 16 }}>Jinsi tunavyohudumia</strong>
          {row('Wateja waagize kwenye KenteXa', 'Ukizima, menyu haionekani', 'enabled')}
          {row('Kula hapa', 'Meza au chumba', 'dineIn')}
          {row('Chukua mwenyewe', null, 'pickup')}
          {row('Lipa ukimaliza kula', 'Taslimu au Lipa Namba kwa mhudumu', 'payAfterDineIn')}
          {row('Ruhusu lipa ukipokea', 'Mteja analipa akichukua chakula', 'codPickup')}
        </section>

        {info.deliveryAvailable && (
          <section data-testid="food-delivery-settings" style={{ margin: '12px 16px 0', padding: 16, borderRadius: 16, border: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <strong style={{ fontSize: 16 }}>Kuletea wateja (Letewa)</strong>
            <span style={{ fontSize: 14, color: C.muted, lineHeight: 1.4 }}>
              Wakala wa karibu anachukua chakula hapa na kumletea mteja. Bei ya usafiri inawekwa na KenteXa; mteja anamlipa wakala chakula na usafiri akipokea.
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={labelText}>Wakala achukue chakula wapi</span>
              {info.settings?.pickupPlace?.label && <strong style={{ fontSize: 15 }}>{info.settings.pickupPlace.label}</strong>}
              <PlaceSearchField id="food-pickup-place" value={pickupArea} onChange={setPickupArea} placeholder="Mtaa wa hoteli, mfano Sinza" />
              <button type="button" data-testid="food-pickup-save" disabled={busy || !pickupArea?.placeRef}
                onClick={() => run(async () => {
                  const r = await api.patch(`/food/hotel/${businessId}/settings`, { pickupPlace: pickupArea.placeRef });
                  setInfo(r.data); setPickupArea(null);
                }, 'Mahali pamehifadhiwa')}
                style={{ height: 44, borderRadius: 22, border: `1px solid ${C.border}`, background: '#fff', color: C.ink, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Hifadhi mahali
              </button>
            </div>
            {row('Wateja waletewe', info.settings?.pickupPlace ? null : 'Weka mahali kwanza', 'delivery')}
            {form.delivery && !info.deliveryWorks && (
              <span role="status" style={{ fontSize: 13, color: C.amber }}>Kwa sasa kuletewa kunapatikana Dar es Salaam tu.</span>
            )}
          </section>
        )}

        <section style={{ margin: '12px 16px 0', padding: 16, borderRadius: 16, border: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <strong style={{ fontSize: 16 }}>Malipo na saa za kazi</strong>
          <label style={label}><span style={labelText}>Lipa Namba ya hoteli</span>
            <input style={input} inputMode="numeric" value={form.lipaNamba} onChange={(e) => setForm((x) => ({ ...x, lipaNamba: e.target.value }))}
              placeholder={info.lipaNamba && !form.lipaNamba ? `Inatumia ya duka lako: ${info.lipaNamba}` : 'mf. 5512345'} /></label>
          <label style={label}><span style={labelText}>Jina la Lipa Namba</span>
            <input style={input} value={form.lipaNambaName} onChange={(e) => setForm((x) => ({ ...x, lipaNambaName: e.target.value }))} maxLength={100} /></label>
          <label style={label}><span style={labelText}>Saa za kazi</span>
            <input style={input} value={form.openingHours} onChange={(e) => setForm((x) => ({ ...x, openingHours: e.target.value }))} maxLength={120} placeholder="mf. Saa 12:30 asubuhi hadi 4:00 usiku" /></label>
          <button type="button" data-testid="food-settings-save" onClick={() => saveSettings({})} disabled={busy}
            style={{ height: 48, borderRadius: 24, border: 'none', background: C.blue, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Hifadhi</button>
        </section>

        <section style={{ margin: '12px 16px 0', padding: 16, borderRadius: 16, border: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <strong style={{ fontSize: 16 }}>QR za meza na vyumba</strong>
          <span style={{ fontSize: 14, color: C.muted, lineHeight: 1.4 }}>Mteja anapiga picha ya QR mezani au chumbani, menyu inafunguka na oda inajua namba ya meza.</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ ...label, flex: 1 }}><span style={labelText}>Meza</span>
              <input style={input} type="number" inputMode="numeric" min="0" max="500" value={form.tableCount} onChange={(e) => setForm((x) => ({ ...x, tableCount: e.target.value }))} /></label>
            <label style={{ ...label, flex: 1 }}><span style={labelText}>Vyumba</span>
              <input style={input} type="number" inputMode="numeric" min="0" max="2000" value={form.roomCount} onChange={(e) => setForm((x) => ({ ...x, roomCount: e.target.value }))} /></label>
          </div>
          <button type="button" data-testid="food-qr" disabled={busy || (Number(form.tableCount) || 0) + (Number(form.roomCount) || 0) === 0}
            onClick={async () => { if (await saveSettings({})) setShowQr(true); }}
            style={{ height: 48, borderRadius: 24, border: `1px solid ${C.border}`, background: '#fff', color: C.ink, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Tengeneza QR {(Number(form.tableCount) || 0) + (Number(form.roomCount) || 0) || ''}
          </button>
          <span style={{ fontSize: 13, color: C.muted, wordBreak: 'break-all' }}>Kiungo cha menyu yako: {publicUrl}</span>
        </section>
      </div>
    </div>
  );
}
