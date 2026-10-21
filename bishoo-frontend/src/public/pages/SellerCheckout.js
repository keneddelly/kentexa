/**
 * SellerCheckout.js — the private link in the seller's new-order SMS / WhatsApp message.
 * URL: kentexa.com/?sellerCheckout=<signed token>
 * No login: the server shows the orders only for a valid token (7 days), and only that
 * seller's orders from that one checkout (GET /orders/seller-checkout/:token).
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';

const DARK = '#0f172a';
const GREY = '#475569';
const LINE = '#e2e8f0';
const card = { backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 14 };
const tzs = (n) => `TZS ${Number(n || 0).toLocaleString()}`;

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: `1px solid ${LINE}`, fontSize: 14 }}>
      <div style={{ width: 96, flexShrink: 0, color: GREY }}>{label}</div>
      <div style={{ flex: 1, minWidth: 0, color: DARK, fontWeight: 600, overflowWrap: 'anywhere' }}>{children}</div>
    </div>
  );
}

const SellerCheckout = ({ token, onNavigate }) => {
  const { t } = useTranslation();
  const [view, setView] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api.get(`/orders/seller-checkout/${encodeURIComponent(token || '')}`)
      .then((r) => { if (alive) setView(r.data); })
      .catch((e) => { if (alive) setError(t(e?.response?.status === 403 ? 'seller_checkout.wrong_account' : 'seller_checkout.invalid')); });
    return () => { alive = false; };
  }, [token, t]);

  const page = (children) => (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <div data-testid="seller-checkout" style={{ padding: '24px 16px', maxWidth: 480, margin: '0 auto', boxSizing: 'border-box' }}>{children}</div>
    </div>
  );

  if (error) {
    return page(
      <div role="alert" style={{ ...card, textAlign: 'center' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: DARK, margin: '0 0 8px' }}>{t('seller_checkout.invalid_title')}</h2>
        <p style={{ fontSize: 14, color: GREY, margin: '0 0 14px', lineHeight: 1.5 }}>{error}</p>
        {onNavigate && (
          <button type="button" onClick={() => onNavigate('SellerOrders')}
            style={{ minHeight: 48, padding: '0 18px', borderRadius: 12, border: 'none', backgroundColor: '#1d4ed8', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            {t('seller_checkout.open_orders')}
          </button>
        )}
      </div>,
    );
  }
  if (!view) return page(<div style={{ ...card, color: GREY, fontSize: 14 }}>{t('seller_checkout.loading')}</div>);

  const place = [view.districtName, view.regionName].filter(Boolean).join(', ');
  return page(
    <>
      <div style={card}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: DARK, margin: '0 0 4px' }}>
          {t('seller_checkout.title', { orders: view.orderIds.map((id) => `#${id}`).join(', ') })}
        </h2>
        <div style={{ fontSize: 13, color: GREY }}>
          {view.paymentMethod === 'lipa_namba' ? t('seller_checkout.pay_lipa') : t('seller_checkout.pay_cod')}
        </div>
      </div>
      <div style={card}>
        {view.items.map((item) => (
          <div key={item.orderId} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: `1px solid ${LINE}`, fontSize: 14 }}>
            <div style={{ flex: 1, minWidth: 0, color: DARK, overflowWrap: 'anywhere' }}>
              <strong>{item.productName}</strong> × {item.quantity}
              <div style={{ fontSize: 12, color: GREY }}>#{item.orderId}</div>
            </div>
            <div style={{ flexShrink: 0, fontWeight: 700, color: DARK, fontVariantNumeric: 'tabular-nums' }}>{tzs(item.totalAmount)}</div>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, fontSize: 16, fontWeight: 800, color: DARK }}>
          <span>{t('seller_checkout.total')}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{tzs(view.total)}</span>
        </div>
      </div>
      <div style={card}>
        <Row label={t('seller_checkout.buyer')}>{view.buyerName || '—'}</Row>
        <Row label={t('seller_checkout.phone')}>
          {view.buyerPhone ? <a href={`tel:${view.buyerPhone}`} style={{ color: '#1d4ed8' }}>{view.buyerPhone}</a> : '—'}
        </Row>
        {view.recipientName && <Row label={t('seller_checkout.recipient')}>{view.recipientName}</Row>}
        <Row label={t('seller_checkout.place')}>{place || '—'}</Row>
        <Row label={t('seller_checkout.address')}>{view.deliveryAddress || '—'}</Row>
      </div>
      <div style={{ fontSize: 12, color: GREY, lineHeight: 1.45 }}>
        {t('seller_checkout.expires', { date: new Date(view.expiresAt).toLocaleDateString() })}
      </div>
    </>,
  );
};

export default SellerCheckout;
