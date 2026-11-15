import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import { countHashtags, hashtagBeingTyped, insertHashtag, MAX_HASHTAGS } from '../utils/hashtags';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';

// Composer hashtags (owner approved 2026-11-15, the way the big networks do it): while a tag is
// being typed after #, the tags already used on KenteXa that start the same way are offered
// with how many posts use each. Tapping one finishes the tag. A new tag needs no suggestion:
// writing it is enough.
export default function HashtagSuggestions({ text, caret, onPick }) {
  const typed = hashtagBeingTyped(text, caret);
  const query = typed ? typed.query : '';
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!query) { setItems([]); return undefined; }
    let alive = true;
    const timer = setTimeout(() => {
      api.get('/hashtags/suggest', { params: { q: query } })
        .then((r) => { if (alive) setItems(Array.isArray(r.data) ? r.data.slice(0, 6) : []); })
        .catch(() => { if (alive) setItems([]); });
    }, 200);
    return () => { alive = false; clearTimeout(timer); };
  }, [query]);

  const over = countHashtags(text) > MAX_HASHTAGS;
  const shown = typed && items.length > 0;
  if (!shown && !over) return null;

  return (
    <div>
      {shown && (
        <div role="listbox" aria-label="Tagi" data-testid="hashtag-suggestions"
          style={{ marginTop: 6, border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden', background: '#fff', boxShadow: '0 4px 16px rgba(15,20,25,0.08)' }}>
          {items.map((t) => (
            <button key={t.key} type="button" role="option" aria-selected="false" data-testid="hashtag-suggestion"
              // Keep the keyboard open: the textarea keeps its focus.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { const next = insertHashtag(text, typed, t.display, caret); onPick(next.text, next.caret); }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, width: '100%', padding: '10px 14px', border: 'none',
                borderBottom: `1px solid ${LINE}`, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: INK }}>#{t.display}</span>
              <span style={{ fontSize: 13, color: MUTED }}>{t.postCount === 1 ? 'Chapisho 1' : `Machapisho ${Number(t.postCount || 0).toLocaleString('en-US')}`}</span>
            </button>
          ))}
        </div>
      )}
      {over && (
        <div role="status" data-testid="hashtag-limit" style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
          Tagi {MAX_HASHTAGS} za kwanza tu ndizo zitaunganishwa.
        </div>
      )}
    </div>
  );
}
