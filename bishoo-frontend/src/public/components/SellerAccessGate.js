/**
 * SellerAccessGate.js — rendered by App.js INSTEAD OF any seller-back-
 * office page (SellerDashboard, SellerProducts, POS, StoreSettings, etc.)
 * when the logged-in account's identity level is 0. Closes every entry
 * point at once (Quick Actions tile, direct deep link, bottom nav) since
 * the gate lives at the router level, not scattered per-page.
 *
 * This is deliberately about IDENTITY verification (NIDA/passport/etc.),
 * not seller approval — a level-1 (identity submitted/pending) account
 * already passes this gate and reaches the real page, which is what
 * decides separately whether any given action needs a further-approved
 * seller (see VerificationService.getLevel()/requireFeature() on the
 * backend — this frontend gate mirrors that same identity-first
 * distinction, just earlier in the flow).
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from './BackBar';
import VerifyIdentityModal from './VerifyIdentityModal';

const SellerAccessGate = ({ onNavigate, identityStatus, onVerified }) => {
  const { t } = useTranslation();
  const [showVerify, setShowVerify] = useState(false);
  const rejected = identityStatus?.status === 'rejected';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('MyProfile')} title="" top={0} />
      <div style={{ maxWidth: 480, margin: '40px auto', padding: '0 16px' }}>
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24,
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🪪</div>
          <div style={{ fontSize: 17, fontWeight: 900, color: '#1e293b', marginBottom: 10 }}>
            {rejected ? t('become_seller.identity_rejected_title') : t('seller_access_gate.title')}
          </div>
          <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6,
            marginBottom: identityStatus?.rejectionReason ? 10 : 22 }}>
            {rejected ? t('seller_access_gate.desc_rejected') : t('seller_access_gate.desc_not_submitted')}
          </div>
          {rejected && identityStatus?.rejectionReason && (
            <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px',
              borderRadius: 10, marginBottom: 22, fontSize: 12.5, textAlign: 'left' }}>
              {t('seller_access_gate.rejected_reason', { reason: identityStatus.rejectionReason })}
            </div>
          )}
          <button onClick={() => setShowVerify(true)}
            style={{ background: 'linear-gradient(135deg,#667eea,#764ba2)', color: '#fff', border: 'none',
              padding: '13px 28px', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 800,
              boxShadow: '0 4px 12px rgba(102,126,234,0.4)' }}>
            {t('seller_access_gate.verify_button')}
          </button>
        </div>
      </div>

      {showVerify && (
        <VerifyIdentityModal
          onClose={() => setShowVerify(false)}
          onVerified={() => { setShowVerify(false); onVerified(); }}
        />
      )}
    </div>
  );
};

export default SellerAccessGate;
