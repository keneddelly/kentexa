import React, { useLayoutEffect, useRef, useState } from 'react';

// Long post text, the Twitter way (owner 2026-10-26: "the longest text moment looks
// badly, it's cut off"): the full text, clamped to a few lines with "Soma zaidi" when
// it is longer, tap to open it all. Never cut in the middle with "...".
// 15px / 20px line, normal weight, dark text: easy to read on a phone.
export const POST_TEXT = { fontSize: 15, lineHeight: '20px', fontWeight: 400, color: '#0f1419',
  whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' };

const ExpandableText = ({ text, lines = 4, style, onOpen }) => {
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    setLong(el.scrollHeight > el.clientHeight + 1);
  }, [text, open, lines]);
  if (!text) return null;
  const clamp = open ? {} : { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' };
  return (
    <div style={style}>
      <div ref={ref} data-testid="post-text" onClick={onOpen} style={{ ...POST_TEXT, ...clamp, cursor: onOpen ? 'pointer' : 'auto' }}>{text}</div>
      {long && !open && (
        <button type="button" data-testid="read-more" onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          style={{ background: 'none', border: 'none', padding: '2px 0 0', cursor: 'pointer', color: '#1d9bf0', fontSize: 15, lineHeight: '20px', fontWeight: 400 }}>
          Soma zaidi
        </button>
      )}
    </div>
  );
};

export default ExpandableText;
