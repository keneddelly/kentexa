/**
 * PartnerInvite.js — the join page for a Super Agent's partner invitation.
 * URL: kentexa.com/?partnerInvite=<signed token> (sent by WhatsApp or the sender's own SMS).
 * Public: shows the waybill summary (never the recipient's details). Joining needs login,
 * then the normal transport / office application; an admin still approves it as usual,
 * and the waybill is not assigned automatically.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';

const DARK = '#0f172a';
const GREY = '#475569';
const LINE = '#e2e8f0';
const BLUE = '#1d4ed8';
const card = { backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 14 };
const button = { width: '100%', minHeight: 48, borderRadius: 12, border: 'none', backgroundColor: BLUE, color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' };

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: `1px solid ${LINE}`, fontSize: 14 }}>
      <div style={{ width: 96, flexShrink: 0, color: GREY }}>{label}</div>
      <div style={{ flex: 1, minWidth: 0, color: DARK, fontWeight: 600, overflowWrap: 'anywhere' }}>{children}</div>
    </div>
  );
}

const APPLY_PAGE = { transport_provider: 'BecomeTransportProvider', super_agent: 'BecomeSuperAgentInfo' };

const PartnerInvite = ({ token, isLoggedIn, onNavigate }) => {
  const { t } = useTranslation();
  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    api.get(`/partner-invitations/link/${encodeURIComponent(token || '')}`)
      .then((r) => { if (alive) { setView(r.data); setDone(['joined', 'confirmed'].includes(r.data?.status)); } })
      .catch((e) => { if (alive) setError(t(e?.response?.status === 410 ? 'partner_invite.expired' : 'partner_invite.invalid')); });
    return () => { alive = false; };
  }, [token, t]);

  const join = async () => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; } // the URL keeps the token; login brings them back here
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/partner-invitations/link/${encodeURIComponent(token)}/accept`);
      if (data?.next === 'apply') onNavigate(APPLY_PAGE[data.roleOffered] || 'Home');
      else setDone(true);
    } catch (e) {
      const status = e?.response?.status;
      setError(status === 403 ? t('partner_invite.wrong_phone') : status === 409 ? t('partner_invite.used')
        : status === 410 ? t('partner_invite.expired') : t('partner_invite.failed'));
    } finally { setBusy(false); }
  };

  const page = (children) => (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <div data-testid="partner-invite" style={{ padding: '24px 16px', maxWidth: 480, margin: '0 auto', boxSizing: 'border-box' }}>{children}</div>
    </div>
  );

  if (error && !view) {
    return page(
      <div role="alert" style={{ ...card, textAlign: 'center' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: DARK, margin: '0 0 8px' }}>{t('partner_invite.invalid_title')}</h2>
        <p style={{ fontSize: 14, color: GREY, margin: 0, lineHeight: 1.5 }}>{error}</p>
      </div>,
    );
  }
  if (!view) return page(<div style={{ ...card, color: GREY, fontSize: 14 }}>{t('partner_invite.loading')}</div>);

  const role = view.roleOffered === 'super_agent' ? t('partner_invite.role_hub') : t('partner_invite.role_transport');
  const w = view.waybill || {};
  return page(
    <>
      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 800, color: BLUE, textTransform: 'uppercase', marginBottom: 6 }}>{t('partner_invite.kicker')}</div>
        <h1 style={{ fontSize: 20, fontWeight:800, color: DARK, margin: '0 0 6px', lineHeight: 1.3 }}>
          {t('partner_invite.title', { office: view.invitedBy?.officeName || '—', role })}
        </h1>
        <p style={{ fontSize: 14, color: GREY, margin: 0, lineHeight: 1.5 }}>{t('partner_invite.intro')}</p>
      </div>
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 800, color: DARK, marginBottom: 4 }}>{t('partner_invite.waybill_title')}</div>
        <Row label={t('partner_invite.waybill')}>{w.waybillNumber}</Row>
        {(w.originCity || w.destinationCity) && <Row label={t('partner_invite.route')}>{w.originCity || '—'} → {w.destinationCity || '—'}</Row>}
        {w.weightKg != null && <Row label={t('partner_invite.weight')}>{w.weightKg} kg</Row>}
        <Row label={t('partner_invite.from')}>{[view.invitedBy?.officeName, view.invitedBy?.city].filter(Boolean).join(', ')}</Row>
      </div>
      {done ? (
        <div role="status" style={{ ...card, borderLeft: '4px solid #16a34a' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: DARK, marginBottom: 4 }}>{t('partner_invite.joined_title')}</div>
          <div style={{ fontSize: 14, color: GREY, lineHeight: 1.5 }}>{t('partner_invite.joined_body')}</div>
        </div>
      ) : (
        <div style={card}>
          {error && <div role="alert" style={{ fontSize: 13, color: '#b91c1c', marginBottom: 10 }}>{error}</div>}
          <button type="button" onClick={join} disabled={busy} style={{ ...button, opacity: busy ? 0.7 : 1 }}>
            {busy ? t('partner_invite.working') : t('partner_invite.join_as', { role })}
          </button>
          <p style={{ fontSize: 12, color: GREY, margin: '10px 0 0', lineHeight: 1.5 }}>
            {isLoggedIn ? t('partner_invite.note') : t('partner_invite.login_first')}
          </p>
        </div>
      )}
    </>,
  );
};

export default PartnerInvite;
