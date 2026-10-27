import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';
import { getPhonePosition } from '../../utils/phoneLocation';
import { LineIcon } from './LineIcon';
import { Spinner } from './Loading';

// "Kituo changu" (NEXT_STEPS.md section 18 b; owner 2026-10-27: it was too small): the agent's
// fixed base point, set with the phone's GPS while standing there. Pickups near it reach the
// agent first. No live tracking. The point itself is shown only to the agent, on their card.

/** The OpenStreetMap tile that holds a point at a zoom, and where the point sits in it (0..1). */
export function tileFor(latitude, longitude, zoom = 16) {
  const n = 2 ** zoom;
  const x = ((Number(longitude) + 180) / 360) * n;
  const rad = (Number(latitude) * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return { zoom, x: Math.floor(x), y: Math.floor(y), fx: x - Math.floor(x), fy: y - Math.floor(y) };
}

const INK = '#0f1419';
const MUTED = '#536471';

const MapPreview = ({ latitude, longitude }) => {
  const [failed, setFailed] = useState(false);
  if (latitude == null || longitude == null) return null;
  const tile = tileFor(latitude, longitude);
  const openUrl = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`;
  return (
    <a href={openUrl} target="_blank" rel="noopener noreferrer" aria-label="Fungua kituo changu kwenye ramani"
      style={{ display: 'block', position: 'relative', height: 160, borderRadius: 16, overflow: 'hidden', background: '#e8eef3', border: '1px solid #eff3f4' }}>
      {!failed && (
        // One map tile, scaled up so the base sits in view; the pin marks the exact point.
        <img src={`https://tile.openstreetmap.org/${tile.zoom}/${tile.x}/${tile.y}.png`} alt="" onError={() => setFailed(true)}
          style={{ position: 'absolute', width: 512, height: 512, left: `calc(50% - ${Math.round(tile.fx * 512)}px)`, top: `calc(50% - ${Math.round(tile.fy * 512)}px)` }} />
      )}
      <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -100%)' }}>
        <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z" fill="#1d4ed8" /><circle cx="12" cy="9.5" r="2.5" fill="#fff" /></svg>
      </span>
      <span style={{ position: 'absolute', right: 6, bottom: 4, fontSize: 10, color: MUTED, background: 'rgba(255,255,255,0.85)', padding: '0 4px', borderRadius: 4 }}>© OpenStreetMap</span>
    </a>
  );
};

export default function AgentBasePoint({ hasBasePoint, baseSetAt, latitude, longitude, area, onSaved, getPosition = getPhonePosition }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { ok, text }

  const save = async () => {
    setBusy(true); setMessage(null);
    try {
      const pos = await getPosition();
      const res = await api.patch('/agents/my-base', { latitude: pos.latitude, longitude: pos.longitude, accuracyM: pos.accuracyM });
      setMessage({ ok: true, text: res.data?.message || t('agent_base.saved') });
      if (onSaved) onSaved({ ...res.data, latitude: pos.latitude, longitude: pos.longitude });
    } catch (err) {
      const text = err?.response?.data?.message || (err?.code ? t(`pickup_pin.error_${err.code}`) : t('pickup_pin.error_unavailable'));
      setMessage({ ok: false, text: Array.isArray(text) ? text.join(', ') : text });
    } finally { setBusy(false); }
  };

  const note = message && (
    <div role={message.ok ? 'status' : 'alert'} style={{ fontSize: 14, color: message.ok ? '#166534' : '#b91c1c' }}>{message.text}</div>
  );

  if (hasBasePoint) {
    return (
      <section data-testid="agent-base-point" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: INK }}>{t('agent_base.card_title')}</h2>
        <MapPreview latitude={latitude} longitude={longitude} />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {area && <strong style={{ fontSize: 15, color: INK }}>{area}</strong>}
          <span style={{ fontSize: 13, color: MUTED }}>{t('agent_base.set_on', { date: baseSetAt ? new Date(baseSetAt).toLocaleDateString('sw-TZ') : '' })}</span>
          <span style={{ fontSize: 13, color: MUTED }}>{t('agent_base.near_first')}</span>
        </span>
        {note}
        <button type="button" onClick={save} disabled={busy}
          style={{ height: 48, borderRadius: 24, border: '1px solid #cfd9de', background: '#fff', color: INK, fontSize: 15, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {busy ? <Spinner size={18} color={INK} /> : <LineIcon name="pin" size={18} />}
          {busy ? t('pickup_pin.locating') : t('agent_base.change')}
        </button>
      </section>
    );
  }
  return (
    <section data-testid="agent-base-point" style={{ background: '#fffbeb', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <strong style={{ fontSize: 16, color: '#92400e' }}>{t('agent_base.title')}</strong>
      <span style={{ fontSize: 14, color: MUTED, lineHeight: 1.45 }}>{t('agent_base.explain')}</span>
      <button type="button" onClick={save} disabled={busy}
        style={{ height: 48, borderRadius: 24, border: 'none', background: '#1d4ed8', color: '#fff', fontSize: 15, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {busy ? <Spinner size={18} color="#fff" /> : <LineIcon name="pin" size={18} color="#fff" />}
        {busy ? t('pickup_pin.locating') : t('agent_base.button')}
      </button>
      {note}
    </section>
  );
}
