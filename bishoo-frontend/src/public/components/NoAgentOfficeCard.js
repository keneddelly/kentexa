import React from 'react';
import { useTranslation } from 'react-i18next';

// Same-city door pickup with no agent available right now (KNOWN_FAULTS #24):
// point the sender to the nearest Super Agent office instead of a dead end.
// `office` comes from the server ({ name, phone, address, mapsUrl, distance })
// or is null when the city has no active office yet.
export default function NoAgentOfficeCard({ office }) {
  const { t } = useTranslation();
  return (
    <div role="alert" data-testid="no-agent-office" style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A',
      borderRadius: 12, padding: 12, marginBottom: 14, fontSize: 13, lineHeight: 1.5, color: '#92400E', textAlign: 'left' }}>
      <div style={{ fontWeight: 800 }}>{t('send_shipment.no_agent_now')}</div>
      {office ? (
        <>
          <div style={{ marginTop: 2 }}>{t('send_shipment.no_agent_bring')}:</div>
          <div style={{ marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: '#FFFFFF', border: '1px solid #FDE68A', color: '#0F172A' }}>
            <div style={{ fontWeight: 800, overflowWrap: 'anywhere' }}>{office.name}</div>
            {office.address && <div style={{ fontSize: 12, color: '#475569', overflowWrap: 'anywhere' }}>{office.address}</div>}
            {office.distance && <div style={{ fontSize: 12, color: '#475569' }}>{t('send_shipment.no_agent_distance', { distance: office.distance })}</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {office.phone && (
                <a href={`tel:${office.phone}`} style={{ padding: '8px 12px', borderRadius: 10, backgroundColor: '#EFF6FF',
                  color: '#1D4ED8', fontWeight: 800, fontSize: 13, textDecoration: 'none' }}>📞 {office.phone}</a>
              )}
              {office.mapsUrl && (
                <a href={office.mapsUrl} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 12px', borderRadius: 10,
                  backgroundColor: '#2563EB', color: '#FFFFFF', fontWeight: 800, fontSize: 13, textDecoration: 'none' }}>
                  📍 {t('send_shipment.no_agent_open_map')}
                </a>
              )}
            </div>
          </div>
        </>
      ) : (
        <div style={{ marginTop: 2 }}>{t('send_shipment.no_agent_no_office')}</div>
      )}
    </div>
  );
}
