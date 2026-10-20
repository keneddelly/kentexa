import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';

// Release F (MARKETPLACE_PAYMENT_MODE cod_lipa): the buyer pays the seller directly.
// KenteXa holds no money. Same city: by hand on delivery (COD) or Lipa Namba;
// other city: Lipa Namba only. The server decides what is offered (GET
// /orders/payment-options) and checks it again when the order is placed.
const BLUE = '#1d4ed8';
const DARK = '#0f172a';
const GREY = '#475569';
const LINE = '#e2e8f0';

const card = { backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 14 };
const note = (bg, color) => ({ backgroundColor: bg, color, borderRadius: 10, padding: '10px 12px', fontSize: 13, lineHeight: 1.45 });

/** The seller's Lipa Namba with a copy button and the payment note. */
export function LipaNambaBox({ number, name }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* clipboard blocked: the number stays visible to copy by hand */ }
  };
  return (
    <div data-testid="lipa-namba-box" style={{ border: '1px solid #bfdbfe', backgroundColor: '#eff6ff', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: GREY }}>{t('direct_payment.lipa_number_label')}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 22, fontWeight: 800, color: DARK, letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums', wordBreak: 'break-all' }}>
          {number}
        </div>
        <button type="button" onClick={copy}
          style={{ flexShrink: 0, minHeight: 44, padding: '0 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14,
            backgroundColor: copied ? '#dcfce7' : BLUE, color: copied ? '#166534' : '#fff' }}>
          {copied ? t('direct_payment.copied') : t('direct_payment.copy')}
        </button>
      </div>
      {name && (
        <div style={{ fontSize: 13, color: GREY, marginTop: 4 }}>
          {t('direct_payment.lipa_name_label')}: <strong style={{ color: DARK }}>{name}</strong>
        </div>
      )}
      <div style={{ fontSize: 13, color: '#1e3a8a', marginTop: 8, lineHeight: 1.45 }}>{t('direct_payment.lipa_note')}</div>
    </div>
  );
}

function Option({ selected, title, sub, onClick, testId }) {
  return (
    <button type="button" data-testid={testId} aria-pressed={selected} onClick={onClick}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, padding: '10px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
        border: selected ? `2px solid ${BLUE}` : `1px solid #cbd5e1`, backgroundColor: selected ? '#eff6ff' : '#fff', fontFamily: 'inherit' }}>
      <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 10, boxSizing: 'border-box', flexShrink: 0, backgroundColor: '#fff',
        border: selected ? `6px solid ${BLUE}` : '2px solid #94a3b8' }} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: DARK }}>{title}</span>
        <span style={{ fontSize: 13, color: GREY }}>{sub}</span>
      </span>
    </button>
  );
}

/**
 * Checkout: the ways to pay in cod_lipa mode.
 * options: what the server allows for every item ('cod' | 'lipa_namba').
 * lipaNambas: the sellers' numbers ([{ number, name }]).
 */
export function DirectPaymentChoice({ loading, options = [], sameCity, regionChosen, digital, lipaNambas = [], choice, onChoose }) {
  const { t } = useTranslation();
  return (
    <div data-testid="direct-payment" style={card}>
      <h2 style={{ fontSize: 15, fontWeight: 800, color: DARK, margin: '0 0 12px' }}>{t('direct_payment.title')}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!digital && !regionChosen && <div style={note('#f8fafc', GREY)}>{t('direct_payment.choose_region')}</div>}
        {!digital && regionChosen && !loading && (
          <div data-testid="direct-payment-city" style={note(sameCity ? '#f0fdf4' : '#eff6ff', sameCity ? '#166534' : '#1e3a8a')}>
            {sameCity ? t('direct_payment.same_city') : t('direct_payment.other_city')}
          </div>
        )}
        {loading && <div style={{ fontSize: 13, color: GREY }}>{t('direct_payment.loading')}</div>}
        {/* Only once the region is known: before that, the "choose region" note says what to do. */}
        {!loading && options.length === 0 && (digital || regionChosen) && (
          <div role="alert" style={note('#fef2f2', '#b91c1c')}>{t('direct_payment.none')}</div>
        )}
        {!loading && options.includes('cod') && (
          <Option testId="pay-cod" selected={choice === 'cod'} onClick={() => onChoose('cod')}
            title={t('direct_payment.cod')} sub={t('direct_payment.cod_sub')} />
        )}
        {!loading && options.includes('lipa_namba') && (
          <Option testId="pay-lipa" selected={choice === 'lipa_namba'} onClick={() => onChoose('lipa_namba')}
            title={t('direct_payment.lipa')} sub={t('direct_payment.lipa_sub')} />
        )}
        {!loading && choice === 'lipa_namba' && lipaNambas.map((l) => <LipaNambaBox key={l.number} number={l.number} name={l.name} />)}
        <div style={{ fontSize: 12, color: GREY, lineHeight: 1.45 }}>{t('direct_payment.kentexa_note')}</div>
      </div>
    </div>
  );
}

/**
 * "Send to the seller on WhatsApp": opens wa.me with the seller's storeWhatsApp number and the
 * same text as the seller SMS, pre-filled; the buyer taps send. One per seller of this checkout;
 * sellers without a WhatsApp number on file get no button (the server sends no link for them).
 */
function WhatsAppSellerButton({ notice, showStore }) {
  const { t } = useTranslation();
  return (
    <a data-testid="whatsapp-seller" href={notice.whatsappUrl} target="_blank" rel="noopener noreferrer"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 48, padding: '10px 14px', borderRadius: 12,
        backgroundColor: '#15803d', color: '#fff', fontWeight: 700, fontSize: 15, textDecoration: 'none', textAlign: 'center', boxSizing: 'border-box', width: '100%' }}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="#fff" style={{ flexShrink: 0 }}>
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z" />
      </svg>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
        {showStore && notice.storeName ? t('direct_payment.whatsapp_send_store', { store: notice.storeName }) : t('direct_payment.whatsapp_send')}
      </span>
    </a>
  );
}

/** Checkout success screen in cod_lipa mode. */
export function DirectPaymentSuccess({ method, total, lipaNambas = [], whatsapp = [], onNavigate }) {
  const { t } = useTranslation();
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      <div data-testid="direct-payment-success" style={{ padding: '24px 16px', maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
            <svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: DARK, margin: '0 0 8px' }}>{t('direct_payment.success_title')}</h2>
          <p style={{ fontSize: 15, color: GREY, margin: 0, lineHeight: 1.5 }}>
            {method === 'cod'
              ? t('direct_payment.success_cod', { amount: Number(total || 0).toLocaleString() })
              : t('direct_payment.success_lipa', { amount: Number(total || 0).toLocaleString() })}
          </p>
        </div>
        {method === 'lipa_namba' && lipaNambas.map((l) => (
          <div key={l.number} style={{ marginBottom: 14 }}><LipaNambaBox number={l.number} name={l.name} /></div>
        ))}
        {whatsapp.length > 0 && (
          <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, color: GREY, lineHeight: 1.45 }}>{t('direct_payment.whatsapp_note')}</div>
            {whatsapp.map((n) => <WhatsAppSellerButton key={n.sellerId} notice={n} showStore={whatsapp.length > 1} />)}
          </div>
        )}
        <div style={{ fontSize: 12, color: GREY, lineHeight: 1.45, marginBottom: 14 }}>{t('direct_payment.kentexa_note')}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={() => onNavigate('MyOrders')}
            style={{ flex: 1, minHeight: 48, borderRadius: 12, border: 'none', backgroundColor: BLUE, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            {t('direct_payment.my_orders')}
          </button>
          <button type="button" onClick={() => onNavigate('Home')}
            style={{ flex: 1, minHeight: 48, borderRadius: 12, border: `1px solid ${LINE}`, backgroundColor: '#fff', color: DARK, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            {t('direct_payment.home')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Order detail (buyer, My Orders): how this direct-payment order is paid. For
 * Lipa Namba it shows the seller's current number with a copy button.
 */
export function DirectPaymentNotice({ order }) {
  const { t } = useTranslation();
  const [lipa, setLipa] = useState(null);
  const productId = order?.product?.id ?? order?.productId ?? null;
  const isLipa = order?.paymentMethod === 'lipa_namba';
  const settled = order?.paymentStatus === 'paid' || order?.status === 'completed' || order?.status === 'cancelled';
  useEffect(() => {
    let alive = true;
    if (!isLipa || settled || !productId) return undefined;
    api.get('/orders/payment-options', { params: { productId } })
      .then((r) => { if (alive) setLipa(r?.data?.lipaNamba || null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [isLipa, settled, productId]);
  const amount = Number(order?.totalAmount || 0).toLocaleString();
  return (
    <div data-testid="direct-payment-notice" style={{ backgroundColor: '#f8fafc', border: `1px solid ${LINE}`, borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>
        {isLipa ? t('direct_payment.order_lipa', { amount }) : t('direct_payment.order_cod', { amount })}
      </div>
      <div style={{ fontSize: 12, color: GREY, marginTop: 4, lineHeight: 1.45 }}>{t('direct_payment.kentexa_note')}</div>
      {isLipa && !settled && lipa?.number && <div style={{ marginTop: 10 }}><LipaNambaBox number={lipa.number} name={lipa.name} /></div>}
    </div>
  );
}
