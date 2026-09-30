import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';
import BackBar from '../components/BackBar';
const PayoutSettings = ({ activeContext, onNavigate }) => {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ method: 'mpesa', accountName: '', accountNumber: '', bankName: '' });
  const [allowed, setAllowed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const isBusiness = activeContext?.identityType === 'BUSINESS' && activeContext?.workspaceId != null;
  useEffect(() => {
    let cancelled = false; setAllowed(false); setError('');
    if (isBusiness) api.get('/business/payout-destinations').then(res => {
      if (!cancelled) { setItems(res.data || []); setAllowed(true); }
    }).catch(() => { if (!cancelled) setError(t('payout_settings.unavailable')); });
    return () => { cancelled = true; };
  }, [isBusiness, activeContext?.workspaceId, t]);
  const save = async event => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await api.post('/business/payout-destinations', { method: form.method, accountName: form.accountName.trim(), accountNumber: form.accountNumber.trim(), ...(form.method === 'bank' ? { bankName: form.bankName.trim() } : {}) });
      setMessage(t('payout_settings.pending'));
      setForm({ method: 'mpesa', accountName: '', accountNumber: '', bankName: '' });
      const res = await api.get('/business/payout-destinations'); setItems(res.data || []);
    } catch { setError(t('payout_settings.save_failed')); }
    finally { setBusy(false); }
  };
  const style = { width: '100%', boxSizing: 'border-box', padding: 12, fontSize: 16, border: '1px solid #cbd5e1', borderRadius: 10 };
  return <main style={{ maxWidth: 640, margin: 'auto', padding: 20, paddingBottom: 100, fontSize: 16 }}>
    <BackBar title={t('payout_settings.title')} onBack={() => onNavigate('back')} />
    {!isBusiness ? <><p>{t('payout_settings.choose_business')}</p><button onClick={() => onNavigate('MyBusinesses')}>{t('my_profile.nav_businesses')}</button></> : <>
      {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
      {message && <p role="status">{message}</p>}
      {allowed && <>
        <p>{t('payout_settings.hint')}</p>
        {items.map(item => <div key={item.id} style={{ padding: 14, border: '1px solid #e2e8f0', marginBottom: 12 }}>
          <strong>{item.accountName}</strong><p>{item.method} · {item.accountNumber}</p>
          <p>{t('payout_settings.status_' + item.status, { defaultValue: item.status })}</p>
        </div>)}
        <form onSubmit={save}>
          <label>{t('payout_settings.method')}<select value={form.method} disabled={busy} onChange={e => setForm({ ...form, method: e.target.value })} style={style}>
            {[['mpesa','M-Pesa'],['airtel_money','Airtel Money'],['tigo_pesa','Mixx by Yas'],['halotel','HaloPesa'],['bank',t('payout_settings.bankName')]].map(([key,label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          {['accountName','accountNumber', ...(form.method === 'bank' ? ['bankName'] : [])].map(field => <label key={field} style={{ display: 'block', marginTop: 16 }}>{t('payout_settings.' + field)}
            <input required value={form[field]} disabled={busy} onChange={e => setForm({ ...form, [field]: e.target.value })} style={style} />
          </label>)}
          <button type="submit" disabled={busy} style={{ ...style, marginTop: 20, color: '#fff', background: '#2563eb', fontWeight: 800 }}>{t(busy ? 'onboarding.saving_button' : 'profile.update')}</button>
        </form>
      </>}
    </>}
  </main>;
};
export default PayoutSettings;
