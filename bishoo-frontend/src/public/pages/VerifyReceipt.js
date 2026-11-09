/**
 * VerifyReceipt.js — "Hakiki risiti", rebuilt in the new look (owner 2026-11-02: "rebuild
 * the other pages left in the new way"). A customer types a receipt number; the server
 * says whether it is a real KenteXa receipt (GET /invoices/verify/:number). Valid: the
 * amount and the facts as rows, and the PDF. Not valid: the server's reason. No emoji,
 * no gradients; same server call and texts as before.
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const GREEN = '#05603a';
const RED = '#b42318';

const VerifyReceipt = ({ onNavigate }) => {
  const { t, i18n } = useTranslation();
  const dateLocale = { en: 'en-GB', sw: 'sw-TZ', fr: 'fr-FR' }[i18n?.language] || 'en-GB';
  const [number, setNumber] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const verify = async (e) => {
    e?.preventDefault?.();
    if (!number.trim()) { setError(t('verify_receipt.receipt_number_required')); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await api.get(`/invoices/verify/${number.trim()}`);
      setResult(res.data);
    } catch { setError(t('verify_receipt.verify_failed')); } finally { setLoading(false); }
  };
  const again = () => { setResult(null); setNumber(''); setError(''); };

  const pill = (dark) => ({ height: 46, padding: '0 18px', borderRadius: 23, border: dark ? 'none' : '1px solid #cfd9de', background: dark ? INK : '#fff',
    color: dark ? '#fff' : INK, fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' });
  const valid = result && result.valid;
  const rows = valid ? [
    [t('verify_receipt.receipt_number_label'), result.receiptNumber],
    [t('verify_receipt.label_invoice_number'), result.invoiceNumber],
    [t('verify_receipt.label_payment_method'), result.paymentMethod || t('verify_receipt.not_available')],
    [t('verify_receipt.label_paid_on'), result.paidAt
      ? new Date(result.paidAt).toLocaleString(dateLocale, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : t('verify_receipt.not_available')],
  ].filter(([, v]) => v) : [];

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: INK }}>
      <BackBar onBack={() => onNavigate('back')} top={0} />
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '16px 16px 48px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!result && (
          <>
            <h1 style={{ margin: '4px 0 0', fontSize: 26, fontWeight: 800, lineHeight: 1.2 }}>{t('verify_receipt.hero_title')}</h1>
            <p style={{ margin: 0, fontSize: 15, color: MUTED, lineHeight: 1.45 }}>{t('verify_receipt.hero_desc')}</p>
            <form onSubmit={verify} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input data-testid="receipt-number" value={number} onChange={(e) => setNumber(e.target.value)} aria-label={t('verify_receipt.search_placeholder')}
                placeholder={t('verify_receipt.search_placeholder')}
                style={{ border: '1px solid #cfd9de', borderRadius: 8, padding: '12px 14px', fontSize: 17, fontFamily: 'inherit', color: INK, letterSpacing: '0.04em' }} />
              <span style={{ fontSize: 13, color: MUTED }}>{t('verify_receipt.format_hint')}</span>
              {error && <p role="alert" style={{ margin: 0, color: RED, fontSize: 14 }}>{error}</p>}
              <button type="submit" data-testid="receipt-verify" disabled={loading} style={{ ...pill(true), opacity: loading ? 0.6 : 1 }}>
                {loading ? t('verify_receipt.verifying') : t('verify_receipt.verify_button')}
              </button>
            </form>
            <section style={{ borderTop: `1px solid ${LINE}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{t('verify_receipt.where_to_find_title')}</h2>
              {[1, 2, 3, 4].map((n) => (
                <div key={n} style={{ display: 'flex', gap: 12 }}>
                  <span style={{ width: 26, height: 26, borderRadius: 13, background: '#f7f9f9', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <b style={{ fontSize: 15 }}>{t(`verify_receipt.step${n}_title`)}</b>
                    <span style={{ fontSize: 14, color: MUTED }}>{t(`verify_receipt.step${n}_desc`)}</span>
                  </span>
                </div>
              ))}
            </section>
          </>
        )}

        {valid && (
          <section data-testid="receipt-valid" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill={GREEN} /><path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" /></svg>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{t('verify_receipt.verified_title')}</h1>
            </div>
            <p style={{ margin: 0, fontSize: 15, color: MUTED }}>{t('verify_receipt.verified_desc')}</p>
            <div style={{ border: `1px solid ${LINE}`, borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 13, color: MUTED }}>{t('verify_receipt.amount_paid_label')}</span>
              <span style={{ fontSize: 30, fontWeight: 800 }}>TZS {Number(result.amount || 0).toLocaleString('en-US')}</span>
              <span style={{ alignSelf: 'flex-start', marginTop: 4, padding: '4px 10px', borderRadius: 14, background: '#ecfdf3', color: GREEN, fontSize: 13, fontWeight: 700 }}>{t('verify_receipt.paid_badge')}</span>
            </div>
            <div>
              {rows.map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '11px 0', borderBottom: `1px solid ${LINE}`, fontSize: 15 }}>
                  <span style={{ color: MUTED }}>{k}</span><span style={{ fontWeight: 600, textAlign: 'right', overflowWrap: 'anywhere' }}>{v}</span>
                </div>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 13, color: MUTED }}>{t('verify_receipt.verified_by_desc')}</p>
            <button type="button" onClick={again} style={pill(false)}>{t('verify_receipt.verify_another_button')}</button>
          </section>
        )}

        {result && !result.valid && (
          <section data-testid="receipt-invalid" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill={RED} /><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" /></svg>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{t('verify_receipt.not_valid_title')}</h1>
            </div>
            <p style={{ margin: 0, fontSize: 15 }}>{result.message || t('verify_receipt.not_valid_default_message')}</p>
            <p style={{ margin: 0, fontSize: 14, color: MUTED }}>{t('verify_receipt.error_contact_note')}</p>
            <button type="button" onClick={again} style={pill(true)}>{t('verify_receipt.try_again_button')}</button>
          </section>
        )}
      </main>
    </div>
  );
};

export default VerifyReceipt;
