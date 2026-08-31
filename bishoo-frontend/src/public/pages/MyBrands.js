/**
 * MyBrands.js — Brand & Authorization Network (seller side)
 *
 * Lets a business request, track, and manage its authorized-reseller
 * relationships with real brands (LG, Samsung, Hisense, ...). Never shows
 * a badge from a free-text claim — every status here is server-computed
 * from BusinessBrandAuthorization (src/brands/), reviewed by Kentexa admin.
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';

const STATUS_STYLE = {
  pending:   { bg: '#fef9c3', color: '#ca8a04' },
  approved:  { bg: '#dcfce7', color: '#16a34a' },
  rejected:  { bg: '#fee2e2', color: '#dc2626' },
  suspended: { bg: '#ffedd5', color: '#c2410c' },
  expired:   { bg: '#f1f5f9', color: '#64748b' },
  revoked:   { bg: '#fee2e2', color: '#dc2626' },
};

const MyBrands = ({ onNavigate, activeProfileId }) => {
  const { t } = useTranslation();
  const [authorizations, setAuthorizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [brandQuery, setBrandQuery] = useState('');
  const [brandResults, setBrandResults] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [distributors, setDistributors] = useState([]);
  const [form, setForm] = useState({
    distributorId: '', categoryScope: '', modelScope: '', geographicScope: '',
    authorizationNumber: '', issuedDate: '', expiresAt: '',
  });
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchMine = async () => {
    if (!activeProfileId) { setLoading(false); return; }
    try {
      setLoading(true);
      const res = await api.get('/brand-authorizations/mine', { params: { commerceProfileId: activeProfileId } });
      setAuthorizations(res.data || []);
    } catch { setError(t('my_brands.load_failed')); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchMine(); }, [activeProfileId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.get('/distributors').then(r => setDistributors(r.data || [])).catch(() => setDistributors([]));
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      api.get('/brands', { params: brandQuery ? { search: brandQuery } : {} })
        .then(r => setBrandResults(r.data || []))
        .catch(() => setBrandResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [brandQuery]);

  const resetForm = () => {
    setShowForm(false); setSelectedBrand(null); setBrandQuery(''); setEvidenceFile(null);
    setForm({ distributorId: '', categoryScope: '', modelScope: '', geographicScope: '', authorizationNumber: '', issuedDate: '', expiresAt: '' });
  };

  const handleSubmit = async () => {
    if (!selectedBrand) { setError(t('my_brands.pick_brand_error')); return; }
    setSubmitting(true); setError('');
    try {
      const res = await api.post('/brand-authorizations', {
        commerceProfileId: activeProfileId,
        brandId: selectedBrand.id,
        distributorId: form.distributorId ? Number(form.distributorId) : undefined,
        categoryScope: form.categoryScope || undefined,
        modelScope: form.modelScope ? form.modelScope.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        geographicScope: form.geographicScope ? form.geographicScope.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        authorizationNumber: form.authorizationNumber || undefined,
        issuedDate: form.issuedDate || undefined,
        expiresAt: form.expiresAt || undefined,
      });

      if (evidenceFile) {
        const fd = new FormData();
        fd.append('file', evidenceFile);
        const upload = await api.post('/upload/digital-file', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        await api.post(`/brand-authorizations/${res.data.id}/evidence`, {
          documentType: 'other',
          cloudinaryPublicId: upload.data.publicId,
          format: upload.data.format,
        });
      }

      setMessage(t('my_brands.submitted_msg', { brand: selectedBrand.name }));
      resetForm();
      fetchMine();
    } catch (err) {
      setError(err?.response?.data?.message || t('my_brands.submit_failed'));
    } finally { setSubmitting(false); }
  };

  const grouped = {
    approved:  authorizations.filter(a => a.status === 'approved'),
    pending:   authorizations.filter(a => a.status === 'pending'),
    other:     authorizations.filter(a => !['approved', 'pending'].includes(a.status)),
  };

  const renderCard = (a) => {
    const sc = STATUS_STYLE[a.status] || STATUS_STYLE.pending;
    return (
      <div key={a.id} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {a.brand?.logoUrl && <img src={a.brand.logoUrl} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} />}
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{a.brand?.name}</div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 20, backgroundColor: sc.bg, color: sc.color, textTransform: 'uppercase' }}>
            {t(`my_brands.status_${a.status}`)}
          </span>
        </div>
        {a.categoryScope && <div style={{ fontSize: 12, color: '#64748b' }}>{t('my_brands.category_label')}: {a.categoryScope}</div>}
        {a.geographicScope?.length > 0 && <div style={{ fontSize: 12, color: '#64748b' }}>{t('my_brands.regions_label')}: {a.geographicScope.join(', ')}</div>}
        {a.expiresAt && <div style={{ fontSize: 12, color: '#64748b' }}>{t('my_brands.expires_label')}: {new Date(a.expiresAt).toLocaleDateString()}</div>}
        {a.statusReason && ['rejected', 'suspended', 'revoked'].includes(a.status) && (
          <div style={{ marginTop: 6, fontSize: 12, color: '#dc2626' }}>{a.statusReason}</div>
        )}
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
      <BackBar onBack={() => onNavigate('back')} title={t('my_brands.title')}
        right={<button onClick={() => setShowForm(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#1d4ed8', fontWeight: 700 }}>+ {t('my_brands.request_button')}</button>} />

      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {error && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, fontSize: 12, marginBottom: 12 }}>{error}</div>}
        {message && <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '10px 14px', borderRadius: 10, fontSize: 12, marginBottom: 12 }}>{message}</div>}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>{t('my_brands.loading')}</div>
        ) : authorizations.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 50, backgroundColor: '#fff', borderRadius: 16 }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🏷️</div>
            <p style={{ color: '#64748b', fontSize: 13 }}>{t('my_brands.empty_state')}</p>
          </div>
        ) : (
          <>
            {grouped.approved.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#16a34a', marginBottom: 8, textTransform: 'uppercase' }}>{t('my_brands.section_authorized')}</div>
                {grouped.approved.map(renderCard)}
              </div>
            )}
            {grouped.pending.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#ca8a04', marginBottom: 8, textTransform: 'uppercase' }}>{t('my_brands.section_pending')}</div>
                {grouped.pending.map(renderCard)}
              </div>
            )}
            {grouped.other.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>{t('my_brands.section_other')}</div>
                {grouped.other.map(renderCard)}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── REQUEST FORM MODAL ── */}
      {showForm && (
        <div onClick={resetForm} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 3000 }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 900 }}>{t('my_brands.request_title')}</div>
              <button onClick={resetForm} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#64748b' }}>×</button>
            </div>

            <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>{t('my_brands.brand_label')} *</label>
            {selectedBrand ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 10, border: '2px solid #1d4ed8', backgroundColor: '#eff6ff', marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{selectedBrand.name}</span>
                <button onClick={() => setSelectedBrand(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>×</button>
              </div>
            ) : (
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <input value={brandQuery} onChange={e => setBrandQuery(e.target.value)}
                  placeholder={t('my_brands.search_brand_placeholder')}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
                {brandResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4, zIndex: 20, maxHeight: 220, overflowY: 'auto' }}>
                    {brandResults.map(b => (
                      <div key={b.id} onClick={() => { setSelectedBrand(b); setBrandResults([]); }}
                        style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 13, fontWeight: 600 }}>
                        {b.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>{t('my_brands.distributor_label')}</label>
            <select value={form.distributorId} onChange={e => setForm(f => ({ ...f, distributorId: e.target.value }))}
              style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }}>
              <option value="">{t('my_brands.distributor_none')}</option>
              {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>

            <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>{t('my_brands.category_scope_label')}</label>
            <input value={form.categoryScope} onChange={e => setForm(f => ({ ...f, categoryScope: e.target.value }))}
              placeholder={t('my_brands.category_scope_placeholder')}
              style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }} />

            <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>{t('my_brands.model_scope_label')}</label>
            <input value={form.modelScope} onChange={e => setForm(f => ({ ...f, modelScope: e.target.value }))}
              placeholder={t('my_brands.model_scope_placeholder')}
              style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }} />

            <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>{t('my_brands.region_scope_label')}</label>
            <input value={form.geographicScope} onChange={e => setForm(f => ({ ...f, geographicScope: e.target.value }))}
              placeholder={t('my_brands.region_scope_placeholder')}
              style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }} />

            <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>{t('my_brands.evidence_label')}</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setEvidenceFile(e.target.files?.[0] || null)}
              style={{ width: '100%', marginBottom: 4, fontSize: 13 }} />
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>{t('my_brands.evidence_hint')}</div>

            <button onClick={handleSubmit} disabled={submitting || !selectedBrand}
              style={{ width: '100%', padding: 14, background: !selectedBrand ? '#94a3b8' : '#1d4ed8', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 900 }}>
              {submitting ? t('my_brands.submitting') : t('my_brands.submit_button')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyBrands;
