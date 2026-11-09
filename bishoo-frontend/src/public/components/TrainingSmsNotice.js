import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Training office ("ofisi ya mafunzo"): the server never sends a real SMS from
// a training office. Every SMS it would have sent comes back with the response
// (trainingSmsPreview); api.js raises 'kentexa:training-sms' and this panel
// shows the exact text, so trainees see what the customer would get.
export default function TrainingSmsNotice() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);

  useEffect(() => {
    const onSms = (e) => {
      const list = Array.isArray(e.detail) ? e.detail : [];
      if (list.length) setItems((prev) => [...prev, ...list].slice(-5));
    };
    window.addEventListener('kentexa:training-sms', onSms);
    return () => window.removeEventListener('kentexa:training-sms', onSms);
  }, []);

  if (!items.length) return null;
  return (
    <div role="status" data-testid="training-sms" data-keep-open
      style={{ position: 'fixed', left: 12, right: 12, bottom: 84, zIndex: 3000, maxWidth: 480, margin: '0 auto',
        background: '#f7f9f9', border: '2px solid #0f1419', borderRadius: 14, padding: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        maxHeight: '55vh', overflowY: 'auto' }}>
      <div style={{ fontSize: 13, fontWeight:800, color: '#0f1419' }}>{t('training_sms.title')}</div>
      {items.map((m, i) => (
        <div key={i} style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#0f1419' }}>{t('training_sms.would_send', { to: m.to })}</div>
          <div style={{ marginTop: 2, padding: 8, background: '#FFFFFF', border: '1px solid #eff3f4', borderRadius: 8,
            fontSize: 13, color: '#0F172A', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.text}</div>
        </div>
      ))}
      <button type="button" onClick={() => setItems([])}
        style={{ marginTop: 10, width: '100%', padding: '10px 12px', border: 'none', borderRadius: 10, background: '#0f1419',
          color: '#FFFFFF', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
        {t('training_sms.close')}
      </button>
    </div>
  );
}
