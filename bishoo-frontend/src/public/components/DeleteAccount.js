/**
 * DeleteAccount.js — "Futa akaunti" in the profile settings (owner approved 2026-11-10; Google Play
 * requires in-app account deletion). A code to the account's own phone confirms it, then the
 * account closes at once: profile, posts, products and listings go; orders stay without the name.
 * Server: POST /auth/delete-account/request, then /auth/delete-account/confirm.
 */
import React, { useState } from 'react';
import api from '../../api/api';

const RED = '#b42318';
const INK = '#0f1419';
const MUTED = '#536471';

const DeleteAccount = ({ onDeleted }) => {
  const [step, setStep] = useState('closed'); // closed | explain | code | done
  const [to, setTo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const sendCode = async () => {
    setBusy(true); setError('');
    try {
      const res = await api.post('/auth/delete-account/request');
      setTo(res.data?.to || ''); setCode(''); setStep('code');
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindikana kutuma namba. Jaribu tena.');
    } finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!/^\d{6}$/.test(code)) { setError('Weka namba 6 ulizopokea.'); return; }
    setBusy(true); setError('');
    try {
      await api.post('/auth/delete-account/confirm', { code });
      setStep('done');
      setTimeout(() => onDeleted?.(), 1500);
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindikana. Jaribu tena.');
    } finally { setBusy(false); }
  };

  const btn = (bg, color, border) => ({ width: '100%', padding: '12px 0', borderRadius: 10, border: border || 'none',
    background: bg, color, fontSize: 14, fontWeight: 800, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, fontFamily: 'inherit' });

  if (step === 'closed') {
    return (
      <button type="button" data-testid="delete-account-open" onClick={() => setStep('explain')}
        style={{ background: 'none', border: 'none', color: RED, fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '6px 0', alignSelf: 'center', fontFamily: 'inherit' }}>
        Futa akaunti
      </button>
    );
  }

  return (
    <div data-testid="delete-account" style={{ border: `1px solid #FECACA`, borderRadius: 14, padding: 16, background: '#fff', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: INK }}>Futa akaunti yako</div>
      {step === 'done' ? (
        <p role="status" style={{ margin: 0, fontSize: 14, color: INK }}>Akaunti yako imefutwa. Asante kwa kutumia KenteXa.</p>
      ) : (
        <>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
            <li>Wasifu wako, picha, machapisho, bidhaa, matangazo na ofa za Uza tena vitafutwa.</li>
            <li>Kumbukumbu za oda na malipo zinabaki kwa sheria, bila jina wala namba yako.</li>
            <li>Huwezi kurejesha akaunti hii. Unaweza kufungua mpya baadaye kwa namba ileile.</li>
          </ul>
          {step === 'explain' && (
            <button type="button" data-testid="delete-account-send" onClick={sendCode} disabled={busy} style={btn(RED, '#fff')}>
              {busy ? 'Subiri…' : 'Tuma namba ya uthibitisho'}
            </button>
          )}
          {step === 'code' && (
            <>
              <label style={{ fontSize: 13, color: INK }}>
                Namba 6 tuliyotuma {to ? `kwa ${to}` : ''}
                <input data-testid="delete-account-code" value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  style={{ display: 'block', width: '100%', marginTop: 6, padding: '10px 12px', fontSize: 18, letterSpacing: 4, border: '1px solid #cfd9de', borderRadius: 8, boxSizing: 'border-box', fontFamily: 'inherit' }} />
              </label>
              <button type="button" data-testid="delete-account-confirm" onClick={confirm} disabled={busy} style={btn(RED, '#fff')}>
                {busy ? 'Subiri…' : 'Futa akaunti kabisa'}
              </button>
            </>
          )}
          {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: RED }}>{error}</p>}
          <button type="button" onClick={() => { setStep('closed'); setError(''); }} disabled={busy} style={btn('#fff', INK, '1px solid #cfd9de')}>
            Ghairi
          </button>
        </>
      )}
    </div>
  );
};

export default DeleteAccount;
