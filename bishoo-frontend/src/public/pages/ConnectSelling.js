/**
 * ConnectSelling.js — I2 legacy-Business transition.
 *
 * "Connect your selling activity to a Business". Explicit and owner-initiated:
 * every row is server-derived from GET /business/selling-connection (the
 * caller's OWN Businesses and their Selling state). Choosing a Business only
 * navigates to that exact Business's Start Selling; the server re-validates
 * ownership, workspace, profile cardinality and the acting context. Nothing
 * here binds, moves or changes the user's legacy personal Seller.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import { getSellingConnectionOptions } from '../../api/business';
import { ctaDestination } from '../../context/capabilityTiles';

const B = '#2563EB', DK = '#0F172A', GR = '#64748B', WH = '#FFFFFF';

const ConnectSelling = ({ onNavigate, isLoggedIn, activeProfile }) => {
  const { t } = useTranslation();
  const [data, setData] = useState(null); // null = loading
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    getSellingConnectionOptions().then(setData).catch(() => setError(t('connect_selling.load_failed')));
  }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const name = activeProfile?.displayName || '';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9', fontFamily: 'Manrope,Inter,-apple-system,sans-serif' }}>
      <BackBar onBack={() => onNavigate('back')} title={t('connect_selling.title')} top={0} />
      <div style={{ padding: 16, maxWidth: 560, margin: '0 auto' }}>
        {data?.legacySeller && (
          <div style={{ backgroundColor: WH, borderRadius: 14, padding: 14, marginBottom: 12, fontSize: 13, color: GR }}>
            {t('connect_selling.intro', { name })}
          </div>
        )}
        {error && <div style={{ color: '#dc2626', fontSize: 13 }}>{error}</div>}
        {data === null && !error && <div style={{ padding: '40px 0', textAlign: 'center', color: GR }}>⏳ {t('common.loading')}</div>}
        {data && data.options.length === 0 && (
          <div style={{ padding: '24px 0', textAlign: 'center', color: GR, fontSize: 13 }}>{t('connect_selling.empty')}</div>
        )}
        {data && data.options.map((o) => (
          <div key={o.businessId} style={{ backgroundColor: WH, borderRadius: 14, padding: 14, marginBottom: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: DK }}>{o.businessName}</div>
            <div style={{ fontSize: 12, color: GR, margin: '2px 0 10px' }}>{t(`connect_selling.state_${o.sellingState}`)}</div>
            {o.blocker && !String(o.blocker).startsWith('SELLING_') && (
              <div style={{ fontSize: 12, color: '#b45309', marginBottom: 8 }}>
                {t(`connect_selling.blocker_${o.blocker}`, { defaultValue: o.blocker })}
              </div>
            )}
            {o.eligible ? (
              <button onClick={() => onNavigate(ctaDestination('commerce', o.businessId))}
                style={{ width: '100%', backgroundColor: B, color: WH, border: 'none', borderRadius: 10, padding: '11px 0', cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                {t('connect_selling.start')}
              </button>
            ) : (
              <button onClick={() => onNavigate(`BusinessHome-${o.businessId}`)}
                style={{ width: '100%', backgroundColor: WH, color: B, border: `1.5px solid ${B}`, borderRadius: 10, padding: '10px 0', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                {t('connect_selling.open')}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ConnectSelling;
