/**
 * MyBusinesses.js — Business-First Frontend Stage 1.
 *
 * "My Businesses" list, driven entirely by GET /business/mine/all. Must
 * already render correctly for 0, 1, or many Businesses even though
 * production today has no multi-Business user — the UI is structurally
 * ready ahead of any real multi-Business account existing.
 *
 * Creating a Business here uses the existing, live POST /business/create
 * (Business-First Stage 1) directly -- never fabricates a Seller/Transport/
 * SuperAgent profile. Business creation does not grant any operational
 * capability by itself; the new Business simply appears with whatever
 * capability state its default workspace already has (usually none yet).
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import { getMyBusinesses, createBusiness } from '../../api/business';

const B = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';

const Card = ({ children, style = {} }) => (
  <div style={{ backgroundColor: WH, borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 12, ...style }}>
    {children}
  </div>
);

const MyBusinesses = ({ onNavigate, isLoggedIn }) => {
  const { t } = useTranslation();
  const [businesses, setBusinesses] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ legalName: '', category: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const load = () => {
    setError('');
    setBusinesses(null);
    getMyBusinesses()
      .then(setBusinesses)
      .catch(() => setError(t('my_businesses.load_failed')));
  };

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    if (!form.legalName.trim()) { setCreateError(t('my_businesses.name_required')); return; }
    try {
      setCreating(true); setCreateError('');
      const created = await createBusiness({ legalName: form.legalName, category: form.category || undefined });
      setShowCreate(false);
      setForm({ legalName: '', category: '' });
      load();
      if (created?.id) onNavigate(`BusinessHome-${created.id}`);
    } catch (err) {
      setCreateError(err?.response?.data?.message || t('my_businesses.create_failed'));
    } finally { setCreating(false); }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('back')} title={t('my_businesses.title')} top={0} />

      <div style={{ padding: 16, maxWidth: 560, margin: '0 auto' }}>
        {businesses === null && !error && (
          <div style={{ padding: '48px 0', textAlign: 'center', color: GR }}>⏳ {t('common.loading')}</div>
        )}

        {error && (
          <Card>
            <div style={{ textAlign: 'center', color: GR, padding: '12px 0' }}>
              {error}
              <div style={{ marginTop: 12 }}>
                <button onClick={load}
                  style={{ background: B, color: WH, border: 'none', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                  {t('common.try_again')}
                </button>
              </div>
            </div>
          </Card>
        )}

        {businesses && businesses.length === 0 && (
          <Card>
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 44, marginBottom: 10 }}>🏢</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: DK, marginBottom: 6 }}>{t('my_businesses.empty_title')}</div>
              <div style={{ fontSize: 12, color: GR }}>{t('my_businesses.empty_desc')}</div>
            </div>
          </Card>
        )}

        {businesses && businesses.map((b) => (
          <Card key={b.id} style={{ cursor: 'pointer' }}>
            <div onClick={() => onNavigate(`BusinessHome-${b.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#EFF6FF',
                display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                {b.logo ? <img src={b.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 22 }}>🏢</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: DK }}>{b.tradingName || b.legalName}</div>
                <div style={{ fontSize: 11, color: GR, marginTop: 2 }}>
                  {b.status === 'active' ? t('my_businesses.status_active') : b.status}
                </div>
              </div>
              <span style={{ fontSize: 16, color: '#CBD5E1' }}>›</span>
            </div>
          </Card>
        ))}

        {businesses && !showCreate && (
          <button onClick={() => setShowCreate(true)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
              borderRadius: 14, border: '1.5px dashed #93C5FD', backgroundColor: '#F8FAFC', cursor: 'pointer', marginTop: 4 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#EFF6FF', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 20, color: B, flexShrink: 0 }}>+</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: B }}>{t('my_businesses.create_button')}</div>
          </button>
        )}

        {showCreate && (
          <Card>
            <div style={{ fontSize: 14, fontWeight: 800, color: DK, marginBottom: 12 }}>{t('my_businesses.create_title')}</div>
            {createError && (
              <div role="alert" style={{ backgroundColor: '#FEE2E2', color: '#B91C1C', padding: '9px 10px', borderRadius: 8, marginBottom: 10, fontSize: 12, fontWeight: 700 }}>
                {createError}
              </div>
            )}
            <input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })}
              placeholder={t('my_businesses.name_placeholder')}
              style={{ width: '100%', padding: '11px 12px', borderRadius: 8, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', marginBottom: 10 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowCreate(false); setCreateError(''); }} disabled={creating}
                style={{ flex: 1, background: '#F1F5F9', color: DK, border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                {t('common.cancel')}
              </button>
              <button onClick={handleCreate} disabled={creating}
                style={{ flex: 1, background: creating ? '#94a3b8' : B, color: WH, border: 'none', padding: 12, borderRadius: 10, cursor: creating ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 800 }}>
                {creating ? t('my_businesses.creating') : t('my_businesses.create_button')}
              </button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default MyBusinesses;
