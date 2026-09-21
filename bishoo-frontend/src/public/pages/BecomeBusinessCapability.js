/**
 * BecomeBusinessCapability.js — I2C
 * Confirmation screen for POST /business/:businessId/capabilities/:code/apply
 * (code = 'commerce' | 'transport'). The Business is the route's exact
 * businessId; the server compares it with the caller's canonical acting
 * context and rejects a mismatch (never retargets). Nothing here decides
 * authority.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import { getMyBusinesses, applyForBusinessCapability } from '../../api/business';

const B = '#2563EB', DK = '#0F172A', GR = '#64748B', WH = '#FFFFFF';
const TRANSPORT_TYPES = ['bus', 'courier', 'van', 'truck', 'boda'];

export const applyErrorKey = (e) => {
  const code = e?.response?.data?.code || e?.response?.data?.message?.code;
  if (code === 'CAPABILITY_APPLICATION_ALREADY_PENDING') return 'apply_capability.already_pending';
  if (code === 'ACTIVATION_CONTEXT_MISMATCH' || code === 'ACTIVATION_IDENTITY_MISMATCH') return 'apply_capability.mismatch';
  if (code === 'VERIFICATION_REQUIRED' || code === 'VERIFICATION_REJECTED') return 'apply_capability.verification_required';
  if (typeof code === 'string' && code.includes('ALREADY') && code.includes('ACTIVE')) return 'apply_capability.already_active';
  return 'apply_capability.submit_failed';
};

const BecomeBusinessCapability = ({ businessId, code, onNavigate, isLoggedIn }) => {
  const { t } = useTranslation();
  const [business, setBusiness] = useState(null);
  const [type, setType] = useState('van');
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
      await applyForBusinessCapability(businessId, code, code === 'transport' ? { type } : undefined);
      setDone(true);
    } catch (e) {
      setError(t(applyErrorKey(e)));
    } finally { setSubmitting(false); }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9', fontFamily: 'Manrope,Inter,-apple-system,sans-serif' }}>
      <BackBar onBack={() => onNavigate(`BusinessHome-${businessId}`)} title={t('apply_capability.page_title')} top={0} />
      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
        {!done ? (
          <div style={{ backgroundColor: WH, borderRadius: 16, padding: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: DK, marginBottom: 8 }}>
              {t(`apply_capability.hero_title_${code}`, { business: businessName })}
            </h2>
            <p style={{ fontSize: 13, color: GR, marginBottom: 20 }}>{t(`apply_capability.hero_subtitle_${code}`)}</p>
            {code === 'transport' && (
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: DK, marginBottom: 16 }}>
                {t('apply_capability.transport_type_label')}
                <select value={type} onChange={(e) => setType(e.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: 6, padding: 10, borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14 }}>
                  {TRANSPORT_TYPES.map((v) => <option key={v} value={v}>{t(`apply_capability.type_${v}`)}</option>)}
                </select>
              </label>
            )}
            {error && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>{error}</div>}
            <button onClick={handleSubmit} disabled={submitting}
              style={{ width: '100%', backgroundColor: B, color: WH, border: 'none', borderRadius: 12, padding: '14px 0', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 800 }}>
              {submitting ? t('apply_capability.submitting_button') : t('apply_capability.submit_button')}
            </button>
          </div>
        ) : (
          <div style={{ backgroundColor: WH, borderRadius: 16, padding: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: DK, marginBottom: 8 }}>{t('apply_capability.success_title')}</h2>
            <p style={{ fontSize: 13, color: GR, marginBottom: 20 }}>{t('apply_capability.success_desc')}</p>
            <button onClick={() => onNavigate(`BusinessHome-${businessId}`)}
              style={{ width: '100%', backgroundColor: B, color: WH, border: 'none', borderRadius: 12, padding: '12px 0', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
              {t('apply_capability.back_to_business')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BecomeBusinessCapability;
