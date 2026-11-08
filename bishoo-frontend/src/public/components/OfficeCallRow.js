/**
 * OfficeCallRow.js — under each office offer (owner 2026-11-09: "the call button is missing here; all
 * available offices should be shown with a call button; we need offices to compete for jobs"):
 * how far the office is from the sender and "Piga ofisi". Outside the offer's own button (a link
 * cannot sit inside a button).
 */
import React from 'react';

const telOf = (p) => String(p || '').replace(/[^\d+]/g, '');

export default function OfficeCallRow({ phone, distanceKm, testId }) {
  if (!phone && distanceKm == null) return null;
  return (
    <div data-testid={testId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '6px 4px 0', fontSize: 13, color: '#536471' }}>
      <span>{distanceKm != null ? `${distanceKm < 1 ? `m ${Math.max(100, Math.round(distanceKm * 10) * 100)}` : `km ${distanceKm}`} kutoka kwako` : ''}</span>
      {phone && (
        <a href={`tel:${telOf(phone)}`} style={{ height: 36, padding: '0 16px', borderRadius: 18, background: '#0f1419', color: '#fff', fontWeight: 700, fontSize: 14,
          textDecoration: 'none', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>Piga ofisi</a>
      )}
    </div>
  );
}
