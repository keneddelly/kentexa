/**
 * MyWarranties.js — buyer's own warranty registrations (spec §15).
 * Registration itself happens from MyOrders.js's completed-order row; this
 * page lists what's already registered and lets a buyer file a claim.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';

const STATUS_META = {
  active:  { color: '#16a34a', bg: '#f0fdf4' },
  expired: { color: '#94a3b8', bg: '#f1f5f9' },
  void:    { color: '#dc2626', bg: '#fee2e2' },
};

const CLAIM_STATUS_META = {
  submitted:    { color: '#ca8a04', bg: '#fef9c3' },
  under_review: { color: '#1d4ed8', bg: '#eff6ff' },
  approved:     { color: '#16a34a', bg: '#f0fdf4' },
  rejected:     { color: '#dc2626', bg: '#fee2e2' },
  resolved:     { color: '#16a34a', bg: '#f0fdf4' },
};

const MyWarranties = ({ onNavigate, registrationId: highlightRegistrationId }) => {
  const { t } = useTranslation();
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [claimsFor, setClaimsFor] = useState(null); // registration currently expanded
  const [claims, setClaims] = useState([]);
  const [claimsLoading, setClaimsLoading] = useState(false);

  const [claimModalFor, setClaimModalFor] = useState(null); // registration id
  const [claimReason, setClaimReason] = useState('');
  const [claimImages, setClaimImages] = useState([]);
  const [claimUploading, setClaimUploading] = useState(false);
  const [claimSaving, setClaimSaving] = useState(false);

  useEffect(() => {
    api.get('/warranty/mine')
      .then(r => {
        setRegistrations(r.data || []);
        // Reached via a claim-status-update notification
        // (WarrantyService.reviewClaim()'s actionParam) — auto-expand
        // that registration's claims instead of leaving the buyer to
        // find it in the list themselves.
        if (highlightRegistrationId) {
          const match = (r.data || []).find(reg => String(reg.id) === String(highlightRegistrationId));
          if (match) toggleClaims(match);
        }
      })
      .catch(() => setError(t('my_warranties.load_failed')))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleClaims = (registration) => {
    if (claimsFor === registration.id) { setClaimsFor(null); return; }
    setClaimsFor(registration.id);
    setClaimsLoading(true);
    api.get(`/warranty/${registration.id}/claims`)
      .then(r => setClaims(r.data || []))
      .catch(() => setClaims([]))
      .finally(() => setClaimsLoading(false));
  };

  const openClaimModal = (registrationId) => {
    setClaimModalFor(registrationId);
    setClaimReason('');
    setClaimImages([]);
  };

  const handleClaimImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    try {
      setClaimUploading(true);
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      const res = await api.post('/upload/images', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setClaimImages(prev => [...prev, ...res.data.urls]);
    } catch { setError(t('my_warranties.image_upload_failed')); }
    finally { setClaimUploading(false); }
  };

  const submitClaim = async () => {
    if (!claimReason.trim()) { setError(t('my_warranties.claim_reason_required')); return; }
    try {
      setClaimSaving(true);
      await api.post(`/warranty/${claimModalFor}/claims`, { reason: claimReason.trim(), evidenceImages: claimImages });
      setMessage(t('my_warranties.claim_filed'));
      const filedFor = claimModalFor;
      setClaimModalFor(null);
      if (claimsFor === filedFor) {
        setClaimsLoading(true);
        api.get(`/warranty/${filedFor}/claims`)
          .then(r => setClaims(r.data || []))
          .catch(() => {})
          .finally(() => setClaimsLoading(false));
      }
    } catch (err) {
      setError(err?.response?.data?.message || t('my_warranties.claim_file_failed'));
    } finally { setClaimSaving(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
      <BackBar onBack={() => onNavigate('back')} title={`🛡️ ${t('my_warranties.title')}`} top={0} />
      <div style={{ padding: 16, maxWidth: 640, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {message && <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '10px 14px', borderRadius: 10, fontSize: 12, marginBottom: 12 }}>{message}</div>}
        {error && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, fontSize: 12, marginBottom: 12 }}>{error}</div>}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>{t('my_warranties.loading')}</div>
        ) : registrations.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🛡️</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>{t('my_warranties.no_warranties_desc')}</div>
          </div>
        ) : (
          registrations.map(reg => {
            const meta = STATUS_META[reg.status] || STATUS_META.active;
            return (
              <div key={reg.id} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{t('my_warranties.order_label', { id: reg.orderId })}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      {t('my_warranties.expires_label', { date: new Date(reg.expiresAt).toLocaleDateString() })}
                    </div>
                    {reg.serialNumber && (
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, fontFamily: 'monospace' }}>{reg.serialNumber}</div>
                    )}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 20, color: meta.color, backgroundColor: meta.bg }}>
                    {t(`my_warranties.status_${reg.status}`)}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {reg.status === 'active' && (
                    <button onClick={() => openClaimModal(reg.id)}
                      style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 8, border: '1px solid #fecaca', backgroundColor: '#fee2e2', color: '#dc2626', cursor: 'pointer' }}>
                      {t('my_warranties.file_claim_button')}
                    </button>
                  )}
                  <button onClick={() => toggleClaims(reg)}
                    style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', color: '#334155', cursor: 'pointer' }}>
                    {claimsFor === reg.id ? t('my_warranties.hide_claims_button') : t('my_warranties.view_claims_button')}
                  </button>
                </div>

                {claimsFor === reg.id && (
                  <div style={{ marginTop: 12, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                    {claimsLoading ? (
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{t('my_warranties.loading')}</div>
                    ) : claims.length === 0 ? (
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{t('my_warranties.no_claims_yet')}</div>
                    ) : (
                      claims.map(claim => {
                        const cMeta = CLAIM_STATUS_META[claim.status] || CLAIM_STATUS_META.submitted;
                        return (
                          <div key={claim.id} style={{ padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                              <div style={{ fontSize: 12, color: '#0f172a', flex: 1 }}>{claim.reason}</div>
                              <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 20, color: cMeta.color, backgroundColor: cMeta.bg, whiteSpace: 'nowrap' }}>
                                {t(`my_warranties.claim_status_${claim.status}`)}
                              </span>
                            </div>
                            {claim.resolution && (
                              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{t('my_warranties.resolution_label')}: {claim.resolution}</div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {claimModalFor && (
        <div onClick={() => setClaimModalFor(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 2000 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: '#fff', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 900 }}>{t('my_warranties.file_claim_title')}</div>
              <button onClick={() => setClaimModalFor(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#64748b' }}>×</button>
            </div>

            <textarea
              value={claimReason}
              onChange={e => setClaimReason(e.target.value)}
              placeholder={t('my_warranties.claim_reason_placeholder')}
              rows={4}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', marginBottom: 12, resize: 'vertical' }}
            />

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {claimImages.map((img, i) => (
                <img key={i} src={img} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />
              ))}
            </div>
            <input type="file" accept="image/*" multiple onChange={handleClaimImageUpload} style={{ marginBottom: 16, fontSize: 12 }} disabled={claimUploading} />

            <button onClick={submitClaim} disabled={claimSaving || claimUploading}
              style={{ width: '100%', padding: 14, background: claimSaving ? '#93c5fd' : 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 900 }}>
              {claimSaving ? t('my_warranties.submitting') : t('my_warranties.submit_claim_button')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyWarranties;
