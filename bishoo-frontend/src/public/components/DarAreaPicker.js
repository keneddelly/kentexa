/**
 * DarAreaPicker.js — "Chagua eneo lako" (Dar es Salaam delivery zones, owner approved
 * 2026-11-02). Shown when KenteXa does not know a place in Dar: KenteXa never guesses a
 * fee, the customer picks the nearest known area and the price follows from its zone.
 *
 * Areas come from the server (GET /boda-rates/dar-areas), grouped road by road.
 */
import React, { useEffect, useMemo, useState } from 'react';
import api from '../../api/api';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#e6ebef';

export default function DarAreaPicker({ placeText, onPick, title = 'Uletewe wapi?' }) {
  const [areas, setAreas] = useState([]);
  const [road, setRoad] = useState('kati');
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    api.get('/boda-rates/dar-areas')
      .then((r) => { if (alive) setAreas(Array.isArray(r?.data?.areas) ? r.data.areas : []); })
      .catch(() => { if (alive) setAreas([]); });
    return () => { alive = false; };
  }, []);

  const roads = useMemo(() => {
    const seen = new Map();
    areas.forEach((a) => { if (!seen.has(a.road)) seen.set(a.road, a.roadLabel); });
    return [...seen.entries()].map(([key, label]) => ({ key, label }));
  }, [areas]);

  const places = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = term
      ? areas.flatMap((a) => a.places).filter((p) => p.toLowerCase().includes(term))
      : areas.filter((a) => a.road === road).sort((x, y) => x.ring - y.ring).flatMap((a) => a.places);
    return [...new Set(list)].slice(0, 40);
  }, [areas, road, q]);

  if (!areas.length) return null;
  return (
    <div data-testid="dar-area-picker" style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, background: '#fff' }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: INK }}>{title}</div>
      <div style={{ fontSize: 13, color: MUTED }}>
        {placeText ? `Hatukutambua "${placeText}" ndani ya Dar es Salaam.` : 'Hatukutambua eneo hili ndani ya Dar es Salaam.'} Chagua eneo lililo karibu zaidi, bei itafuata.
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tafuta eneo (mf. Mwenge)" aria-label="Tafuta eneo"
        style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: '9px 12px', fontSize: 15, fontFamily: 'inherit', color: INK }} />
      {!q.trim() && (
        <div role="tablist" style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {roads.map((r) => (
            <button key={r.key} type="button" role="tab" aria-selected={road === r.key} onClick={() => setRoad(r.key)}
              style={{ flexShrink: 0, padding: '5px 11px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${road === r.key ? INK : LINE}`, background: road === r.key ? INK : '#fff', color: road === r.key ? '#fff' : MUTED }}>
              {r.label}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {places.map((p) => (
          <button key={p} type="button" data-testid={`dar-area-${p}`} onClick={() => onPick(p)}
            style={{ padding: '6px 12px', borderRadius: 999, border: `1px solid ${LINE}`, background: '#fff', color: INK, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            {p}
          </button>
        ))}
        {places.length === 0 && <span style={{ fontSize: 13, color: MUTED }}>Hakuna eneo kwa jina hilo.</span>}
      </div>
    </div>
  );
}

/** The address with the picked area put first, so KenteXa reads the area before anything else. */
export const withDarArea = (area, address) => [area, String(address || '').trim()].filter(Boolean).join(' — ');
