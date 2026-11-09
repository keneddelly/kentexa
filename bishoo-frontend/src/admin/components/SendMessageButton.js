/**
 * "Tuma taarifa" right where the admin is looking (owner 2026-11-09: "make it easy, even when you
 * open user, business, office and etc admin can send taarifa on that screen"). A button that opens
 * a small window to message this one person (the account behind the user, business, office,
 * agent or transport), with a link inside KenteXa and optional SMS. It uses the same server rules
 * as the full Tuma taarifa page (POST /announcements/messages): one person is allowed for admin,
 * manager and customer care; SMS from a manager waits for admin.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import { MESSAGE_LINKS, linkLabel } from '../messageLinks';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const input = { width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${LINE}`, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit', color: INK, background: '#fff' };
const pill = (primary) => ({ border: primary ? 'none' : `1px solid ${LINE}`, background: primary ? INK : '#fff', color: primary ? '#fff' : INK, borderRadius: 18, height: 36, padding: '0 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' });

export default function SendMessageButton({ userId, name, label = 'Tuma taarifa', small = false, testId }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('none');
  const [param, setParam] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [sendSms, setSendSms] = useState(false);
  const [cost, setCost] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const chosen = MESSAGE_LINKS.find((l) => l.key === link) || MESSAGE_LINKS[0];

  const payload = {
    targetUserId: userId, title, message,
    actionPage: chosen.page || undefined,
    actionParam: chosen.param ? param.trim() || undefined : undefined,
    linkUrl: chosen.key === 'external' ? linkUrl.trim() || undefined : undefined,
    sendSms,
  };
  const ready = !!(userId && title.trim() && message.trim());

  // SMS cost and whether admin must approve, once there is something to send.
  useEffect(() => {
    if (!open || !ready || !sendSms) { setCost(null); return undefined; }
    const t = setTimeout(() => {
      api.post('/announcements/messages/preview', payload).then((r) => setCost(r.data)).catch(() => setCost(null));
    }, 400);
    return () => clearTimeout(t);
  }, [open, ready, sendSms, title, message, link, param, linkUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!userId) return null;

  const close = () => { setOpen(false); setNote(null); };
  const reset = () => { setTitle(''); setMessage(''); setLink('none'); setParam(''); setLinkUrl(''); setSendSms(false); setCost(null); };
  const send = async () => {
    setBusy(true); setNote(null);
    try {
      const { data } = await api.post('/announcements/messages', payload);
      setNote({ ok: true, text: data.status === 'pending_approval' ? 'Imetumwa kwa admin kuidhinisha (ina SMS).' : `Imetumwa kwa ${name || 'mtumiaji'}.` });
      reset();
    } catch (e) {
      setNote({ ok: false, text: e?.response?.data?.message || 'Imeshindwa. Jaribu tena.' });
    } finally { setBusy(false); }
  };

  return (
    <>
      <button type="button" data-testid={testId || `send-message-${userId}`} onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        style={small ? { ...pill(false), height: 28, padding: '0 10px', fontSize: 12 } : pill(true)}>
        {label}
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={`Tuma taarifa kwa ${name || 'mtumiaji'}`} onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) close(); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, color: INK, textAlign: 'left' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Tuma taarifa</h3>
              <div style={{ color: MUTED, fontSize: 14, marginTop: 2 }}>Kwa: <b style={{ color: INK }}>{name || `Mtumiaji #${userId}`}</b> · inafika kwenye Taarifa zake na simu yake</div>
            </div>
            {note && <div role={note.ok ? 'status' : 'alert'} style={{ padding: '10px 12px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: note.ok ? '#dcfce7' : '#fee2e2', color: note.ok ? '#166534' : '#991b1b' }}>{note.text}</div>}
            <input aria-label="Kichwa cha taarifa" maxLength={80} placeholder="Kichwa" value={title} onChange={(e) => setTitle(e.target.value)} style={input} />
            <textarea aria-label="Ujumbe wa taarifa" maxLength={600} rows={4} placeholder="Ujumbe, kwa Kiswahili rahisi" value={message} onChange={(e) => setMessage(e.target.value)} style={{ ...input, resize: 'vertical' }} />
            <select aria-label="Kiungo cha taarifa" value={link} onChange={(e) => { setLink(e.target.value); setParam(''); setLinkUrl(''); }} style={input}>
              {MESSAGE_LINKS.map((l) => <option key={l.key} value={l.key}>{l.key === 'none' ? 'Kiungo: hakuna' : `Kiungo: ${l.label}`}</option>)}
            </select>
            {chosen.param && <input aria-label={chosen.param} placeholder={chosen.param} value={param} onChange={(e) => setParam(e.target.value.replace(/[^A-Za-z0-9_-]/g, ''))} style={input} />}
            {chosen.key === 'external' && <input aria-label="Kiungo cha nje" placeholder="https://" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} style={input} />}
            {chosen.page && <div style={{ fontSize: 13, color: '#1d4ed8', fontWeight: 700 }}>Inafungua: {linkLabel(chosen.page, param)}</div>}
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} /> Tuma pia SMS
              {cost && <span style={{ color: MUTED }}>· TZS {Number(cost.smsCostTzs || 0).toLocaleString('en-US')}{cost.withPhone === 0 ? ' (hana simu)' : ''}</span>}
            </label>
            {cost?.needsApproval && <div style={{ fontSize: 13, color: '#92400e' }}>SMS inasubiri idhini ya admin kabla ya kutumwa.</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" onClick={close} style={pill(false)}>Funga</button>
              <button type="button" data-testid="send-message-submit" disabled={!ready || busy} onClick={send} style={{ ...pill(true), opacity: !ready || busy ? 0.5 : 1 }}>{busy ? 'Inatuma...' : 'Tuma'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
