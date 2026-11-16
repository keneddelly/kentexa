/**
 * ArticlePost.js — a Makala (owner approved 2026-11-16).
 *  - In a list (Home, a profile, a tag): a card with the cover, a teal MAKALA label, the title,
 *    two lines of the start and "dakika 6 kusoma"; tapping opens the reading page.
 *  - On its own page: the cover, the label and community, a large title, the reading time, and
 *    the text in comfortable reading type with sub-headings, lists, quotes, bold and photos inside;
 *    a thin bar at the top shows how far the reader has come.
 */
import React, { useEffect, useState } from 'react';
import { formatName, formatTitle } from '../utils/kentexaText';
import { articleBlocks, articlePhotos, boldParts, readMinutes, stripArticle } from '../utils/articleText';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#e1e8ed';
export const TEAL = '#0f766e';

export const BookIcon = ({ size = 12, color = '#fff' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5zM4 19.5A2.5 2.5 0 006.5 22H20v-5" />
  </svg>
);

export const MakalaPill = () => (
  <span data-testid="makala-pill" style={{ background: TEAL, color: '#fff', fontSize: 12, fontWeight: 800, letterSpacing: '0.03em', padding: '4px 10px',
    borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
    <BookIcon />MAKALA
  </span>
);

const Bold = ({ text }) => boldParts(text).map((p, i) => (p.bold ? <strong key={i}>{p.text}</strong> : <React.Fragment key={i}>{p.text}</React.Fragment>));

/** The article's text, laid out. */
export const ArticleBody = ({ text, media }) => {
  const { photo } = articlePhotos(media, text);
  const read = { fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 18, lineHeight: '30px', color: INK, overflowWrap: 'anywhere' };
  return (
    <div data-testid="article-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {articleBlocks(text).map((b, i) => {
        if (b.type === 'h') return <h2 key={i} style={{ margin: '6px 0 0', fontSize: 21, lineHeight: '27px', fontWeight: 800, color: INK }}><Bold text={b.text} /></h2>;
        if (b.type === 'ul') {
          return (
            <ul key={i} style={{ ...read, margin: 0, paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {b.items.map((it, j) => <li key={j}><Bold text={it} /></li>)}
            </ul>
          );
        }
        if (b.type === 'quote') {
          return (
            <blockquote key={i} style={{ ...read, margin: 0, borderLeft: `4px solid ${TEAL}`, padding: '2px 0 2px 14px', color: '#3c4a55', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
              <Bold text={b.text} />
            </blockquote>
          );
        }
        if (b.type === 'photo') {
          const p = photo(b.index);
          return p ? <img key={i} src={p.url} alt="" style={{ width: '100%', borderRadius: 12, display: 'block', background: '#f1f5f9' }} /> : null;
        }
        return <p key={i} style={{ ...read, margin: 0, whiteSpace: 'pre-wrap' }}><Bold text={b.text} /></p>;
      })}
    </div>
  );
};

/** How far down the page the reader is (0..1). */
const useReadProgress = (on) => {
  const [p, setP] = useState(0);
  useEffect(() => {
    if (!on) return undefined;
    const run = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setP(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
    };
    run();
    window.addEventListener('scroll', run, { passive: true });
    return () => window.removeEventListener('scroll', run);
  }, [on]);
  return p;
};

export default function ArticlePost({ post, detail = false, onOpen, onCommunity }) {
  const title = formatTitle(post.title) || 'Makala';
  const { cover } = articlePhotos(post.media?.length ? post.media : (post.imageUrl ? [{ url: post.imageUrl }] : []), post.body);
  const minutes = readMinutes(post.body);
  const community = post.community?.name ? formatName(post.community.name) : '';
  const progress = useReadProgress(detail);

  if (!detail) {
    const excerpt = stripArticle(post.body).split('\n').join(' ');
    return (
      <button type="button" data-testid="article-card" onClick={onOpen}
        style={{ padding: 0, border: `1px solid ${LINE}`, borderRadius: 16, overflow: 'hidden', background: '#fff', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'block', width: '100%' }}>
        {cover ? (
          <span style={{ display: 'block', position: 'relative', aspectRatio: '16 / 9', background: '#f1f5f9' }}>
            <img src={cover.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <span style={{ position: 'absolute', left: 12, bottom: 12 }}><MakalaPill /></span>
          </span>
        ) : (
          <span style={{ display: 'block', padding: '14px 14px 0' }}><MakalaPill /></span>
        )}
        <span style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px 14px' }}>
          <span data-testid="article-title" style={{ fontSize: 19, lineHeight: '25px', fontWeight: 800, color: INK, overflowWrap: 'anywhere' }}>{title}</span>
          {excerpt && (
            <span style={{ fontSize: 15, lineHeight: '21px', color: MUTED, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere' }}>{excerpt}</span>
          )}
          <span data-testid="article-meta" style={{ fontSize: 13, color: MUTED }}>dakika {minutes} kusoma{community ? ` · ${community}` : ''}</span>
        </span>
      </button>
    );
  }

  return (
    <div data-testid="article-view" style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '0 -16px' }}>
      <div aria-hidden="true" style={{ position: 'fixed', left: 0, right: 0, top: 0, height: 3, zIndex: 60, background: 'transparent' }}>
        <div data-testid="article-progress" style={{ width: `${Math.round(progress * 100)}%`, height: 3, background: TEAL, transition: 'width 0.1s linear' }} />
      </div>
      {cover && <img src={cover.url} alt="" data-testid="article-cover" style={{ width: '100%', maxHeight: 360, objectFit: 'cover', display: 'block', background: '#f1f5f9' }} />}
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <MakalaPill />
          {community && (
            <button type="button" onClick={onCommunity} style={{ border: 'none', background: 'none', padding: 0, fontFamily: 'inherit', fontSize: 13, color: MUTED, cursor: 'pointer' }}>{community}</button>
          )}
        </span>
        <h1 data-testid="article-title" style={{ margin: 0, fontSize: 26, lineHeight: '32px', fontWeight: 800, letterSpacing: '-0.01em', color: INK, overflowWrap: 'anywhere' }}>{title}</h1>
        <span style={{ fontSize: 14, color: MUTED }}>dakika {minutes} kusoma</span>
        <ArticleBody text={post.body} media={post.media?.length ? post.media : (post.imageUrl ? [{ url: post.imageUrl }] : [])} />
      </div>
    </div>
  );
}
