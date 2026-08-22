/**
 * ConfirmDelivery.js — Public confirmation page
 * No login required. Buyer taps link from WhatsApp.
 *
 * URL: kentexa.com/?confirm=KTX-SHP-72&token=abc123
 *
 * Place at: src/public/pages/ConfirmDelivery.js
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';
import StarRating from '../components/StarRating';

const ConfirmDelivery = ({ token, trackingNumber }) => {
  const { t } = useTranslation();
  const [order,    setOrder]    = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [step,     setStep]     = useState('loading'); // loading|confirm|rate|done|problem|already
  const [rating,   setRating]   = useState(0);
  const [review,       setReview]       = useState('');
  const [productRating, setProductRating] = useState(0);
  const [productReview, setProductReview] = useState('');
  const [hoverProduct,  setHoverProduct]  = useState(0);
  const [superAgentRating, setSuperAgentRating] = useState(0);
  const [superAgentReview, setSuperAgentReview] = useState('');
  const [transportRating, setTransportRating] = useState(0);
  const [transportReview, setTransportReview] = useState('');
  const [report,   setReport]   = useState('');
  const [saving,   setSaving]   = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [result,   setResult]   = useState(null);

  useEffect(() => {
    if (!token) { setError(t('confirm_delivery.link_not_found')); setStep('error'); return; }
    fetchOrder();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchOrder = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/orders/confirm/lookup?token=${token}`);
      setOrder(res.data);
      setStep(res.data.alreadyConfirmed ? 'already' : 'confirm');
    } catch (err) {
      setError(err?.response?.data?.message || t('confirm_delivery.link_invalid'));
      setStep('error');
    } finally { setLoading(false); }
  };

  const handleConfirm = async (confirmed) => {
    setSaving(true);
    try {
      const res = await api.post('/orders/confirm/submit', {
        token, confirmed,
        rating: confirmed ? rating || null : null,
        review: confirmed && review.trim() ? review.trim() : null,
        reportNote: !confirmed ? report : null,
        superAgentRating: confirmed ? superAgentRating || null : null,
        superAgentReview: confirmed && superAgentReview.trim() ? superAgentReview.trim() : null,
        transportRating: confirmed ? transportRating || null : null,
        transportReview: confirmed && transportReview.trim() ? transportReview.trim() : null,
      });

      // Also submit product review if product exists and rated
      if (confirmed && productRating > 0 && order?.productId) {
        api.post(`/products/${order.productId}/reviews`, {
          rating:  productRating,
          comment: productReview.trim() || null,
          orderId: order.orderId,
        }).catch(() => {}); // non-critical
      }
      setResult(res.data);
      setStep(confirmed ? 'done' : 'problem');
    } catch (err) {
      setError(err?.response?.data?.message || t('confirm_delivery.something_wrong'));
    } finally { setSaving(false); }
  };

  // ── Styles ──
  const card = { maxWidth: 480, margin: '0 auto', padding: '20px 16px 40px', minHeight: '100vh',
    backgroundColor: '#f8fafc', fontFamily: "'Segoe UI', system-ui, sans-serif" };
  const box  = { backgroundColor: '#fff', borderRadius: 16, padding: 24,
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)', marginBottom: 16 };
  const btn  = (bg, color='#fff') => ({
    width: '100%', padding: '16px 20px', borderRadius: 12, border: 'none',
    backgroundColor: bg, color, fontSize: 16, fontWeight: 800,
    cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
    marginBottom: 10,
  });

  if (step === 'loading') return (
    <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: '#94a3b8' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
        <div style={{ fontSize: 16 }}>{t('confirm_delivery.loading')}</div>
      </div>
    </div>
  );

  if (step === 'error') return (
    <div style={card}>
      <div style={{ ...box, textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>❌</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#dc2626', marginBottom: 8 }}>{t('confirm_delivery.something_wrong_title')}</div>
        <div style={{ fontSize: 14, color: '#64748b' }}>{error}</div>
      </div>
    </div>
  );

  if (step === 'already') return (
    <div style={card}>
      <div style={{ ...box, textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: '#16a34a', marginBottom: 8 }}>
          {t('confirm_delivery.already_confirmed_title')}
        </div>
        <div style={{ fontSize: 14, color: '#64748b', marginBottom: 16 }}>
          {t('confirm_delivery.already_confirmed_desc', { product: order?.productName })}
        </div>
        {order?.rating && (
          <div style={{ fontSize: 28 }}>{'⭐'.repeat(order.rating)}</div>
        )}
      </div>
    </div>
  );

  if (step === 'done') return (
    <div style={card}>
      <div style={{ ...box, textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 64, marginBottom: 12 }}>🎉</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#16a34a', marginBottom: 8 }}>
          {t('confirm_delivery.thank_you_title')}
        </div>
        <div style={{ fontSize: 15, color: '#475569', marginBottom: 8 }}>
          {t('confirm_delivery.thank_you_desc')}
        </div>
        {rating > 0 && (
          <div style={{ fontSize: 32, margin: '12px 0' }}>{'⭐'.repeat(rating)}</div>
        )}
        <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 16 }}>
          {t('confirm_delivery.payout_note')}
        </div>
      </div>

      {/* Marketing footer */}
      <div style={{ ...box, backgroundColor: '#0f172a', padding: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: '#fff', marginBottom: 6 }}>
          {t('confirm_delivery.shop_confidence_title')}
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16, lineHeight: 1.6 }}>
          {t('confirm_delivery.shop_confidence_desc')}
        </div>
        <a href="https://kentexa.com" style={{ display: 'block', backgroundColor: '#1d4ed8',
          color: '#fff', padding: '12px 16px', borderRadius: 10, textDecoration: 'none',
          fontSize: 13, fontWeight: 800, textAlign: 'center' }}>
          {t('confirm_delivery.visit_kentexa')}
        </a>
      </div>
    </div>
  );

  if (step === 'problem') return (
    <div style={card}>
      <div style={{ ...box, textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: '#dc2626', marginBottom: 8 }}>
          {t('confirm_delivery.problem_reported_title')}
        </div>
        <div style={{ fontSize: 14, color: '#64748b' }}>
          {t('confirm_delivery.problem_reported_desc')}
        </div>
      </div>
    </div>
  );

  // ── Main confirm step ──
  return (
    <div style={card}>

      {/* Header */}
      <div style={{ textAlign: 'center', padding: '24px 0 20px' }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8',
          letterSpacing: 2, marginBottom: 8 }}>{t('confirm_delivery.header_eyebrow')}</div>
        <div style={{ fontSize: 14, color: '#1d4ed8', fontWeight: 700 }}>KenteXa</div>
      </div>

      {/* Order info */}
      <div style={box}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ fontSize: 36 }}>📦</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8',
              marginBottom: 4, letterSpacing: 0.5 }}>{t('confirm_delivery.your_item_label')}</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: '#1e293b', marginBottom: 4 }}>
              {order?.productName || order?.description || t('confirm_delivery.default_item_name')}
            </div>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              {t('confirm_delivery.from_label')} <strong>{order?.storeName || t('confirm_delivery.default_seller_name')}</strong>
            </div>
            {order?.trackingNumber && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4,
                fontFamily: 'monospace' }}>
                {order.trackingNumber}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main question */}
      <div style={{ ...box, textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', marginBottom: 8 }}>
          {t('confirm_delivery.main_question')}
        </div>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>
          {t('confirm_delivery.main_subtitle')}
        </div>

        {/* Star rating */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 10 }}>
            {t('confirm_delivery.rate_seller_label')}
          </div>
          <StarRating value={rating} onChange={setRating} />
          {rating > 0 && (
            <div style={{ fontSize: 13, color: '#f59e0b', fontWeight: 700, marginTop: 8 }}>
              {t(`confirm_delivery.rating_${rating}`)}
            </div>
          )}
        </div>

        {/* Optional review */}
        {rating > 0 && (
          <textarea placeholder={t('confirm_delivery.review_placeholder')}
            value={review} onChange={e => setReview(e.target.value)}
            rows={3} style={{ width: '100%', padding: '10px 12px', borderRadius: 10,
              border: '1px solid #e2e8f0', fontSize: 13, resize: 'none',
              boxSizing: 'border-box', marginBottom: 16, outline: 'none' }} />
        )}

        <button onClick={() => handleConfirm(true)} disabled={saving}
          style={btn('#16a34a')}>
          {saving ? t('confirm_delivery.saving_button') : t('confirm_delivery.confirm_received_button')}
        </button>
      </div>

      {/* Super Agent (hub) rating — only shown when a real one handled this order */}
      {step === 'confirm' && order?.superAgent && (
        <div style={box}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>
            {t('confirm_delivery.rate_super_agent_label')}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
            {order.superAgent.businessName}
          </div>
          <StarRating value={superAgentRating} onChange={setSuperAgentRating} size={36} />
          {superAgentRating > 0 && (
            <textarea placeholder={t('confirm_delivery.review_placeholder')}
              value={superAgentReview} onChange={e => setSuperAgentReview(e.target.value)}
              rows={2} style={{ width: '100%', padding: '8px 12px', borderRadius: 10,
                border: '1px solid #e2e8f0', fontSize: 13, resize: 'none',
                boxSizing: 'border-box', outline: 'none', marginTop: 10 }} />
          )}
        </div>
      )}

      {/* Transport Provider rating — only shown when a real linked provider handled this order */}
      {step === 'confirm' && order?.transportProvider && (
        <div style={box}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>
            {t('confirm_delivery.rate_transport_label')}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
            {order.transportProvider.name}
          </div>
          <StarRating value={transportRating} onChange={setTransportRating} size={36} />
          {transportRating > 0 && (
            <textarea placeholder={t('confirm_delivery.review_placeholder')}
              value={transportReview} onChange={e => setTransportReview(e.target.value)}
              rows={2} style={{ width: '100%', padding: '8px 12px', borderRadius: 10,
                border: '1px solid #e2e8f0', fontSize: 13, resize: 'none',
                boxSizing: 'border-box', outline: 'none', marginTop: 10 }} />
          )}
        </div>
      )}

      {/* Product rating */}
      {step === 'confirm' && order?.productId && (
        <div style={box}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>
            {t('confirm_delivery.rate_item_title')}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
            {order?.productName}
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {[1,2,3,4,5].map(n => (
              <span key={n}
                onMouseEnter={() => setHoverProduct(n)}
                onMouseLeave={() => setHoverProduct(0)}
                onClick={() => setProductRating(n === productRating ? 0 : n)}
                style={{ fontSize: 36, cursor: 'pointer',
                  color: n <= (hoverProduct || productRating) ? '#f59e0b' : '#e2e8f0',
                  transition: 'color 0.1s' }}>★</span>
            ))}
          </div>
          {productRating > 0 && (
            <textarea placeholder={t('confirm_delivery.item_review_placeholder')}
              value={productReview} onChange={e => setProductReview(e.target.value)}
              rows={2} style={{ width: '100%', padding: '8px 12px', borderRadius: 10,
                border: '1px solid #e2e8f0', fontSize: 13, resize: 'none',
                boxSizing: 'border-box', outline: 'none' }} />
          )}
        </div>
      )}

      {/* Problem button */}
      {step === 'confirm' && (
        <div style={box}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', marginBottom: 12 }}>
            {t('confirm_delivery.problem_title')}
          </div>
          <textarea placeholder={t('confirm_delivery.problem_placeholder')}
            value={report} onChange={e => setReport(e.target.value)}
            rows={3} style={{ width: '100%', padding: '10px 12px', borderRadius: 10,
              border: '1px solid #fee2e2', fontSize: 13, resize: 'none',
              boxSizing: 'border-box', marginBottom: 12, outline: 'none' }} />
          <button onClick={() => handleConfirm(false)} disabled={saving || !report.trim()}
            style={{ ...btn('#dc2626'), opacity: (!report.trim() || saving) ? 0.5 : 1 }}>
            {saving ? t('confirm_delivery.reporting_button') : t('confirm_delivery.report_problem_button')}
          </button>
          <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
            {t('confirm_delivery.payment_safe_note')}
          </div>
        </div>
      )}

    </div>
  );
};

export default ConfirmDelivery;