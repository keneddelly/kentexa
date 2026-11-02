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
import { ApplyPage, ErrorText, Note, pillStyle } from '../components/ApplyKit';
import { getMyBusinesses, applyForBusinessCapability } from '../../api/business';

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

  const back = () => onNavigate(`BusinessHome-${businessId}`);
  if (done) {
    return (
      <ApplyPage onBack={back} backTitle={t('apply_service_provider.page_title')} title={t('apply_service_provider.success_title')}>
        <Note tone="green">{t('apply_service_provider.success_desc')}</Note>
        <button type="button" onClick={back} style={pillStyle()}>{t('apply_service_provider.back_to_business')}</button>
      </ApplyPage>
    );
  }
  return (
    <ApplyPage onBack={back} backTitle={t('apply_service_provider.page_title')} title={t('apply_service_provider.hero_title', { business: businessName || t('apply_service_provider.page_title') })} desc={t('apply_service_provider.hero_subtitle')}>
      <ErrorText>{error}</ErrorText>
      <button type="button" onClick={handleSubmit} disabled={submitting} style={pillStyle(true, submitting)}>
        {submitting ? t('apply_service_provider.submitting_button') : t('apply_service_provider.submit_button')}
      </button>
    </ApplyPage>
  );
};

export default BecomeBusinessServiceProvider;
