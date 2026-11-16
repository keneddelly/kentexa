import React, { useLayoutEffect, useRef, useState } from 'react';
import HashtagText from './HashtagText';
import { leadSeparator } from '../utils/kentexaText';

// Long post text, the Twitter way (owner 2026-10-26: "the longest text moment looks
// badly, it's cut off"): the full text, clamped to a few lines with "Soma zaidi" when
// it is longer, tap to open it all. Never cut in the middle with "...".
// One KenteXa text style (#374 part E): 16px / 22px line, normal weight, dark text.
export const POST_TEXT = { fontSize: 16, lineHeight: '22px', fontWeight: 400, color: '#0f1419',
  whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' };

// `onTag(key)`: tags in the text are links to their page (hashtags, owner 2026-11-15).
// `lead`: a caption's title, shown as the bold start of the text followed by a colon (#374 part E).
// A long post (owner 2026-11-16, up to 3,000 characters): "Soma zaidi" opens its own page instead of
// filling the feed; a shorter one opens in place.
export const LONG_TEXT = 700;

const ExpandableText = ({ text, lead = '', lines = 4, style, onOpen, onTag, raw = false, onMore = null }) => {
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    setLong(el.scrollHeight > el.clientHeight + 1);
  }, [text, lead, open, lines]);
  if (!text && !lead) return null;
  const clamp = open ? {} : { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' };
  return (
    <div style={style}>
      <div ref={ref} data-testid="post-text" onClick={onOpen} style={{ ...POST_TEXT, ...clamp, cursor: onOpen ? 'pointer' : 'auto' }}>
        {lead && <><strong data-testid="post-lead" style={{ fontWeight: 700 }}>{lead}</strong>{text ? leadSeparator(lead) : ''}</>}
        <HashtagText text={text} onTag={onTag} raw={raw} />
      </div>
      {long && !open && (
        <button type="button" data-testid="read-more" onClick={(e) => { e.stopPropagation(); if (onMore && String(text || '').length + String(lead || '').length > LONG_TEXT) onMore(); else setOpen(true); }}
          style={{ background: 'none', border: 'none', padding: '2px 0 0', cursor: 'pointer', color: '#1d9bf0', fontSize: 16, lineHeight: '22px', fontWeight: 400 }}>
          Soma zaidi
        </button>
      )}
    </div>
  );
};

export default ExpandableText;
