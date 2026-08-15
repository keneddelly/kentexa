import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';

const VerifyReceipt = ({ onNavigate }) => {
  const { t, i18n } = useTranslation();
  const dateLocale = { en: 'en-GB', sw: 'sw-TZ', fr: 'fr-FR' }[i18n.language] || 'en-GB';
  const [receiptNumber, setReceiptNumber] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const handleVerify = async () => {
    if (!receiptNumber.trim()) {
      setError(t('verify_receipt.receipt_number_required'));
      return;
    }
    try {
      setLoading(true);
      setError('');
      setResult(null);
      setSearched(true);
      const res = await api.get(`/invoices/verify/${receiptNumber.trim()}`);
      setResult(res.data);
    } catch (err) {
      setError(t('verify_receipt.verify_failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') handleVerify();
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
      <BackBar onBack={() => onNavigate('back')} top={0} />

      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 50%, #667eea 100%)',
        padding: '60px 32px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: '-60px', left: '-60px', width: '200px', height: '200px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.08)' }} />
        <div style={{ position: 'absolute', bottom: '-80px', right: '-40px', width: '280px', height: '280px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.06)' }} />

        <div style={{ position: 'relative' }}>
          <div style={{
            width: '72px', height: '72px',
            backgroundColor: 'rgba(255,255,255,0.2)',
            borderRadius: '20px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '36px', margin: '0 auto 20px',
            border: '2px solid rgba(255,255,255,0.3)',
          }}>
            🔍
          </div>
          <h1 style={{ fontSize: '40px', fontWeight: '900', color: '#fff', margin: '0 0 12px' }}>
            {t('verify_receipt.hero_title')}
          </h1>
          <p style={{ fontSize: '17px', color: 'rgba(255,255,255,0.9)', marginBottom: '36px', maxWidth: '500px', margin: '0 auto 36px' }}>
            {t('verify_receipt.hero_desc')}
          </p>

          {/* Search Box */}
          <div style={{ maxWidth: '560px', margin: '0 auto', display: 'flex', gap: '12px' }}>
            <input
              type="text"
              placeholder={t('verify_receipt.search_placeholder')}
              value={receiptNumber}
              onChange={e => setReceiptNumber(e.target.value.toUpperCase())}
              onKeyPress={handleKeyPress}
              style={{
                flex: 1, padding: '16px 20px',
                borderRadius: '12px', border: 'none',
                fontSize: '15px', outline: 'none',
                boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                letterSpacing: '1px',
              }}
            />
            <button
              onClick={handleVerify}
              disabled={loading}
              style={{
                backgroundColor: '#fff',
                color: '#16a34a',
                border: 'none', padding: '16px 28px',
                borderRadius: '12px', cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '15px', fontWeight: '800',
                boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                whiteSpace: 'nowrap',
              }}
            >
              {loading ? '⏳' : t('verify_receipt.verify_button')}
            </button>
          </div>

          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginTop: '12px' }}>
            {t('verify_receipt.format_hint')}
          </p>
        </div>
      </div>

      <div style={{ padding: '40px 32px', maxWidth: '800px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '14px 16px', borderRadius: '10px', marginBottom: '24px', fontSize: '14px', fontWeight: '600' }}>
            ❌ {error}
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: '48px', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
            <p style={{ color: '#64748b', fontSize: '15px' }}>{t('verify_receipt.verifying')}</p>
          </div>
        )}

        {!loading && result && result.valid && (
          <div>
            <div style={{
              background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
              borderRadius: '16px', padding: '28px',
              textAlign: 'center', marginBottom: '24px',
              boxShadow: '0 8px 24px rgba(67,233,123,0.3)',
            }}>
              <div style={{ fontSize: '56px', marginBottom: '12px' }}>✅</div>
              <h2 style={{ fontSize: '26px', fontWeight: '900', color: '#fff', margin: '0 0 8px' }}>
                {t('verify_receipt.verified_title')}
              </h2>
              <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.9)', margin: 0 }}>
                {t('verify_receipt.verified_desc')}
              </p>
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '32px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', paddingBottom: '24px', borderBottom: '2px dashed #e2e8f0' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '22px' }}>⚡</span>
                    <span style={{ fontSize: '20px', fontWeight: '900', color: '#7c3aed', letterSpacing: '1px' }}>KENTEXA</span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>{t('verify_receipt.company_tagline')}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>{t('verify_receipt.receipt_number_label')}</div>
                  <div style={{ fontSize: '16px', fontWeight: '900', color: '#7c3aed', letterSpacing: '1px' }}>
                    {result.receiptNumber}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                {[
                  { label: t('verify_receipt.label_invoice_number'), value: result.invoiceNumber, icon: '📄' },
                  { label: t('verify_receipt.label_order_id'), value: `#${result.orderId}`, icon: '🛒' },
                  { label: t('verify_receipt.label_payment_method'), value: result.paymentMethod || t('verify_receipt.not_available'), icon: '💳' },
                  { label: t('verify_receipt.label_paid_on'), value: result.paidAt ? new Date(result.paidAt).toLocaleString(dateLocale, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : t('verify_receipt.not_available'), icon: '📅' },
                ].map(item => (
                  <div key={item.label} style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', marginBottom: '6px' }}>
                      {item.icon} {item.label}
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '14px', padding: '20px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', marginBottom: '4px' }}>{t('verify_receipt.amount_paid_label')}</div>
                  <div style={{ fontSize: '32px', fontWeight: '900', color: '#fff' }}>
                    TZS {Number(result.amount).toLocaleString()}
                  </div>
                </div>
                <div style={{
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  borderRadius: '12px', padding: '12px 20px',
                  color: '#fff', fontSize: '14px', fontWeight: '800',
                  border: '2px solid rgba(255,255,255,0.3)',
                }}>
                  {t('verify_receipt.paid_badge')}
                </div>
              </div>
            </div>

            <div style={{
              backgroundColor: '#fff', borderRadius: '16px', padding: '20px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
              display: 'flex', alignItems: 'center', gap: '16px',
            }}>
              <div style={{
                width: '52px', height: '52px', flexShrink: 0,
                background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
                borderRadius: '14px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '24px',
              }}>
                🛡️
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: '#1e293b', marginBottom: '4px' }}>
                  {t('verify_receipt.verified_by_title')}
                </div>
                <div style={{ fontSize: '13px', color: '#64748b' }}>
                  {t('verify_receipt.verified_by_desc')}
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <a
                href={`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/invoices/receipt/${result.receiptNumber}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: '#fff', textDecoration: 'none',
                  padding: '14px 32px', borderRadius: '12px',
                  fontSize: '15px', fontWeight: '800',
                  boxShadow: '0 4px 16px rgba(102,126,234,0.4)',
                }}
              >
                {t('verify_receipt.download_pdf_button')}
              </a>
            </div>
          </div>
        )}

        {!loading && searched && result && !result.valid && (
          <div style={{
            backgroundColor: '#fff', borderRadius: '16px', padding: '48px',
            textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          }}>
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>❌</div>
            <h2 style={{ fontSize: '22px', fontWeight: '900', color: '#dc2626', marginBottom: '8px' }}>
              {t('verify_receipt.not_valid_title')}
            </h2>
            <p style={{ color: '#64748b', fontSize: '15px', marginBottom: '24px' }}>
              {result.message || t('verify_receipt.not_valid_default_message')}
            </p>
            <div style={{ backgroundColor: '#fef2f2', borderRadius: '12px', padding: '16px', marginBottom: '24px', fontSize: '14px', color: '#991b1b' }}>
              {t('verify_receipt.error_contact_note')}
            </div>
            <button
              onClick={() => { setReceiptNumber(''); setResult(null); setSearched(false); }}
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: '#fff', border: 'none', padding: '12px 28px',
                borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '700',
              }}
            >
              {t('verify_receipt.try_again_button')}
            </button>
          </div>
        )}

        {!searched && !loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
            {[
              { icon: '🔒', title: t('verify_receipt.card1_title'), desc: t('verify_receipt.card1_desc'), color: '#667eea' },
              { icon: '⚡', title: t('verify_receipt.card2_title'), desc: t('verify_receipt.card2_desc'), color: '#f7971e' },
              { icon: '📄', title: t('verify_receipt.card3_title'), desc: t('verify_receipt.card3_desc'), color: '#43e97b' },
              { icon: '🛡️', title: t('verify_receipt.card4_title'), desc: t('verify_receipt.card4_desc'), color: '#f093fb' },
            ].map(card => (
              <div key={card.title} style={{
                backgroundColor: '#fff', borderRadius: '14px', padding: '24px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                borderTop: `4px solid ${card.color}`,
              }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>{card.icon}</div>
                <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#1e293b', margin: '0 0 8px' }}>{card.title}</h3>
                <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: '1.6' }}>{card.desc}</p>
              </div>
            ))}
          </div>
        )}

        {!searched && (
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginTop: '24px' }}>
            <h3 style={{ fontSize: '17px', fontWeight: '800', color: '#1e293b', margin: '0 0 20px' }}>
              {t('verify_receipt.where_to_find_title')}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {[
                { step: '1', title: t('verify_receipt.step1_title'), desc: t('verify_receipt.step1_desc') },
                { step: '2', title: t('verify_receipt.step2_title'), desc: t('verify_receipt.step2_desc') },
                { step: '3', title: t('verify_receipt.step3_title'), desc: t('verify_receipt.step3_desc') },
                { step: '4', title: t('verify_receipt.step4_title'), desc: t('verify_receipt.step4_desc') },
              ].map(item => (
                <div key={item.step} style={{ display: 'flex', gap: '14px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
                  <div style={{
                    width: '36px', height: '36px', flexShrink: 0,
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    borderRadius: '10px', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '16px', fontWeight: '900', color: '#fff',
                  }}>
                    {item.step}
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>{item.title}</div>
                    <div style={{ fontSize: '13px', color: '#64748b', lineHeight: '1.5' }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {searched && result && (
          <div style={{ textAlign: 'center', marginTop: '24px' }}>
            <button
              onClick={() => { setReceiptNumber(''); setResult(null); setSearched(false); setError(''); }}
              style={{
                backgroundColor: '#f1f5f9', color: '#64748b',
                border: 'none', padding: '12px 28px', borderRadius: '10px',
                cursor: 'pointer', fontSize: '14px', fontWeight: '700',
              }}
            >
              {t('verify_receipt.verify_another_button')}
            </button>
          </div>
        )}

      </div>
    </div>
  );
};

export default VerifyReceipt;