/**
 * BrandDashboard.js — read-only visibility for a brand's own identity
 * (src/brands/ Phase C). Every number here is a plain aggregate over data
 * that's already the real source of truth elsewhere. The warranty
 * registrations tile was originally omitted (no warranty system existed
 * yet anywhere in Kentexa) — Phase F (src/warranty/) built that system,
 * so it's now a real count, not a fabricated one.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';

const StatCard = ({ icon, label, value, color, bg }) => (
  <div style={{ backgroundColor: bg || '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
    <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
    <div style={{ fontSize: 22, fontWeight: 900, color: color || '#0f172a' }}>{value}</div>
    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginTop: 2 }}>{label}</div>
  </div>
);

const BrandDashboard = ({ onNavigate, activeProfileId, activeProfile }) => {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!activeProfileId) { setLoading(false); return; }
    api.get(`/brands/dashboard/${activeProfileId}`)
      .then(r => setData(r.data))
      .catch(() => setError(t('brand_dashboard.load_failed')))
      .finally(() => setLoading(false));
  }, [activeProfileId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
      <BackBar onBack={() => onNavigate('back')} title={activeProfile?.displayName || t('brand_dashboard.title')} top={0} />
      <div style={{ padding: 16, maxWidth: 640, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {error && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, fontSize: 12, marginBottom: 12 }}>{error}</div>}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>{t('brand_dashboard.loading')}</div>
        ) : !data ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>{t('brand_dashboard.load_failed')}</div>
        ) : (
          <>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase' }}>
              {t('brand_dashboard.authorized_businesses_section')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              <StatCard icon="🏪" label={t('brand_dashboard.total_label')} value={data.authorizedBusinesses.total} />
              <StatCard icon="✅" label={t('brand_dashboard.active_label')} value={data.authorizedBusinesses.approved} color="#16a34a" bg="#f0fdf4" />
              <StatCard icon="⏳" label={t('brand_dashboard.pending_label')} value={data.authorizedBusinesses.pending} color="#ca8a04" bg="#fef9c3" />
              <StatCard icon="⏸" label={t('brand_dashboard.suspended_label')} value={data.authorizedBusinesses.suspended} color="#c2410c" bg="#fff7ed" />
            </div>

            <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase' }}>
              {t('brand_dashboard.coverage_section')}
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 20 }}>
              {data.cities.length === 0 ? (
                <div style={{ fontSize: 13, color: '#94a3b8' }}>{t('brand_dashboard.no_cities')}</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {data.cities.map(city => (
                    <span key={city} style={{ fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 20, backgroundColor: '#eff6ff', color: '#1d4ed8' }}>
                      📍 {city}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase' }}>
              {t('brand_dashboard.commerce_section')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <StatCard icon="📦" label={t('brand_dashboard.products_label')} value={data.products} />
              <StatCard icon="🛒" label={t('brand_dashboard.orders_label')} value={data.orders.count} />
              <StatCard icon="💰" label={t('brand_dashboard.revenue_label')} value={`TZS ${Number(data.orders.revenue || 0).toLocaleString()}`} color="#1d4ed8" bg="#eff6ff" />
              <StatCard icon="🛡️" label={t('brand_dashboard.warranty_registrations_label')} value={data.warrantyRegistrations} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default BrandDashboard;
