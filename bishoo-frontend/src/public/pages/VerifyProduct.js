/**
 * VerifyProduct.js — public authenticity check (spec §14). No login
 * required: a customer scans a QR code printed on a physical unit (or
 * types the serial/IMEI in by hand) and learns whether it's a genuine
 * registered unit, who sold it, and whether it's been reported lost/
 * stolen. Never shows buyer identity or order details — this is a safety
 * check, not an order lookup. Reached via App.js's boot-time /verify/:code
 * route (mirrors the existing /@username boot effect).
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';

const VerifyProduct = ({ onNavigate, code }) => {
  const { t } = useTranslation();
  const [input, setInput] = useState(code || '');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const runCheck = (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    setResult(null);
    api.get(`/products/verify/${encodeURIComponent(trimmed)}`)
      .then(r => setResult(r.data))
      .catch(() => setError(t('verify_product.check_failed')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (code) runCheck(code);
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  const isFlagged = result?.status === 'reported_lost' || result?.status === 'reported_stolen';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
      <BackBar onBack={() => onNavigate('back')} title={t('verify_product.title')} top={0} />
      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>{t('verify_product.intro')}</p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && runCheck(input)}
            placeholder={t('verify_product.input_placeholder')}
            style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }}
          />
          <button
            onClick={() => runCheck(input)}
            disabled={loading}
            style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 10, padding: '0 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            {t('verify_product.check_button')}
          </button>
        </div>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, fontSize: 12, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>{t('verify_product.checking')}</div>
        )}

        {!loading && result && !result.found && (
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 24, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>❓</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>{t('verify_product.not_found_title')}</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>{t('verify_product.not_found_desc')}</div>
          </div>
        )}

        {!loading && result?.found && (
          <div style={{ backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{
              padding: '16px 20px',
              backgroundColor: isFlagged ? '#fee2e2' : '#f0fdf4',
              color: isFlagged ? '#dc2626' : '#16a34a',
              fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              {isFlagged ? '⚠️' : '✅'}
              {isFlagged
                ? t(result.status === 'reported_stolen' ? 'verify_product.flagged_stolen' : 'verify_product.flagged_lost')
                : t('verify_product.genuine_unit')}
            </div>

            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
                {result.product.image && (
                  <img src={result.product.image} alt={result.product.name} style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover' }} />
                )}
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{result.product.name}</div>
                  {result.brand && <div style={{ fontSize: 12, color: '#64748b' }}>{result.brand.name}</div>}
                </div>
              </div>

              {result.brandAuthorizationBadge === 'brand_authorized' && (
                <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 800, color: '#1d4ed8',
                  backgroundColor: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 20, padding: '3px 10px', marginBottom: 12 }}>
                  ✓ {t('verify_product.brand_authorized_badge', { brand: result.brand?.name || '' })}
                </div>
              )}
              {result.brandAuthorizationBadge === 'kentexa_verified' && (
                <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 800, color: '#16a34a',
                  backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: 20, padding: '3px 10px', marginBottom: 12 }}>
                  ✓ {t('verify_product.kentexa_verified_badge')}
                </div>
              )}

              {result.seller && (
                <div
                  onClick={() => result.seller.ownerId && onNavigate(`CommerceProfile-${result.seller.ownerId}`, { commerceProfileId: result.seller.commerceProfileId })}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, backgroundColor: '#f8fafc', cursor: 'pointer', marginBottom: 10 }}
                >
                  {result.seller.photoUrl
                    ? <img src={result.seller.photoUrl} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                    : <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: '#e2e8f0' }} />}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{result.seller.displayName}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{t('verify_product.sold_by')}</div>
                  </div>
                  <span style={{ color: '#94a3b8' }}>›</span>
                </div>
              )}

              {result.status === 'sold' && result.soldAt && (
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  {t('verify_product.sold_on', { date: new Date(result.soldAt).toLocaleDateString() })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VerifyProduct;
