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
import { ApplyPage, ErrorText, Field, Note, inputStyle, pillStyle } from '../components/ApplyKit';
import { getMyBusinesses, getBusinessWorkspaces, applyForBusinessCapability, connectSelling } from '../../api/business';
import VerifyIdentityModal from '../components/VerifyIdentityModal';

const TRANSPORT_TYPES = ['bus', 'courier', 'van', 'truck', 'boda'];

export const applyErrorKey = (e) => {
  const code = e?.response?.data?.code || e?.response?.data?.message?.code;
  if (code === 'CAPABILITY_APPLICATION_ALREADY_PENDING') return 'apply_capability.already_pending';
  if (code === 'SELLING_PENDING') return 'apply_capability.already_pending';
  if (code === 'SELLING_ALREADY_ACTIVE') return 'apply_capability.already_active';
  if (code === 'BUSINESS_PROFILE_CARDINALITY_INVALID') return 'connect_selling.blocker_BUSINESS_PROFILE_CARDINALITY_INVALID';
  if (code === 'BUSINESS_PROFILE_RELATIONSHIP_INVALID') return 'connect_selling.blocker_BUSINESS_PROFILE_RELATIONSHIP_INVALID';
  if (code === 'ACTIVATION_CONTEXT_MISMATCH' || code === 'ACTIVATION_IDENTITY_MISMATCH') return 'apply_capability.mismatch';
  if (code === 'VERIFICATION_REQUIRED' || code === 'VERIFICATION_REJECTED') return 'apply_capability.verification_required';
  if (typeof code === 'string' && code.includes('ALREADY') && code.includes('ACTIVE')) return 'apply_capability.already_active';
  return 'apply_capability.submit_failed';
};

const BecomeBusinessCapability = ({ businessId, code, onNavigate, isLoggedIn }) => {
  const { t } = useTranslation();
  const [business, setBusiness] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [type, setType] = useState('van');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [showVerifyIdentity, setShowVerifyIdentity] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    getMyBusinesses().then((mine) => {
      setBusiness(mine.find((b) => Number(b.id) === Number(businessId)) || { id: businessId });
    }).catch(() => setBusiness({ id: businessId }));
    if (code === 'super_agent') {
      getBusinessWorkspaces(businessId).then((items) => {
        const list = Array.isArray(items) ? items : [];
        setWorkspaces(list);
        if (list.length === 1) setWorkspaceId(String(list[0].id));
      }).catch(() => setWorkspaces([]));
    }
  }, [businessId]); // eslint-disable-line react-hooks/exhaustive-deps

  const businessName = business?.tradingName || business?.legalName || '';

  const handleSubmit = async () => {
    if (code === 'super_agent' && !workspaceId) {
      setError(t(workspaces.length ? 'apply_capability.workspace_required' : 'apply_capability.workspace_unavailable'));
      return;
    }
    try {
      setSubmitting(true);
      setError('');
      if (code === 'commerce') await connectSelling(businessId);
      else await applyForBusinessCapability(
        businessId,
        code,
        code === 'transport' ? { type } : undefined,
        code === 'super_agent' ? Number(workspaceId) : undefined,
      );
      setDone(true);
    } catch (e) {
      const code = e?.response?.data?.code || e?.response?.data?.message?.code;
      if (code === 'VERIFICATION_REQUIRED' || code === 'VERIFICATION_REJECTED') {
        setError('');
        setShowVerifyIdentity(true);
      } else {
        setError(t(applyErrorKey(e)));
      }
    } finally { setSubmitting(false); }
  };

  const back = () => onNavigate(`BusinessHome-${businessId}`);
  if (done) {
    return (
      <ApplyPage onBack={back} backTitle={t('apply_capability.page_title')} title={t('apply_capability.success_title')}>
        <Note tone="green">{t('apply_capability.success_desc')}</Note>
        <button type="button" onClick={back} style={pillStyle()}>{t('apply_capability.back_to_business')}</button>
      </ApplyPage>
    );
  }
  return (
    <ApplyPage onBack={back} backTitle={t('apply_capability.page_title')} title={t(`apply_capability.hero_title_${code}`, { business: businessName })} desc={t(`apply_capability.hero_subtitle_${code}`)}>
      <Note tone="blue">{t(`apply_capability.what_happens_${code}`)}</Note>
      {code === 'super_agent' && (
        <Field label={t('apply_capability.workspace_label')}>
          <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} style={inputStyle}>
            <option value="">{t('apply_capability.workspace_placeholder')}</option>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>{workspace.name || `Office ${workspace.id}`}</option>
            ))}
          </select>
          <span style={{ fontSize: 13, color: '#64748B' }}>{t('apply_capability.workspace_hint')}</span>
        </Field>
      )}
      {code === 'transport' && (
        <Field label={t('apply_capability.transport_type_label')}>
          <select value={type} onChange={(e) => setType(e.target.value)} style={inputStyle}>
            {TRANSPORT_TYPES.map((v) => <option key={v} value={v}>{t(`apply_capability.type_${v}`)}</option>)}
          </select>
        </Field>
      )}
      <ErrorText>{error}</ErrorText>
      <button type="button" onClick={handleSubmit} disabled={submitting} style={pillStyle(true, submitting)}>
        {submitting ? t('apply_capability.submitting_button') : t('apply_capability.submit_button')}
      </button>
      {showVerifyIdentity && (
        <VerifyIdentityModal
          onClose={() => setShowVerifyIdentity(false)}
          onVerified={() => { setShowVerifyIdentity(false); handleSubmit(); }}
        />
      )}
    </ApplyPage>
  );
};

export default BecomeBusinessCapability;
