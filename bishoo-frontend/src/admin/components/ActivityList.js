import React from 'react';
import { describeEvent, CATEGORY_LABEL } from '../utils/describeEvent';

/** A list of recorded events: when, who (opens their page), what, as which role. */
const when = (d) => (d ? new Date(d).toLocaleString('sw-TZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const TONE = { warning: '#d97706', notice: '#1d4ed8' };

export default function ActivityList({ items = [], onOpenPerson, showActor = true }) {
  if (!items.length) return <p style={{ color: '#64748b', fontSize: 14, margin: '12px 0' }}>Hakuna shughuli bado.</p>;
  return (
    <div role="list">
      {items.map((e) => (
        <div key={e.id} role="listitem" data-testid={`event-${e.id}`}
          style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 12, padding: '10px 0', borderBottom: '1px solid #f1f5f9', fontSize: 14 }}>
          <span style={{ color: '#64748b', fontSize: 12 }}>{when(e.createdAt)}</span>
          <span style={{ minWidth: 0 }}>
            {showActor && (e.actorId ? (
              <button type="button" onClick={() => onOpenPerson && onOpenPerson(e.actorId)}
                style={{ background: 'none', border: 'none', padding: 0, color: '#0f172a', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>
                {e.actorName || `Mtumiaji #${e.actorId}`}
              </button>
            ) : <b>KenteXa</b>)}{' '}
            <span style={{ color: TONE[e.severity] || '#0f172a' }}>{describeEvent(e)}</span>
            <span style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              {[CATEGORY_LABEL[e.category] || e.category, e.actorType && `kama ${e.actorType}`, e.eventType === 'ACTION' && e.metadata?.route && `${e.metadata.method} ${e.metadata.route}`]
                .filter(Boolean).join(' · ')}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
