/**
 * BusinessContextMismatch.js — I2D
 * Shown instead of a Business page when the route names a Business other
 * than the BUSINESS context the user is acting as. Never silently retargets
 * either side: the user explicitly opens the current Business or chooses.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';

const B = '#2563EB', DK = '#0F172A', GR = '#64748B', WH = '#FFFFFF';

const BusinessContextMismatch = ({ contextBusinessId, onNavigate }) => {
  const { t } = useTranslation();
  return (
    <div style={{ padding: '32px 16px', textAlign: 'center' }}>
      <div style={{ backgroundColor: WH, borderRadius: 16, padding: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
        <h2 style={{ fontSize: 17, fontWeight: 900, color: DK, marginBottom: 8 }}>{t('business_entry.mismatch_title')}</h2>
        <p style={{ fontSize: 13, color: GR, marginBottom: 20 }}>{t('business_entry.mismatch_body')}</p>
        <button onClick={() => onNavigate(`BusinessHome-${contextBusinessId}`)}
          style={{ width: '100%', backgroundColor: B, color: WH, border: 'none', borderRadius: 12, padding: '12px 0', cursor: 'pointer', fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
          {t('business_entry.open_current')}
        </button>
        <button onClick={() => onNavigate('MyBusinesses')}
          style={{ width: '100%', backgroundColor: WH, color: B, border: `1.5px solid ${B}`, borderRadius: 12, padding: '12px 0', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
          {t('business_entry.choose')}
        </button>
      </div>
    </div>
  );
};

export default BusinessContextMismatch;
