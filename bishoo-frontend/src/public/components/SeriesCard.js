/**
 * SeriesCard.js — one series as a card (Mfululizo, #410): cover or the KenteXa blue, "SEHEMU n",
 * the title, publisher and followers. Used on the topic page, the jumuiya page and Home's tray.
 */
import React from 'react';
import { SeriesMark } from './SeriesBar';
import { formatName, formatTitle } from '../utils/kentexaText';

const INK = '#0f1419';
const MUTED = '#536471';
const BLUE = '#1d4ed8';

export const SeriesCard = ({ s, onNavigate, width = 240 }) => (
  <button type="button" data-testid={`series-card-${s.id}`} onClick={() => onNavigate(`Series-${s.id}`)}
    style={{ flex: `0 0 ${width}px`, border: '1px solid #e1e8ed', borderRadius: 14, overflow: 'hidden', background: '#fff', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', padding: 0, display: 'flex', flexDirection: 'column' }}>
    <span style={{ height: 96, display: 'block', position: 'relative', background: s.coverUrl ? '#f1f5f9' : 'linear-gradient(135deg,#0b1224,#13205a 55%,#1d4ed8)' }}>
      {s.coverUrl && <img src={s.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      <span style={{ position: 'absolute', left: 8, bottom: 8, background: '#fff', color: BLUE, fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <SeriesMark size={11} />SEHEMU {s.episodes}
      </span>
    </span>
    <span style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <b style={{ fontSize: 14, lineHeight: '19px', color: INK, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{formatTitle(s.title)}</b>
      <span style={{ fontSize: 12, color: MUTED }}>{formatName(s.publisher)}{s.followers ? ` · wafuasi ${s.followers}` : ''}</span>
    </span>
  </button>
);

/** Only real series rows (guards against any other answer). */
export const seriesRows = (data) => (Array.isArray(data) ? data.filter((x) => x && x.id && x.title && Number(x.episodes) > 0) : []);

export default SeriesCard;
