/**
 * BecomeTransportProvider.js — Msafirishaji sign-up on ONE screen (owner 2026-10-14)
 * Place at: src/public/pages/BecomeTransportProvider.js
 * Route: 'BecomeTransportProvider'
 *
 *  - asked: type (basi / lori / van), business name, vehicle plate and
 *    capacity, the main route (from -> to, place list); LATRA licence optional;
 *  - from the account, shown not asked: phone (also WhatsApp);
 *  - prices, more routes, schedules and the logo come after approval, on the
 *    provider dashboard ("Weka bei");
 *  - the ID screen appears only when no ID was sent or it was rejected; a
 *    waiting ID may apply and the request waits until it is verified;
 *  - an existing request shows its status instead of the form.
 * Boda and courier sign up as Wakala, not here.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import VerifyIdentityModal from '../components/VerifyIdentityModal';
import IntelligentLocationInput from '../components/IntelligentLocationInput';
import { identityState, needsIdentityStep, afterIdentitySent } from '../../utils/identityState';
import { WORK_ROLES, openWorkRole } from '../../utils/workRoles';
import useIdentityRefresh from '../../utils/useIdentityRefresh';
import api from '../../api/api';

const TYPES = ['bus', 'truck', 'van'];
const inp = { width: '100%', padding: '12px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' };
const label = { display: 'block', fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 6 };
const card = { backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: 14 };
const chip = (on) => ({ flex: 1, padding: '12px 8px', borderRadius: 12, fontSize: 13, fontWeight: 800, cursor: 'pointer',
  border: on ? '2px solid #1d4ed8' : '2px solid #e2e8f0', backgroundColor: on ? '#eff6ff' : '#fff', color: on ? '#1d4ed8' : '#1e293b' });
const primary = (on) => ({ width: '100%', padding: 14, border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800,
  background: on ? 'linear-gradient(135deg,#1d4ed8,#2563eb)' : '#94a3b8', color: '#fff', cursor: on ? 'pointer' : 'not-allowed' });

const TRANSPORT_ROLE = WORK_ROLES.find((r) => r.key === 'transport');

const BecomeTransportProvider = ({ onNavigate, isLoggedIn = true, currentUser, availableRoles = [], onSwitchAccountRole }) => {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(true);
  const [existing, setExisting] = useState(null);
  const [identityStatus, setIdentityStatus] = useState(null);
  useIdentityRefresh(setIdentityStatus, isLoggedIn);
  const [showVerifyIdentity, setShowVerifyIdentity] = useState(false);
  const [type, setType] = useState('');
  const [name, setName] = useState('');
  const [plate, setPlate] = useState('');
  const [capacityKg, setCapacityKg] = useState('');
  const [parcels, setParcels] = useState('');
  const [licence, setLicence] = useState('');
  const [fromText, setFromText] = useState(''); const [from, setFrom] = useState(null);
  const [toText, setToText] = useState(''); const [to, setTo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoggedIn) { setChecking(false); return; }
    api.get('/identity/me').then((r) => setIdentityStatus(r.data)).catch(() => setIdentityStatus({ status: 'not_submitted', level: 0 }));
    api.get('/transport/my-profile').then((r) => setExisting(r.data || null)).catch(() => setExisting(null)).finally(() => setChecking(false));
  }, [isLoggedIn]);
  useEffect(() => { if (currentUser) setName((prev) => prev || currentUser.storeName || ''); }, [currentUser]);

  const accountPhone = currentUser?.phone || '';
  const ready = !!type && name.trim().length >= 2 && plate.trim().length >= 3 && Number(capacityKg) > 0 && !!from?.placeRef && !!to?.placeRef;

  const submit = async () => {
    try {
      setSaving(true); setError('');
      const res = await api.post('/transport/register', {
        type, name: name.trim(), registrationNumber: licence.trim() || undefined,
        vehicle: { registrationPlate: plate.trim(), weightCapacityKg: Number(capacityKg), parcelCapacity: parcels ? Number(parcels) : undefined },
        route: { from: from.placeRef, to: to.placeRef },
      });
      setExisting({ ...(res.data || {}), status: res.data?.status || 'pending' });
      window.scrollTo(0, 0);
    } catch (e) {
      const m = e.response?.data?.message;
      setError(Array.isArray(m) ? m.join(', ') : (m || t('become_transport_provider.submit_failed')));
    } finally { setSaving(false); }
  };

  let body;
  if (checking || !identityStatus) {
    body = <div style={{ ...card, textAlign: 'center', color: '#64748b' }}>...</div>;
  } else if (existing && existing.status) {
    const s = existing.status;
    const waitingForId = s === 'pending' && identityState(identityStatus) !== 'verified';
    const approved = s === 'verified' || s === 'active';
    const title = approved ? t('transport_signup.status_approved_title')
      : s === 'pending' ? (waitingForId ? t('work_roles.status_waiting_id') : t('work_roles.status_waiting'))
      : s === 'rejected' ? t('transport_signup.status_rejected_title') : t('work_roles.status_suspended');
    const desc = approved ? t('transport_signup.status_approved_desc')
      : s === 'pending' ? (waitingForId ? t('transport_signup.status_waiting_id_desc') : t('transport_signup.status_waiting_desc'))
      : (existing.rejectionReason || t('transport_signup.status_contact_desc'));
    body = (
      <div data-testid="transport-status" style={{ ...card, textAlign: 'center' }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', margin: '4px 0 8px' }}>{title}</div>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 10px', lineHeight: 1.5 }}>{desc}</p>
        {approved && (
          <button onClick={() => openWorkRole({ role: TRANSPORT_ROLE, status: 'active', onNavigate, onSwitchAccountRole,
            roleRow: availableRoles.find((r) => r.roleType === TRANSPORT_ROLE.roleType) })} style={{ ...primary(true), width: 'auto', padding: '12px 24px' }}>
            {t('transport_signup.go_dashboard')}
          </button>
        )}
      </div>
    );
  } else if (needsIdentityStep(identityStatus)) {
    body = (
      <div data-testid="transport-identity-step" style={{ ...card, textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>{t('transport_signup.identity_title')}</div>
        <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, marginBottom: 16 }}>
          {identityState(identityStatus) === 'rejected' ? t('agent_signup.identity_rejected') : t('transport_signup.identity_desc')}
        </div>
        <button onClick={() => setShowVerifyIdentity(true)} style={primary(true)}>{t('agent_signup.identity_button')}</button>
      </div>
    );
  } else {
    body = (
      <div data-testid="transport-form" style={card}>
        {error && <div role="alert" style={{ backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>{error}</div>}
        {identityState(identityStatus) === 'waiting' && (
          <div role="status" style={{ backgroundColor: '#fef9c3', color: '#854d0e', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, lineHeight: 1.5 }}>
            <strong>{t('identity_state.waiting_title')}</strong><br />{t('transport_signup.identity_waiting_note')}
          </div>
        )}

        <label style={label}>{t('transport_signup.type_label')}</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {TYPES.map((v) => (
            <button key={v} type="button" aria-pressed={type === v} onClick={() => setType(v)} style={chip(type === v)}>
              {t(`transport_signup.type_${v}`)}
            </button>
          ))}
        </div>

        <label style={label}>{t('transport_signup.name_label')}</label>
        <input style={{ ...inp, marginBottom: 16 }} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('transport_signup.name_placeholder')} />

        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>{t('transport_signup.plate_label')}</label>
            <input style={inp} value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="T 123 ABC" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>{t('transport_signup.capacity_label')}</label>
            <input style={inp} type="number" inputMode="numeric" min="1" value={capacityKg} onChange={(e) => setCapacityKg(e.target.value)} placeholder="2000" />
          </div>
        </div>

        <IntelligentLocationInput label={t('transport_signup.from_label')} value={fromText} onTextChange={setFromText}
          onResolved={setFrom} placeholder={t('transport_signup.place_placeholder')} required />
        <IntelligentLocationInput label={t('transport_signup.to_label')} value={toText} onTextChange={setToText}
          onResolved={setTo} placeholder={t('transport_signup.place_placeholder')} required />

        <details style={{ marginBottom: 12 }}>
          <summary style={{ fontSize: 13, padding: '8px 0', cursor: 'pointer', color: '#1d4ed8', fontWeight: 700 }}>{t('transport_signup.more_details')}</summary>
          <label style={{ ...label, marginTop: 6 }}>{t('transport_signup.licence_label')}</label>
          <input style={{ ...inp, marginBottom: 12 }} value={licence} onChange={(e) => setLicence(e.target.value)} />
          <label style={label}>{t('transport_signup.parcels_label')}</label>
          <input style={inp} type="number" inputMode="numeric" min="1" value={parcels} onChange={(e) => setParcels(e.target.value)} />
        </details>

        <div data-testid="transport-account-line" style={{ fontSize: 12, color: '#475569', margin: '4px 0 6px' }}>
          {t('transport_signup.phone_from_account', { phone: accountPhone || '-' })}
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>{t('transport_signup.prices_later')}</div>

        <button type="button" disabled={saving || !ready} onClick={submit} style={primary(!saving && ready)}>
          {saving ? t('transport_signup.submitting') : t('transport_signup.submit')}
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('back')} title={t('become_transport_provider.page_title')} top={0} />
      <div style={{ flex: 1, padding: '16px 16px 140px', maxWidth: 560, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {body}
      </div>
      {showVerifyIdentity && (
        <VerifyIdentityModal onClose={() => setShowVerifyIdentity(false)}
          onVerified={() => { setShowVerifyIdentity(false); setIdentityStatus((prev) => afterIdentitySent(prev)); }} />
      )}
    </div>
  );
};

export default BecomeTransportProvider;
