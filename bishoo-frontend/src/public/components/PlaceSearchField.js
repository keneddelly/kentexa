import React, { useEffect, useRef, useState } from 'react';
import api from '../../api/api';

// Where a listing is (owner 2026-10-25: "location on adding a listing is old").
// The same place search as the send form: type "Kariakoo", "Mbezi", "Sinza"...
// and pick from the list, instead of three region/district/ward dropdowns.
// A place the search does not know can still be used as typed.
//
// onChange gets the same shape the old LocationPicker gave
// ({ regionName, districtName, wardName, ... }) plus displayLabel and placeRef,
// so the forms keep working unchanged.

const EMPTY = { regionId: null, regionName: '', districtId: null, districtName: '', wardId: null, wardName: '' };

/** "Kariakoo, Ilala, Dar es Salaam" from a location value. */
export const placeLabel = (loc) =>
  [loc?.wardName, loc?.districtName, loc?.regionName].filter(Boolean).join(', ') || loc?.displayLabel || '';

/** A picked search result as a location value. */
export const fromCandidate = (c) => ({
  ...EMPTY,
  regionName: c?.regionName || '', districtName: c?.districtName || '', wardName: c?.wardName || '',
  displayLabel: c?.displayLabel || '', placeRef: c?.placeRef || null,
});

/** What the person typed, used as it is (the search did not know the place). */
export const fromTyped = (text) => {
  const parts = String(text || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return { ...EMPTY };
  if (parts.length === 1) return { ...EMPTY, wardName: parts[0], displayLabel: parts[0] };
  if (parts.length === 2) return { ...EMPTY, wardName: parts[0], regionName: parts[1], displayLabel: parts.join(', ') };
  return { ...EMPTY, wardName: parts.slice(0, -2).join(', '), districtName: parts.at(-2), regionName: parts.at(-1), displayLabel: parts.join(', ') };
};

const box = { width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 15, fontFamily: 'inherit', backgroundColor: '#fff' };

export default function PlaceSearchField({ id = 'listing-place', value, onChange, placeholder = 'Andika mahali, mfano Kariakoo', label }) {
  const [text, setText] = useState(() => placeLabel(value));
  const [picked, setPicked] = useState(() => !!placeLabel(value));
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const outside = useRef(placeLabel(value));

  // A value set from outside (editing a saved listing, a reset form) shows here.
  useEffect(() => {
    const next = placeLabel(value);
    if (next !== outside.current) {
      outside.current = next;
      setText(next); setPicked(!!next);
    }
  }, [value]);

  useEffect(() => {
    const q = text.trim();
    if (picked || q.length < 2) { setSuggestions([]); return undefined; }
    const timer = setTimeout(() => {
      api.get('/location-intelligence/places', { params: { q, limit: 8 } })
        .then((r) => setSuggestions(r.data?.candidates || []))
        .catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [text, picked]);

  const choose = (loc) => {
    const shown = placeLabel(loc);
    outside.current = shown;
    setText(shown); setPicked(true); setOpen(false); setSuggestions([]);
    onChange(loc);
  };
  const typed = text.trim();

  return (
    <div style={{ position: 'relative' }}>
      {label && <label htmlFor={id} style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{label}</label>}
      <input id={id} value={text} placeholder={placeholder} autoComplete="off" aria-label={label || 'Mahali'}
        onChange={(e) => { setText(e.target.value); setPicked(false); setOpen(true); if (!e.target.value.trim()) onChange({ ...EMPTY }); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} style={box} />
      {typed && !picked && (
        <div style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>Chagua mahali kwenye orodha</div>
      )}
      {open && !picked && typed.length >= 2 && (
        <div role="listbox" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, background: '#fff', borderRadius: 12,
          boxShadow: '0 8px 24px rgba(15,23,42,0.14)', maxHeight: 260, overflowY: 'auto', marginTop: 4 }}>
          {suggestions.map((s, i) => (
            <button type="button" role="option" aria-selected="false" key={`${s.placeRef?.providerPlaceId || i}`}
              onMouseDown={(e) => e.preventDefault()} onClick={() => choose(fromCandidate(s))}
              style={{ display: 'block', width: '100%', textAlign: 'left', minHeight: 44, padding: '10px 14px', border: 0,
                borderBottom: '1px solid #f1f5f9', background: '#fff', fontFamily: 'inherit', fontSize: 15, cursor: 'pointer' }}>
              {s.displayLabel}
            </button>
          ))}
          <button type="button" role="option" aria-selected="false" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(fromTyped(typed))}
            style={{ display: 'block', width: '100%', textAlign: 'left', minHeight: 44, padding: '10px 14px', border: 0,
              background: '#f8fafc', fontFamily: 'inherit', fontSize: 14, color: '#475569', cursor: 'pointer' }}>
            Tumia “{typed}” kama ulivyoandika
          </button>
        </div>
      )}
    </div>
  );
}
