/**
 * StoreSettings.js — "Panga duka" (owner only, Duka page template, owner approved 2026-11-18):
 *  - Aina ya ukurasa: Otomatiki (KenteXa chooses), Duka, or Kawaida (the plain page);
 *  - Saa za kufungua: one opening and closing time, and the days the shop is closed;
 *  - Mikusanyiko: the owner's own shelves, each a name, a short line and the products on it.
 */
import React, { useState } from 'react';
import api from '../../api/api';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const DAYS = ['Jpili', 'Jtatu', 'Jnne', 'Jtano', 'Alh', 'Ijm', 'Jmos'];

const input = { height: 40, borderRadius: 10, border: '1px solid #cfd9de', padding: '0 12px', fontSize: 15, fontFamily: 'inherit', boxSizing: 'border-box' };
const btn = (dark, busy) => ({ height: 38, padding: '0 16px', borderRadius: 19, border: dark ? 'none' : '1px solid #cfd9de', background: dark ? INK : '#fff', color: dark ? '#fff' : INK,
  fontWeight: 700, fontSize: 14, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, fontFamily: 'inherit' });
const errText = (e) => { const m = e?.response?.data?.message; return Array.isArray(m) ? m.join(', ') : (m || 'Imeshindikana'); };

function CollectionEditor({ initial, products, onSave, onCancel, busy }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [note, setNote] = useState(initial?.note || '');
  const [ids, setIds] = useState(new Set((initial?.productIds || []).map(Number)));
  const toggle = (id) => setIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input style={input} placeholder="Jina (mf. Ofa za wiki)" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} data-testid="collection-title" />
      <input style={input} placeholder="Mstari mfupi (hiari)" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} />
      <div style={{ fontSize: 13, color: MUTED }}>Chagua bidhaa ({ids.size})</div>
      <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {products.map((p) => (
          <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, padding: '4px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={ids.has(Number(p.id))} onChange={() => toggle(Number(p.id))} />
            {p.images?.[0] ? <img src={p.images[0]} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }} /> : <span style={{ width: 32, height: 32, borderRadius: 6, background: LINE }} />}
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" style={btn(false)} onClick={onCancel}>Ghairi</button>
        <button type="button" style={btn(true, busy)} disabled={busy} data-testid="collection-save" onClick={() => onSave({ title, note, productIds: [...ids] })}>Hifadhi</button>
      </div>
    </div>
  );
}

export default function StoreSettings({ profileId, settings, products, onChanged, onClose }) {
  const [tpl, setTpl] = useState(settings?.pageTemplate || '');
  const [open, setOpen] = useState(settings?.openingHours?.open || '');
  const [close, setClose] = useState(settings?.openingHours?.close || '');
  const [closed, setClosed] = useState(new Set(settings?.openingHours?.closedDays || []));
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const collections = settings?.collections || [];

  const run = async (fn, ok) => {
    setBusy(true); setMsg('');
    try { const r = await fn(); onChanged?.(r?.data); setMsg(ok); return true; } catch (e) { setMsg(errText(e)); return false; } finally { setBusy(false); }
  };
  const saveSettings = () => run(() => api.patch(`/storefront/${profileId}/settings`, {
    pageTemplate: tpl || null,
    openingHours: open && close ? { open, close, closedDays: [...closed] } : null,
  }), 'Imehifadhiwa.');
  const saveCollection = (body) => run(() => (editing === 'new'
    ? api.post(`/storefront/${profileId}/collections`, body)
    : api.patch(`/storefront/${profileId}/collections/${editing}`, body)), 'Mkusanyiko umehifadhiwa.').then((ok) => { if (ok) setEditing(null); });
  const remove = (id) => run(() => api.delete(`/storefront/${profileId}/collections/${id}`), 'Mkusanyiko umeondolewa.');

  return (
    <div role="dialog" aria-modal="true" aria-label="Panga duka" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(15,20,25,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} data-testid="store-settings"
        style={{ width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: '20px 20px 0 0', padding: '18px 16px calc(24px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b style={{ fontSize: 19, color: INK }}>Panga duka</b>
          <button type="button" onClick={onClose} style={btn(false)}>Funga</button>
        </div>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <b style={{ fontSize: 15, color: INK }}>Aina ya ukurasa</b>
          {[['', 'Otomatiki', 'KenteXa inachagua kutokana na ulichonacho (bidhaa = Duka)'], ['store', 'Duka', 'Rafu, aina za bidhaa na utafutaji ndani ya duka'], ['brand', 'Chapa', 'Utambulisho wa biashara: maelezo, machapisho na maoni'], ['basic', 'Kawaida', 'Ukurasa rahisi wa picha za bidhaa']].map(([k, label, line]) => (
            <label key={k || 'auto'} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="radio" name="tpl" checked={tpl === k} onChange={() => setTpl(k)} style={{ marginTop: 3 }} />
              <span><b style={{ fontSize: 14, color: INK }}>{label}</b><br /><span style={{ fontSize: 13, color: MUTED }}>{line}</span></span>
            </label>
          ))}
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <b style={{ fontSize: 15, color: INK }}>Saa za kufungua</b>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="time" aria-label="Inafungua" style={input} value={open} onChange={(e) => setOpen(e.target.value)} />
            <span style={{ color: MUTED }}>hadi</span>
            <input type="time" aria-label="Inafunga" style={input} value={close} onChange={(e) => setClose(e.target.value)} />
          </div>
          <div style={{ fontSize: 13, color: MUTED }}>Siku inayofungwa</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DAYS.map((d, i) => (
              <button key={d} type="button" onClick={() => setClosed((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                style={{ height: 32, padding: '0 12px', borderRadius: 16, border: `1px solid ${closed.has(i) ? INK : '#cfd9de'}`, background: closed.has(i) ? INK : '#fff', color: closed.has(i) ? '#fff' : INK, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{d}</button>
            ))}
          </div>
          <div><button type="button" style={btn(true, busy)} disabled={busy} onClick={saveSettings} data-testid="store-settings-save">Hifadhi</button></div>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <b style={{ fontSize: 15, color: INK }}>Mikusanyiko</b>
            {editing === null && <button type="button" style={btn(false)} onClick={() => setEditing('new')} data-testid="collection-add">Ongeza</button>}
          </div>
          {collections.length === 0 && editing === null && <span style={{ fontSize: 13, color: MUTED }}>Mfano: "Ofa za wiki", "Zawadi chini ya 50K". Inaonekana juu ya duka.</span>}
          {editing === 'new' && <CollectionEditor products={products} busy={busy} onSave={saveCollection} onCancel={() => setEditing(null)} />}
          {collections.map((c) => (editing === c.id
            ? <CollectionEditor key={c.id} initial={c} products={products} busy={busy} onSave={saveCollection} onCancel={() => setEditing(null)} />
            : (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderTop: `1px solid ${LINE}`, paddingTop: 8 }}>
                <span><b style={{ fontSize: 14, color: INK }}>{c.title}</b><br /><span style={{ fontSize: 13, color: MUTED }}>bidhaa {(c.productIds || []).length}</span></span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <button type="button" style={btn(false)} onClick={() => setEditing(c.id)}>Badilisha</button>
                  <button type="button" style={btn(false, busy)} disabled={busy} onClick={() => remove(c.id)}>Ondoa</button>
                </span>
              </div>
            )))}
        </section>
        {msg && <div role="status" style={{ fontSize: 14, color: INK }}>{msg}</div>}
      </div>
    </div>
  );
}
