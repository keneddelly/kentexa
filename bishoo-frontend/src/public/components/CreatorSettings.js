/**
 * CreatorSettings.js — "Panga ukurasa" for a personal brand page (owner only, owner approved
 * 2026-11-18): the line under the name, the post pinned on top of "Kazi zangu", and the page type
 * (Otomatiki: the writer page once you have a Makala; Mwandishi; Kawaida).
 */
import React, { useState } from 'react';
import api from '../../api/api';

const INK = '#0f1419';
const MUTED = '#536471';
const input = { height: 42, borderRadius: 10, border: '1px solid #cfd9de', padding: '0 12px', fontSize: 15, fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' };
const btn = (dark, busy) => ({ height: 38, padding: '0 16px', borderRadius: 19, border: dark ? 'none' : '1px solid #cfd9de', background: dark ? INK : '#fff', color: dark ? '#fff' : INK,
  fontWeight: 700, fontSize: 14, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, fontFamily: 'inherit' });
const errText = (e) => { const m = e?.response?.data?.message; return Array.isArray(m) ? m.join(', ') : (m || 'Imeshindikana'); };
const label = (p) => String(p.title || p.body || '').replace(/[#*>[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 70) || `Chapisho #${p.id}`;

export default function CreatorSettings({ profileId, settings, posts = [], onChanged, onClose }) {
  const [headline, setHeadline] = useState(settings?.headline || '');
  const [tpl, setTpl] = useState(settings?.pageTemplate || '');
  const [pin, setPin] = useState(settings?.pinnedPostId ? String(settings.pinnedPostId) : '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const save = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await api.patch(`/storefront/${profileId}/settings`, { headline: headline.trim() || null, pageTemplate: tpl || null, pinnedPostId: pin ? Number(pin) : null });
      onChanged?.(r?.data);
      setMsg('Imehifadhiwa.');
    } catch (e) { setMsg(errText(e)); } finally { setBusy(false); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Panga ukurasa" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(15,20,25,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} data-testid="creator-settings"
        style={{ width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: '20px 20px 0 0', padding: '18px 16px calc(24px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b style={{ fontSize: 19, color: INK }}>Panga ukurasa</b>
          <button type="button" onClick={onClose} style={btn(false)}>Funga</button>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <b style={{ fontSize: 15, color: INK }}>Mstari chini ya jina lako</b>
          <input style={input} maxLength={120} data-testid="creator-headline" placeholder="Mf. Mhasibu · Anaandika kuhusu fedha binafsi" value={headline} onChange={(e) => setHeadline(e.target.value)} />
          <span style={{ fontSize: 12, color: MUTED }}>Kazi yako na unachoandika kuhusu, kwa mstari mmoja.</span>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <b style={{ fontSize: 15, color: INK }}>Chapisho la juu</b>
          <select style={input} value={pin} onChange={(e) => setPin(e.target.value)} data-testid="creator-pin">
            <option value="">Hakuna</option>
            {posts.map((p) => <option key={p.id} value={String(p.id)}>{p.intent === 'article' ? 'Makala: ' : ''}{label(p)}</option>)}
          </select>
        </label>
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <b style={{ fontSize: 15, color: INK }}>Aina ya ukurasa</b>
          {[['', 'Otomatiki', 'Ukurasa wa mwandishi ukishaandika Makala'], ['creator', 'Mwandishi / mtaalamu', 'Kazi zangu, Makala, Mfululizo na takwimu za wasomaji'], ['basic', 'Kawaida', 'Machapisho tu, kama kawaida']].map(([k, l, line]) => (
            <label key={k || 'auto'} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="radio" name="ctpl" checked={tpl === k} onChange={() => setTpl(k)} style={{ marginTop: 3 }} />
              <span><b style={{ fontSize: 14, color: INK }}>{l}</b><br /><span style={{ fontSize: 13, color: MUTED }}>{line}</span></span>
            </label>
          ))}
        </section>
        <div><button type="button" style={btn(true, busy)} disabled={busy} onClick={save} data-testid="creator-save">Hifadhi</button></div>
        {msg && <div role="status" style={{ fontSize: 14, color: INK }}>{msg}</div>}
      </div>
    </div>
  );
}
