/**
 * PostSafetyMenu.js — the ··· menu on someone else's post (Home Feed phase F, owner
 * approved 2026-11-02): mute that identity, or report the post.
 *
 * Mute hides the identity's posts from this person's own feeds only (POST /feed/mute).
 * A report goes to admin review with a reason (POST /feed/:id/report); nothing is hidden
 * or removed automatically. The server decides; this sheet only sends the choice.
 */
import React, { useState } from 'react';
import api from '../../api/api';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const RED = '#b91c1c';

export const REPORT_REASONS = Object.freeze([
  { key: 'fraud', label: 'Udanganyifu au utapeli' },
  { key: 'prohibited', label: 'Bidhaa au huduma iliyokatazwa' },
  { key: 'abuse', label: 'Matusi au unyanyasaji' },
  { key: 'spam', label: 'Taka (spam)' },
  { key: 'false_info', label: 'Taarifa za uongo' },
  { key: 'other', label: 'Sababu nyingine' },
]);

/** What a mute names: the post's commerce profile, or its account for posts without one. */
export const muteTargetFor = (biz) => (biz?.commerceProfileId
  ? { commerceProfileId: Number(biz.commerceProfileId) }
  : biz?.id ? { accountId: Number(biz.id) } : null);

const row = { display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 4px', border: 'none', borderBottom: `1px solid ${LINE}`,
  background: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, color: INK, width: '100%' };

export default function PostSafetyMenu({ postId, biz, bizName, onClose, onMuted }) {
  const [step, setStep] = useState('menu'); // menu | report | done
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const target = muteTargetFor(biz);

  const mute = async () => {
    if (!target || sending) return;
    setSending(true); setError('');
    try {
      const r = await api.post('/feed/mute', target);
      if (r?.data?.muted) onMuted?.();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindikana. Jaribu tena.');
    } finally { setSending(false); }
  };

  const report = async () => {
    if (!reason) { setError('Chagua sababu.'); return; }
    setSending(true); setError('');
    try {
      await api.post(`/feed/${postId}/report`, { reason });
      setStep('done');
    } catch (err) {
      setError(err?.response?.data?.message || 'Ripoti haikutumwa. Jaribu tena.');
    } finally { setSending(false); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Chaguo za chapisho" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 4200, background: 'rgba(15,20,25,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} data-testid="post-menu"
        style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: '18px 18px 0 0', padding: '12px 16px max(16px, env(safe-area-inset-bottom))' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e6ebef', margin: '0 auto 10px' }} />

        {step === 'menu' && (
          <>
            {target && (
              <button type="button" data-testid="menu-mute" onClick={mute} disabled={sending} style={row}>
                <span>Nyamazisha {bizName}</span>
                <span style={{ fontSize: 12, color: MUTED }}>Machapisho yao hayataonekana kwako. Hawataambiwa.</span>
              </button>
            )}
            <button type="button" data-testid="menu-report" onClick={() => { setStep('report'); setError(''); }} style={{ ...row, color: RED }}>
              <span>Ripoti chapisho</span>
              <span style={{ fontSize: 12, color: MUTED }}>Litaangaliwa na timu ya KenteXa.</span>
            </button>
            <button type="button" onClick={onClose} style={{ ...row, borderBottom: 'none' }}>Funga</button>
          </>
        )}

        {step === 'report' && (
          <div role="radiogroup" aria-label="Sababu ya kuripoti" style={{ display: 'flex', flexDirection: 'column' }}>
            <strong style={{ fontSize: 16, color: INK, marginBottom: 6 }}>Kwa nini unaripoti?</strong>
            {REPORT_REASONS.map((r) => (
              <button key={r.key} type="button" role="radio" aria-checked={reason === r.key} data-testid={`reason-${r.key}`}
                onClick={() => setReason(r.key)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', border: 'none', background: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 14, color: INK, textAlign: 'left' }}>
                <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: 8, flexShrink: 0, boxSizing: 'border-box',
                  border: reason === r.key ? '5px solid #2563EB' : '2px solid #cfd9de' }} />
                {r.label}
              </button>
            ))}
            <button type="button" data-testid="report-send" onClick={report} disabled={sending}
              style={{ marginTop: 8, height: 42, borderRadius: 21, border: 'none', background: INK, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>
              Tuma ripoti
            </button>
          </div>
        )}

        {step === 'done' && (
          <div data-testid="report-done" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '6px 0' }}>
            <strong style={{ fontSize: 16, color: INK }}>Asante, ripoti imetumwa</strong>
            <span style={{ fontSize: 14, color: MUTED, lineHeight: 1.45 }}>Timu ya KenteXa italiangalia chapisho hili. Unaweza pia kumnyamazisha {bizName} usione machapisho yao.</span>
            <button type="button" onClick={onClose}
              style={{ height: 42, borderRadius: 21, border: `1px solid #cfd9de`, background: '#fff', color: INK, fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>Funga</button>
          </div>
        )}

        {error && <div role="alert" style={{ fontSize: 13, color: RED, marginTop: 8 }}>{error}</div>}
      </div>
    </div>
  );
}
