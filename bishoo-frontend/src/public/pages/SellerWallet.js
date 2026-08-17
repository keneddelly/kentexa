/**
 * SellerWallet.js — Seller wallet balance & withdrawal requests
 * Place at: src/public/pages/SellerWallet.js
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';

const fmt = (n) => Number(n || 0).toLocaleString();

const DATE_LOCALE_MAP = { en: 'en-GB', sw: 'sw-TZ', fr: 'fr-FR' };

const TX_STYLE = {
  credit_escrow_release: { icon: '💰', color: '#16a34a' },
  withdrawal_requested:  { icon: '⏳', color: '#ca8a04' },
  withdrawal_paid:       { icon: '✅', color: '#16a34a' },
  withdrawal_rejected:   { icon: '❌', color: '#dc2626' },
  adjustment:            { icon: '⚙️', color: '#64748b' },
};

const SellerWallet = ({ onNavigate }) => {
  const { t, i18n } = useTranslation();
  const dateLocale = DATE_LOCALE_MAP[i18n.language] || 'en-GB';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = () => {
    api.get('/seller/wallet')
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleWithdraw = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError(t('seller_wallet.invalid_amount')); return; }
    if (data?.wallet && amt > Number(data.wallet.balance)) {
      setError(t('seller_wallet.insufficient_balance')); return;
    }
    try {
      setSubmitting(true);
      setError('');
      await api.post('/seller/wallet/withdraw', { amount: amt });
      setMessage(t('seller_wallet.withdraw_requested'));
      setShowWithdraw(false);
      setAmount('');
      load();
    } catch (err) {
      setError(err?.response?.data?.message || t('seller_wallet.withdraw_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const wallet = data?.wallet;
  const transactions = data?.transactions || [];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <BackBar title={t('seller_wallet.page_title')} onBack={() => onNavigate('back')} />

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 16px 80px' }}>

        {message && (
          <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '12px 14px',
            borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 700 }}>
            ✅ {message}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
            <div style={{ fontSize: 40 }}>👛</div>
            <div style={{ marginTop: 12 }}>{t('seller_wallet.loading')}</div>
          </div>
        ) : !wallet ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
            {t('seller_wallet.load_failed')}
          </div>
        ) : (
          <>
            {/* Balance hero */}
            <div style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)',
              borderRadius: 20, padding: 24, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)',
                fontWeight: 700, marginBottom: 4 }}>{t('seller_wallet.available_balance')}</div>
              <div style={{ fontSize: 30, fontWeight: 900, color: '#fff', marginBottom: 16 }}>
                TZS {fmt(wallet.balance)}
              </div>
              <div style={{ display: 'flex', gap: 0 }}>
                <div style={{ flex: 1, textAlign: 'center',
                  borderRight: '1px solid rgba(255,255,255,0.2)', paddingRight: 12 }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>
                    TZS {fmt(wallet.pendingBalance)}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>
                    {t('seller_wallet.pending_label')}
                  </div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', paddingLeft: 12 }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>
                    TZS {fmt(wallet.totalEarned)}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>
                    {t('seller_wallet.total_earned_label')}
                  </div>
                </div>
              </div>
            </div>

            <button onClick={() => setShowWithdraw(true)} disabled={Number(wallet.balance) <= 0}
              style={{ width: '100%', marginBottom: 20,
                background: Number(wallet.balance) > 0 ? 'linear-gradient(135deg,#16a34a,#059669)' : '#e2e8f0',
                color: Number(wallet.balance) > 0 ? '#fff' : '#94a3b8',
                border: 'none', padding: 14, borderRadius: 14,
                cursor: Number(wallet.balance) > 0 ? 'pointer' : 'not-allowed',
                fontSize: 14, fontWeight: 800 }}>
              💸 {t('seller_wallet.request_withdrawal')}
            </button>

            {/* Transactions */}
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 10 }}>
              {t('seller_wallet.transaction_history')}
            </div>
            {transactions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                <div style={{ fontSize: 36 }}>👛</div>
                <div style={{ marginTop: 12, fontSize: 13 }}>{t('seller_wallet.no_transactions')}</div>
              </div>
            ) : transactions.map(tx => {
              const s = TX_STYLE[tx.type] || TX_STYLE.adjustment;
              const isCredit = tx.type === 'credit_escrow_release' || tx.type === 'withdrawal_rejected';
              return (
                <div key={tx.id} style={{ backgroundColor: '#fff', borderRadius: 12,
                  padding: '12px 14px', marginBottom: 8,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18 }}>{s.icon}</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>
                        {t(`seller_wallet.tx_${tx.type}`)}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        {new Date(tx.createdAt).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: s.color }}>
                    {isCredit ? '+' : '-'}TZS {fmt(tx.amount)}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Withdraw modal */}
      {showWithdraw && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', margin: '0 0 6px' }}>
              💸 {t('seller_wallet.request_withdrawal')}
            </h3>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>
              {t('seller_wallet.available_now', { amount: fmt(wallet?.balance) })}
            </p>
            {error && (
              <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '8px 12px',
                borderRadius: 8, marginBottom: 12, fontSize: 12 }}>
                {error}
              </div>
            )}
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder={t('seller_wallet.amount_placeholder')}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10,
                border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box',
                marginBottom: 16, fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setShowWithdraw(false); setError(''); }}
                style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none',
                  padding: 12, borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                {t('seller_wallet.cancel')}
              </button>
              <button onClick={handleWithdraw} disabled={submitting}
                style={{ flex: 2, background: 'linear-gradient(135deg,#16a34a,#059669)', color: '#fff',
                  border: 'none', padding: 12, borderRadius: 10,
                  cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 800 }}>
                {submitting ? '⏳...' : t('seller_wallet.confirm_withdrawal')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SellerWallet;
