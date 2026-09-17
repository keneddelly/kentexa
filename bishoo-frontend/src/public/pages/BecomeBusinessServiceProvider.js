/**
 * BecomeBusinessServiceProvider.js — B6C
 * Place at: src/public/pages/BecomeBusinessServiceProvider.js
 *
 * Simple apply screen for the already-shipped, generic
 * POST /business/:businessId/capabilities/:code/apply endpoint (code =
 * 'service'). No capability-specific input is needed server-side
 * (resolveServiceProviderProfile() derives everything from the Business +
 * caller), so this is a confirmation screen, not a form.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import { getMyBusinesses, applyForBusinessCapability } from '../../api/business';

const B  = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';

const BecomeBusinessServiceProvider = ({ businessId, onNavigate, isLoggedIn }) => {
  const { t } = useTranslation();
  const [business, setBusiness] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    getMyBusinesses().then((mine) => {
      setBusiness(mine.find((b) => Number(b.id) === Number(businessId)) || { id: businessId });
    }).catch(() => setBusiness({ id: businessId }));
  }, [businessId]); // eslint-disable-line react-hooks/exhaustive-deps

  const businessName = business?.tradingName || business?.legalName || '';

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError('');
      await applyForBusinessCapability(businessId, 'service');
      setDone(true);
    } catch (e) {
      const code = e.response?.data?.code;
      setError(code === 'CAPABILITY_APPLICATION_ALREADY_PENDING'
        ? t('apply_service_provider.already_pending')
        : t('apply_service_provider.submit_failed'));
    } finally { setSubmitting(false); }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9', fontFamily: 'Manrope,Inter,-apple-system,sans-serif' }}>
      <BackBar onBack={() => onNavigate(`BusinessHome-${businessId}`)} title={t('apply_service_provider.page_title')} top={0} />

      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
        {!done ? (
          <div style={{ backgroundColor: WH, borderRadius: 16, padding: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🧰</div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: DK, marginBottom: 8 }}>
              {t('apply_service_provider.hero_title', { business: businessName || t('apply_service_provider.page_title') })}
            </h2>
            <p style={{ fontSize: 13, color: GR, marginBottom: 20 }}>
              {t('apply_service_provider.hero_subtitle')}
            </p>

            {error && (
              <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: 10,
                padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
                {error}
              </div>
            )}

            <button onClick={handleSubmit} disabled={submitting}
              style={{ width: '100%', backgroundColor: B, color: WH, border: 'none',
                borderRadius: 12, padding: '14px 0', cursor: submitting ? 'not-allowed' : 'pointer',
                fontSize: 15, fontWeight: 800 }}>
              {submitting ? t('apply_service_provider.submitting_button') : t('apply_service_provider.submit_button')}
            </button>
          </div>
        ) : (
          <div style={{ backgroundColor: WH, borderRadius: 16, padding: 24,
            boxShadow: '0 2px 10px rgba(0,0,0,0.06)', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: DK, marginBottom: 8 }}>
              {t('apply_service_provider.success_title')}
            </h2>
            <p style={{ fontSize: 13, color: GR, marginBottom: 20 }}>
              {t('apply_service_provider.success_desc')}
            </p>
            <button onClick={() => onNavigate(`BusinessHome-${businessId}`)}
              style={{ width: '100%', backgroundColor: B, color: WH, border: 'none',
                borderRadius: 12, padding: '12px 0', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
              {t('apply_service_provider.back_to_business')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BecomeBusinessServiceProvider;
