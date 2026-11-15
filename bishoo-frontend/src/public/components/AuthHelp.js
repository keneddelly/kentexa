import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';
import { AUTH, AuthButton, AuthField, AuthLink } from './AuthShell';

// "Unahitaji msaada?" (owner approved 2026-11-16, issue #361): someone stuck at sign-up or
// sign-in leaves a phone number and the team calls back. No account needed. Sends only the
// phone, the name if typed, the step and the error shown — never a password or a code.
export default function AuthHelp({ step, errorCode = null, phone = '', name = '' }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [callPhone, setCallPhone] = useState(phone);
  const [note, setNote] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | sent | failed

  if (!open) return <AuthLink onClick={() => { setCallPhone(phone); setOpen(true); }} testId="auth-help">{t('signin.help_link')}</AuthLink>;
  if (state === 'sent') return <p role="status" data-testid="auth-help-sent" style={{ margin: 0, fontSize: 14, color: '#05603a' }}>{t('signin.help_sent')}</p>;

  const send = async () => {
    setState('sending');
    try {
      await api.post('/contact/help', { phone: callPhone, name, step, errorCode, note });
      setState('sent');
    } catch { setState('failed'); }
  };

  return (
    <div data-testid="auth-help-form" style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: `1px solid ${AUTH.LINE}`, paddingTop: 12 }}>
      <p style={{ margin: 0, fontSize: 14, color: AUTH.MUTED }}>{t('signin.help_desc')}</p>
      <AuthField label={t('signin.help_phone')} value={callPhone} onChange={setCallPhone} type="tel" inputMode="tel" autoComplete="tel" testId="auth-help-phone" />
      <AuthField label={t('signin.help_note')} value={note} onChange={setNote} maxLength={300} testId="auth-help-note" />
      {state === 'failed' && <p role="alert" style={{ margin: 0, fontSize: 14, color: AUTH.RED }}>{t('signin.help_failed')}</p>}
      <AuthButton variant="outline" onClick={send} disabled={state === 'sending' || callPhone.replace(/\D/g, '').length < 9} testId="auth-help-send">
        {t('signin.help_send')}
      </AuthButton>
    </div>
  );
}
