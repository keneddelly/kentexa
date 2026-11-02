/**
 * PostPhotos.js — a post with 2 to 4 photos (Home Feed phase D, owner approved 2026-11-02).
 *
 * 2 photos side by side, 3 as one large and two small, 4 as a square of four; a "1/N"
 * counter and the price (from the linked record) sit on the photos. A tap opens the
 * photo full screen, where the person moves between them. A single photo keeps the
 * phase B frame in PostCard, so this is used only for two or more.
 */
import React, { useEffect, useState } from 'react';

const WH = '#FFFFFF';

const cellStyle = { position: 'relative', padding: 0, border: 'none', margin: 0, cursor: 'pointer', overflow: 'hidden', background: '#e7ecf0', minWidth: 0, minHeight: 0 };
const imgStyle = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' };

const layoutFor = (n) => {
  if (n === 2) return { columns: '1fr 1fr', rows: '1fr', ratio: '16 / 9', areas: [{}, {}] };
  if (n === 3) return { columns: '2fr 1fr', rows: '1fr 1fr', ratio: '4 / 3', areas: [{ gridRow: '1 / 3' }, {}, {}] };
  return { columns: '1fr 1fr', rows: '1fr 1fr', ratio: '1 / 1', areas: [{}, {}, {}, {}] };
};

export default function PostPhotos({ photos = [], price = 0, priceLabel = '', title = '' }) {
  const list = photos.filter((p) => p && p.url).slice(0, 4);
  const [open, setOpen] = useState(null); // index shown full screen, or null

  useEffect(() => {
    if (open === null) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') setOpen((i) => Math.min(list.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setOpen((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, list.length]);

  if (list.length < 2) return null;
  const layout = layoutFor(list.length);

  return (
    <>
      <div data-testid="post-photos" style={{ position: 'relative', display: 'grid', gridTemplateColumns: layout.columns, gridTemplateRows: layout.rows,
        gap: 2, borderRadius: 16, overflow: 'hidden', border: '1px solid #eff3f4', aspectRatio: layout.ratio, maxWidth: '100%' }}>
        {list.map((p, i) => (
          <button key={p.url + i} type="button" onClick={() => setOpen(i)} aria-label={`Picha ${i + 1} kati ya ${list.length}`}
            data-testid="post-photo-cell" style={{ ...cellStyle, ...layout.areas[i] }}>
            <img src={p.url} alt="" style={imgStyle} loading="lazy" />
          </button>
        ))}
        <span data-testid="photo-counter" style={{ position: 'absolute', top: 8, right: 8, padding: '2px 8px', borderRadius: 10,
          background: 'rgba(15,20,25,0.72)', color: WH, fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}>
          1/{list.length}
        </span>
        {price > 0 && (
          <span data-testid="photo-price" style={{ position: 'absolute', left: 10, bottom: 10, padding: '4px 10px', borderRadius: 14,
            background: 'rgba(15,20,25,0.78)', color: WH, fontSize: 14, fontWeight: 800, pointerEvents: 'none' }}>{priceLabel}</span>
        )}
      </div>

      {open !== null && (
        <div role="dialog" aria-modal="true" aria-label={title || 'Picha'} data-testid="photo-viewer"
          onClick={() => setOpen(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 5000, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={list[open].url} alt="" onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          <span data-testid="viewer-counter" style={{ position: 'absolute', top: 'max(14px, env(safe-area-inset-top))', left: '50%', transform: 'translateX(-50%)',
            color: WH, fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{open + 1}/{list.length}</span>
          <button type="button" aria-label="Funga" onClick={() => setOpen(null)}
            style={{ position: 'absolute', top: 'max(8px, env(safe-area-inset-top))', right: 8, width: 40, height: 40, borderRadius: 20, border: 'none', background: 'rgba(255,255,255,0.14)', color: WH, fontSize: 22, cursor: 'pointer' }}>×</button>
          {open > 0 && (
            <button type="button" aria-label="Picha iliyotangulia" onClick={(e) => { e.stopPropagation(); setOpen(open - 1); }}
              style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 40, height: 40, borderRadius: 20, border: 'none', background: 'rgba(255,255,255,0.14)', color: WH, fontSize: 22, cursor: 'pointer' }}>‹</button>
          )}
          {open < list.length - 1 && (
            <button type="button" aria-label="Picha inayofuata" onClick={(e) => { e.stopPropagation(); setOpen(open + 1); }}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 40, height: 40, borderRadius: 20, border: 'none', background: 'rgba(255,255,255,0.14)', color: WH, fontSize: 22, cursor: 'pointer' }}>›</button>
          )}
        </div>
      )}
    </>
  );
}
