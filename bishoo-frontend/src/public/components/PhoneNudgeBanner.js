import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';

/**
 * Soft nudge banner — shown to sellers who registered with email only
 * and have no phone number on file. SMS notifications for new orders
 * and payouts require a phone number, so we encourage (not force) adding one.
 *
 * Usage in SellerDashboard.js:
 *   import PhoneNudgeBanner from '../components/PhoneNudgeBanner';
 *   ...
 *   {profile && !profile.phone && <PhoneNudgeBanner userId={currentUser?.id} onSaved={() => fetchAll()} />}
 */
const PhoneNudgeBanner = ({ userId, onSaved }) => {
  const { t } = useTranslation();
  const [show, setShow]       = useState(true);
  const [editing, setEditing] = useState(false);
  const [phone, setPhone]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  if (!show) return null;

  const handleSave = async () => {
    if (!phone.trim()) { setError(t('phone_nudge.enter_phone')); return; }
    if (!userId) { setError(t('phone_nudge.no_user_id')); return; }
    try {
      setSaving(true); setError('');
      await api.patch(`/users/${userId}`, { phone: phone.trim() });
      setShow(false);
      if (onSaved) onSaved();
    } catch (err) {
      setError(err?.response?.data?.message || t('phone_nudge.save_failed'));
    } finally { setSaving(false); }
  };

  return (
    <div style={{ backgroundColor: '#fffbeb', border: '2px solid #fde68a', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
      {!editing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>📱</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#92400e' }}>{t('phone_nudge.add_phone_title')}</div>
            <div style={{ fontSize: 11, color: '#92400e' }}>{t('phone_nudge.add_phone_desc')}</div>
          </div>
          <button onClick={() => setEditing(true)}
            style={{ backgroundColor: '#f59e0b', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
            {t('phone_nudge.add_button')}
          </button>
          <button onClick={() => setShow(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', fontSize: 18, flexShrink: 0, padding: 0 }}>×</button>
        </div>
      ) : (
        <div>
          {error && <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>❌ {error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="tel" placeholder="255712345678" value={phone} onChange={e => setPhone(e.target.value)}
              style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '2px solid #fde68a', fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
            <button onClick={() => setEditing(false)}
              style={{ backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{t('common.cancel')}</button>
            <button onClick={handleSave} disabled={saving}
              style={{ backgroundColor: '#f59e0b', color: '#fff', border: 'none', padding: '9px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              {saving ? '⏳' : t('common.save')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhoneNudgeBanner;