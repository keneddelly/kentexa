import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';

// Release F: the seller's Lipa Namba (number + registered name). Buyers in
// MARKETPLACE_PAYMENT_MODE cod_lipa pay it directly; until it is set, the
// seller's products cannot be paid by Lipa Namba. The server lets only the
// account owner change it (PATCH /seller/my-profile/lipa-namba).
const BLUE = '#1d4ed8';
const DARK = '#0f172a';
const GREY = '#475569';
const input = { width: '100%', height: 48, boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 10, padding: '0 12px', fontSize: 16, fontFamily: 'inherit', color: DARK, backgroundColor: '#fff' };
const label = { display: 'block', fontSize: 13, fontWeight: 600, color: DARK, marginBottom: 6 };

export default function SellerLipaNambaCard({ profile, onSaved }) {
  const { t } = useTranslation();
  const [number, setNumber] = useState(profile?.lipaNamba || '');
  const [name, setName] = useState(profile?.lipaNambaName || '');
  const [editing, setEditing] = useState(!profile?.lipaNamba);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    setNumber(profile?.lipaNamba || '');
    setName(profile?.lipaNambaName || '');
    setEditing(!profile?.lipaNamba);
  }, [profile?.lipaNamba, profile?.lipaNambaName]);

  const save = async () => {
    setSaving(true); setMessage(null);
    try {
      const res = await api.patch('/seller/my-profile/lipa-namba', { lipaNamba: number, lipaNambaName: name });
      setMessage({ ok: true, text: t('direct_payment.seller_saved') });
      setEditing(false);
      if (onSaved) onSaved(res.data);
    } catch (err) {
      const m = err?.response?.data?.message;
      setMessage({ ok: false, text: Array.isArray(m) ? m.join(', ') : (m || t('direct_payment.seller_save_failed')) });
    } finally { setSaving(false); }
  };

  const has = !!profile?.lipaNamba;
  return (
    <div data-testid="seller-lipa-namba" style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 14 }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: DARK }}>{t('direct_payment.seller_card_title')}</div>
      <div style={{ fontSize: 13, color: GREY, marginTop: 4, lineHeight: 1.45 }}>{t('direct_payment.seller_card_desc')}</div>
      {!has && !message?.ok && (
        <div role="status" style={{ marginTop: 10, backgroundColor: '#fff7ed', color: '#9a3412', borderRadius: 10, padding: '10px 12px', fontSize: 13, lineHeight: 1.45 }}>
          {t('direct_payment.seller_missing')}
        </div>
      )}
      {editing ? (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={label}>{t('direct_payment.seller_number_label')}
            <input style={{ ...input, marginTop: 6 }} type="text" inputMode="numeric" placeholder="mf. 5577 1234"
              value={number} onChange={(e) => setNumber(e.target.value)} />
          </label>
          <label style={label}>{t('direct_payment.seller_name_label')}
            <input style={{ ...input, marginTop: 6 }} type="text" placeholder={t('direct_payment.seller_name_placeholder')}
              value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="button" onClick={save} disabled={saving}
            style={{ minHeight: 48, borderRadius: 12, border: 'none', backgroundColor: saving ? '#93c5fd' : BLUE, color: '#fff', fontWeight: 700, fontSize: 15, cursor: saving ? 'default' : 'pointer' }}>
            {saving ? t('direct_payment.seller_saving') : t('direct_payment.seller_save')}
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: DARK, letterSpacing: '0.04em', wordBreak: 'break-all' }}>{profile.lipaNamba}</div>
            <div style={{ fontSize: 13, color: GREY }}>{profile.lipaNambaName}</div>
          </div>
          <button type="button" onClick={() => { setEditing(true); setMessage(null); }}
            style={{ minHeight: 44, padding: '0 16px', borderRadius: 10, border: '1px solid #cbd5e1', backgroundColor: '#fff', color: BLUE, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            {t('direct_payment.seller_edit')}
          </button>
        </div>
      )}
      {message && (
        <div role={message.ok ? 'status' : 'alert'} style={{ marginTop: 10, fontSize: 13, color: message.ok ? '#166534' : '#b91c1c' }}>{message.text}</div>
      )}
    </div>
  );
}
