/**
 * SellerWarrantyClaims.js — a seller's review queue for warranty claims
 * filed against their own sales (spec §15). Deliberately a separate,
 * simpler lifecycle from order disputes — no escrow/payout involvement.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';

const STATUS_META = {
  submitted:    { color: '#ca8a04', bg: '#fef9c3' },
  under_review: { color: '#1d4ed8', bg: '#eff6ff' },
  approved:     { color: '#16a34a', bg: '#f0fdf4' },
  rejected:     { color: '#dc2626', bg: '#fee2e2' },
  resolved:     { color: '#16a34a', bg: '#f0fdf4' },
};

// Every claim this seller can act on is reached through GET /warranty/mine
// registrations first — but claims themselves aren't listed in bulk by
// seller anywhere on the backend (spec deliberately kept the review
// surface per-registration, matching MyWarranties.js's own shape). This
// page fetches the seller's completed orders with a registered warranty
// and drills into each one's claims — no new bulk "my claims" endpoint
// needed since GET /warranty/:id/claims already authorizes the seller.
const SellerWarrantyClaims = ({ onNavigate, registrationId: initialRegistrationId }) => {
  const { t } = useTranslation();
  // Pre-filled and auto-looked-up when reached via a "new claim filed"
  // notification (WarrantyService.fileClaim()'s actionParam is the
  // registration id) — see App.js's SellerWarrantyClaims-:id boot route.
  const [registrationId, setRegistrationId] = useState(initialRegistrationId || '');
  const [registration, setRegistration] = useState(null);
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [reviewFor, setReviewFor] = useState(null); // claim being reviewed
  const [reviewStatus, setReviewStatus] = useState('approved');
  const [reviewResolution, setReviewResolution] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);

  const lookup = async () => {
    const id = parseInt(registrationId, 10);
    if (!id) { setError(t('seller_warranty_claims.enter_valid_id')); return; }
    try {
      setLoading(true);
      setError('');
      const [regRes, claimsRes] = await Promise.all([
        api.get(`/warranty/${id}`),
        api.get(`/warranty/${id}/claims`),
      ]);
      setRegistration(regRes.data);
      setClaims(claimsRes.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || t('seller_warranty_claims.lookup_failed'));
      setRegistration(null);
      setClaims([]);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (initialRegistrationId) lookup();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openReview = (claim) => {
    setReviewFor(claim);
    setReviewStatus('approved');
    setReviewResolution('');
  };

  const submitReview = async () => {
    if (!reviewFor) return;
    try {
      setReviewSaving(true);
      await api.patch(`/warranty/claims/${reviewFor.id}/review`, {
        status: reviewStatus,
        resolution: reviewResolution.trim() || undefined,
      });
      setMessage(t('seller_warranty_claims.review_saved'));
      setReviewFor(null);
      lookup();
    } catch (err) {
      setError(err?.response?.data?.message || t('seller_warranty_claims.review_failed'));
    } finally { setReviewSaving(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
      <BackBar onBack={() => onNavigate('back')} title={`🛡️ ${t('seller_warranty_claims.title')}`} top={0} />
      <div style={{ padding: 16, maxWidth: 640, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>{t('seller_warranty_claims.intro')}</p>

        {message && <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '10px 14px', borderRadius: 10, fontSize: 12, marginBottom: 12 }}>{message}</div>}
        {error && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, fontSize: 12, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <input
            value={registrationId}
            onChange={e => setRegistrationId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && lookup()}
            placeholder={t('seller_warranty_claims.id_placeholder')}
            style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }}
          />
          <button onClick={lookup} disabled={loading}
            style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 10, padding: '0 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {t('seller_warranty_claims.lookup_button')}
          </button>
        </div>

        {registration && (
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{t('seller_warranty_claims.order_label', { id: registration.orderId })}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              {t('seller_warranty_claims.expires_label', { date: new Date(registration.expiresAt).toLocaleDateString() })}
            </div>
          </div>
        )}

        {claims.map(claim => {
          const meta = STATUS_META[claim.status] || STATUS_META.submitted;
          return (
            <div key={claim.id} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 13, color: '#0f172a', flex: 1 }}>{claim.reason}</div>
                <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 20, color: meta.color, backgroundColor: meta.bg, whiteSpace: 'nowrap' }}>
                  {t(`seller_warranty_claims.status_${claim.status}`)}
                </span>
              </div>
              {claim.evidenceImages?.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {claim.evidenceImages.map((img, i) => (
                    <img key={i} src={img} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', cursor: 'pointer' }}
                      onClick={() => window.open(img, '_blank')} />
                  ))}
                </div>
              )}
              {claim.resolution && (
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>{t('seller_warranty_claims.resolution_label')}: {claim.resolution}</div>
              )}
              {!['approved', 'rejected', 'resolved'].includes(claim.status) && (
                <button onClick={() => openReview(claim)}
                  style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 8, border: '1px solid #93c5fd', backgroundColor: '#eff6ff', color: '#1d4ed8', cursor: 'pointer' }}>
                  {t('seller_warranty_claims.review_button')}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {reviewFor && (
        <div onClick={() => setReviewFor(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 2000 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: '#fff', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 480, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 900 }}>{t('seller_warranty_claims.review_title')}</div>
              <button onClick={() => setReviewFor(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#64748b' }}>×</button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {['under_review', 'approved', 'rejected', 'resolved'].map(s => (
                <button key={s} onClick={() => setReviewStatus(s)}
                  style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: reviewStatus === s ? '2px solid #1d4ed8' : '1px solid #e2e8f0',
                    backgroundColor: reviewStatus === s ? '#eff6ff' : '#fff', color: reviewStatus === s ? '#1d4ed8' : '#64748b',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  {t(`seller_warranty_claims.status_${s}`)}
                </button>
              ))}
            </div>

            <textarea
              value={reviewResolution}
              onChange={e => setReviewResolution(e.target.value)}
              placeholder={t('seller_warranty_claims.resolution_placeholder')}
              rows={3}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', marginBottom: 14, resize: 'vertical' }}
            />

            <button onClick={submitReview} disabled={reviewSaving}
              style={{ width: '100%', padding: 14, background: reviewSaving ? '#93c5fd' : 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 900 }}>
              {reviewSaving ? t('seller_warranty_claims.saving') : t('seller_warranty_claims.save_review_button')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SellerWarrantyClaims;
