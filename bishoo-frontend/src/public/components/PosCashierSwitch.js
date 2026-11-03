/**
 * PosCashierSwitch.js — "Badilisha mhudumu" (owner approved 2026-11-03): pick your name and type
 * your 4-digit PIN; works without internet (utils/posCashier). A cashier with no PIN yet can set
 * one while online (the owner, or someone allowed to manage the team, can set anyone's).
 */
import React, { useState } from 'react';
import api from '../../api/api';
import { pinMatches } from '../../utils/posCashier';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const EDGE = '#cfd9de';
const RED = '#b42318';
const pill = (dark, disabled) => ({ height: 44, padding: '0 18px', borderRadius: 22, border: dark ? 'none' : `1px solid ${EDGE}`, background: dark ? INK : '#fff',
  color: dark ? '#fff' : INK, fontSize: 15, fontWeight: 700, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1, fontFamily: 'inherit' });
const key = { height: 56, borderRadius: 14, border: `1px solid ${EDGE}`, background: '#fff', fontSize: 22, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: INK };

export default function PosCashierSwitch({ cashiers = [], current, online, openShiftWarning, onCloseShiftFirst, onPick, onClose, onPinSet }) {
  const [who, setWho] = useState(null);
  const [pin, setPin] = useState('');
  const [setting, setSetting] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const press = async (d) => {
    setError('');
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length < 4) return;
    if (setting) {
      setBusy(true);
      try {
        await api.post(`/sales/pos/cashiers/${who.userId}/pin`, { pin: next });
        await onPinSet?.();
        onPick({ userId: who.userId, name: who.name });
      } catch (e) { setError(e?.response?.data?.message || 'PIN haikuwekwa. Jaribu tena.'); setPin(''); } finally { setBusy(false); }
      return;
    }
    if (await pinMatches(who, next)) onPick({ userId: who.userId, name: who.name });
    else { setError('PIN si sahihi.'); setPin(''); }
  };

  return (
    <div role="dialog" aria-label="Badilisha mhudumu" data-testid="pos-cashier-switch"
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,20,25,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 380, background: '#fff', borderRadius: 20, padding: 20, color: INK, display: 'flex', flexDirection: 'column', gap: 14, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{who ? who.name : 'Nani yuko kaunta?'}</h2>
          <button type="button" onClick={onClose} style={{ ...pill(false), height: 36 }}>Funga</button>
        </div>
        {openShiftWarning && !who && (
          <div style={{ background: '#fffbeb', color: '#92400e', borderRadius: 12, padding: 12, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            Zamu ya {current?.name || 'mhudumu huyu'} bado iko wazi. Ifunge kwanza ili droo yake ihesabiwe peke yake.
            <button type="button" onClick={onCloseShiftFirst} style={{ ...pill(true), height: 38 }}>Funga zamu kwanza</button>
          </div>
        )}
        {!who ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {cashiers.length === 0 && <p style={{ margin: 0, color: MUTED, fontSize: 14 }}>Hakuna wahudumu. Ongeza timu kwenye Kazi → Timu, ruhusa ya POS.</p>}
            {cashiers.map((c) => (
              <button key={c.userId} type="button" data-testid={`cashier-${c.userId}`} disabled={!c.hasPin && !online}
                onClick={() => { setWho(c); setPin(''); setSetting(!c.hasPin); setError(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', border: 'none', borderBottom: `1px solid ${LINE}`, background: 'none',
                  cursor: !c.hasPin && !online ? 'default' : 'pointer', fontFamily: 'inherit', color: INK, textAlign: 'left', opacity: !c.hasPin && !online ? 0.5 : 1 }}>
                <span style={{ width: 40, height: 40, borderRadius: 20, background: '#f7f9f9', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{String(c.name || 'M').charAt(0).toUpperCase()}</span>
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <b style={{ fontSize: 15 }}>{c.name}{current?.userId === c.userId ? ' · yuko kaunta' : ''}</b>
                  <span style={{ fontSize: 13, color: MUTED }}>{c.owner ? 'Mwenye duka' : 'Mhudumu'}{c.hasPin ? '' : online ? ' · weka PIN' : ' · hana PIN bado (inahitaji mtandao)'}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <span style={{ fontSize: 15, color: MUTED }}>{setting ? 'Chagua PIN mpya ya tarakimu 4' : 'Weka PIN yako'}</span>
            <div aria-label="PIN" style={{ display: 'flex', justifyContent: 'center', gap: 14 }}>
              {[0, 1, 2, 3].map((i) => <span key={i} style={{ width: 16, height: 16, borderRadius: 8, background: i < pin.length ? INK : LINE }} />)}
            </div>
            {error && <p role="alert" style={{ margin: 0, color: RED, fontSize: 14, textAlign: 'center' }}>{error}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button key={d} type="button" data-testid={`pin-${d}`} disabled={busy} onClick={() => press(d)} style={key}>{d}</button>
              ))}
              <button type="button" onClick={() => { setWho(null); setPin(''); }} style={{ ...key, fontSize: 14 }}>Rudi</button>
              <button type="button" data-testid="pin-0" disabled={busy} onClick={() => press('0')} style={key}>0</button>
              <button type="button" onClick={() => setPin((p) => p.slice(0, -1))} style={{ ...key, fontSize: 14 }}>Futa</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
