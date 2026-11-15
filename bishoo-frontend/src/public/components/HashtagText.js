import React from 'react';
import { splitHashtags } from '../utils/hashtags';

// Hashtags (owner approved 2026-11-15): a post's or a comment's text with its tags as links
// (blue, the Twitter way). Tapping a tag opens its page and never opens the post behind it.
const HashtagText = ({ text, onTag }) => {
  const parts = splitHashtags(text);
  if (!onTag || !parts.some((p) => p.key)) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) => (p.key ? (
        <a key={i} href={`/tag/${encodeURIComponent(p.key)}`} data-testid="hashtag"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTag(p.key); }}
          style={{ color: '#1d9bf0', textDecoration: 'none', cursor: 'pointer' }}>
          {p.text}
        </a>
      ) : <React.Fragment key={i}>{p.text}</React.Fragment>))}
    </>
  );
};

export default HashtagText;
