/**
 * Admin: "Tuma taarifa" — KenteXa's messages to its users (owner 2026-11-09: "admin or staff need
 * to send notifications to user, app notifications or SMS ... with its link"). A message lands in
 * the person's Taarifa list and as a push on the phone, and opens the page it links to; SMS is
 * optional and shows its cost first.
 *
 * Who sends (owner's choice): admin and manager write; a manager's message to more than 100
 * people, or with SMS, waits for an admin to approve it here; customer care messages one person.
 * The server enforces all of this; this page only shows it.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';
import { useOptionalRoleContext } from '../../context/RoleContext';
import { MESSAGE_LINKS, linkLabel } from '../messageLinks';

const AUDIENCES = [
  ['all', 'Wote'], ['sellers', 'Wauzaji'], ['businesses', 'Wenye biashara'], ['super_agents', 'Ofisi'],
  ['agents', 'Agents'], ['transport', 'Usafiri'], ['services', 'Watoa huduma'],
];
const STATUS = {
  pending_approval: ['Inasubiri idhini', '#fef3c7', '#92400e'],
  scheduled: ['Imepangwa', '#eff6ff', '#075985'],
  sending: ['Inatumwa', '#eff6ff', '#075985'],
  sent: ['Imetumwa', '#dcfce7', '#166534'],
  rejected: ['Imekataliwa', '#fee2e2', '#b91c1c'],
  cancelled: ['Imesitishwa', '#f1f5f9', '#475569'],
};
const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const card = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 };
const input = { width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${LINE}`, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit', color: INK, background: '#fff' };
const label = { display: 'block', fontSize: 13, fontWeight: 700, color: INK, margin: '0 0 6px' };
const btn = (primary) => ({ border: primary ? 'none' : `1px solid ${LINE}`, background: primary ? INK : '#fff', color: primary ? '#fff' : INK, borderRadius: 20, padding: '9px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' });
const when = (d) => (d ? new Date(d).toLocaleString('sw-TZ', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const tzs = (n) => `TZS ${Number(n || 0).toLocaleString('en-US')}`;

const empty = { mode: 'group', audience: 'all', targetUserId: null, targetName: '', title: '', message: '', link: 'none', param: '', linkUrl: '', sendSms: false, later: false, scheduledAt: '' };

export default function Announcements({ activePage, onNavigate, onLogout, targetUserId, targetName }) {
  const rc = useOptionalRoleContext();
  const roleType = rc?.activeContext?.roleType || 'admin';
  const myId = rc?.user?.id;
  const isAdmin = roleType === 'admin';
  const onlyOne = roleType === 'customer_care';
  const [form, setForm] = useState(() => ({ ...empty, ...(targetUserId || onlyOne ? { mode: 'one', targetUserId: targetUserId || null, targetName: targetName || '' } : {}) }));
  const [list, setList] = useState([]);
  const [tab, setTab] = useState('all');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null); // { ok, text }
  const [people, setPeople] = useState([]);
  const [query, setQuery] = useState('');
  const [rejecting, setRejecting] = useState(null); // { id, reason }

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const chosen = MESSAGE_LINKS.find((l) => l.key === form.link) || MESSAGE_LINKS[0];

  const payload = useMemo(() => ({
    title: form.title, message: form.message,
    audience: form.mode === 'group' ? form.audience : undefined,
    targetUserId: form.mode === 'one' ? form.targetUserId : undefined,
    actionPage: chosen.page || undefined,
    actionParam: chosen.param ? form.param.trim() || undefined : undefined,
    linkUrl: chosen.key === 'external' ? form.linkUrl.trim() || undefined : undefined,
    sendSms: form.sendSms,
    scheduledAt: form.later && form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
  }), [form, chosen]);

  const load = useCallback(() => {
    api.get('/announcements/messages').then((r) => setList(r.data || [])).catch(() => setList([]));
  }, []);
  useEffect(load, [load]);

  // Count people and SMS cost while writing (after a short pause).
  const ready = form.title.trim() && form.message.trim() && (form.mode === 'group' || form.targetUserId);
  useEffect(() => {
    if (!ready) { setPreview(null); return undefined; }
    const t = setTimeout(() => {
      api.post('/announcements/messages/preview', payload).then((r) => setPreview(r.data)).catch(() => setPreview(null));
    }, 500);
    return () => clearTimeout(t);
  }, [ready, payload]);

  const findPeople = async (q) => {
    setQuery(q);
    if (q.trim().length < 2) { setPeople([]); return; }
    try {
      if (!findPeople.all) findPeople.all = (await api.get('/users')).data || [];
      const s = q.toLowerCase();
      setPeople(findPeople.all.filter((u) => [u.name, u.phone, u.email, String(u.id)].some((v) => String(v || '').toLowerCase().includes(s))).slice(0, 8));
    } catch { setPeople([]); }
  };

  const say = (ok, text) => { setNote({ ok, text }); setTimeout(() => setNote(null), 6000); };
  const fail = (e) => say(false, e?.response?.data?.message || 'Imeshindwa. Jaribu tena.');

  const send = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/announcements/messages', payload);
      say(true, data.status === 'pending_approval' ? 'Imetumwa kwa admin kuidhinisha.' : data.status === 'scheduled' ? `Imepangwa: ${when(data.scheduledAt)}.` : `Imetumwa kwa watu ${data.recipientCount}.`);
      setForm({ ...empty, mode: onlyOne ? 'one' : 'group' });
      setPreview(null);
      load();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true);
    try { await api.post('/announcements/messages/test', payload); say(true, 'Nakala imetumwa kwako. Fungua Taarifa uone inavyoonekana.'); } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const act = async (id, what, body) => {
    try { await api.post(`/announcements/messages/${id}/${what}`, body || {}); setRejecting(null); load(); } catch (e) { fail(e); }
  };

  const waiting = list.filter((m) => m.status === 'pending_approval');
  const shown = tab === 'waiting' ? waiting : list;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc', color: INK }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100 }}>
        <header>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Tuma taarifa</h1>
          <p style={{ margin: '4px 0 0', color: MUTED, fontSize: 14 }}>
            Ujumbe unafika kwenye Taarifa za mtu na kwenye simu yake, na unafungua ukurasa wa KenteXa unaouchagua.
            {!isAdmin && !onlyOne && ' Ujumbe kwa watu zaidi ya 100, au wenye SMS, unasubiri admin aidhinishe.'}
            {onlyOne && ' Huduma kwa wateja wanatuma kwa mtu mmoja.'}
          </p>
        </header>

        {note && <div role={note.ok ? 'status' : 'alert'} style={{ padding: '12px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: note.ok ? '#dcfce7' : '#fee2e2', color: note.ok ? '#166534' : '#b91c1c' }}>{note.text}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(260px, 2fr)', gap: 16, alignItems: 'start' }}>
          <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 14 }} data-testid="composer">
            <div>
              <span style={label}>Kwa nani</span>
              {!onlyOne && (
                <div role="tablist" style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  {[['group', 'Kundi'], ['one', 'Mtu mmoja']].map(([k, t]) => (
                    <button key={k} type="button" role="tab" aria-selected={form.mode === k} onClick={() => set({ mode: k })} style={{ ...btn(form.mode === k), padding: '7px 14px' }}>{t}</button>
                  ))}
                </div>
              )}
              {form.mode === 'group' ? (
                <select aria-label="Kundi" value={form.audience} onChange={(e) => set({ audience: e.target.value })} style={input}>
                  {AUDIENCES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                </select>
              ) : form.targetUserId ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...input }}>
                  <span><b>{form.targetName || `Mtumiaji #${form.targetUserId}`}</b></span>
                  <button type="button" onClick={() => set({ targetUserId: null, targetName: '' })} style={{ background: 'none', border: 'none', color: '#1d4ed8', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>Badilisha</button>
                </div>
              ) : (
                <div>
                  <input aria-label="Tafuta mtu" placeholder="Jina, simu au namba ya mtumiaji" value={query} onChange={(e) => findPeople(e.target.value)} style={input} />
                  {people.map((u) => (
                    <button key={u.id} type="button" onClick={() => { set({ targetUserId: u.id, targetName: u.name || u.phone || `#${u.id}` }); setPeople([]); setQuery(''); }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: `1px solid ${LINE}`, padding: '8px 4px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, color: INK }}>
                      {u.name || '—'} <span style={{ color: MUTED }}>{u.phone || u.email || ''} · #{u.id}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="msg-title" style={label}>Kichwa <span style={{ color: MUTED, fontWeight: 500 }}>({form.title.length}/80)</span></label>
              <input id="msg-title" maxLength={80} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Mfano: POS sasa inahesabu madeni" style={input} />
            </div>
            <div>
              <label htmlFor="msg-body" style={label}>Ujumbe <span style={{ color: MUTED, fontWeight: 500 }}>({form.message.length}/600)</span></label>
              <textarea id="msg-body" maxLength={600} rows={4} value={form.message} onChange={(e) => set({ message: e.target.value })} placeholder="Eleza kwa ufupi, kwa Kiswahili rahisi." style={{ ...input, resize: 'vertical' }} />
            </div>

            <div>
              <label htmlFor="msg-link" style={label}>Kiungo</label>
              <select id="msg-link" value={form.link} onChange={(e) => set({ link: e.target.value, param: '', linkUrl: '' })} style={input}>
                {MESSAGE_LINKS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
              </select>
              {chosen.param && <input aria-label={chosen.param} placeholder={chosen.param} value={form.param} onChange={(e) => set({ param: e.target.value.replace(/[^A-Za-z0-9_-]/g, '') })} style={{ ...input, marginTop: 8 }} />}
              {chosen.key === 'external' && <input aria-label="Kiungo cha nje" placeholder="https://" value={form.linkUrl} onChange={(e) => set({ linkUrl: e.target.value })} style={{ ...input, marginTop: 8 }} />}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
              <span style={label}>Njia</span>
              <span style={{ color: MUTED }}>Taarifa kwenye app na kwenye simu (push) — kila mara, bila gharama.</span>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.sendSms} onChange={(e) => set({ sendSms: e.target.checked })} /> Tuma pia SMS (ina gharama)
              </label>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
              <span style={label}>Lini</span>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}><input type="radio" checked={!form.later} onChange={() => set({ later: false })} /> Sasa hivi</label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}><input type="radio" checked={form.later} onChange={() => set({ later: true })} /> Baadaye</label>
              {form.later && <input type="datetime-local" aria-label="Muda wa kutuma" value={form.scheduledAt} onChange={(e) => set({ scheduledAt: e.target.value })} style={input} />}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" data-testid="msg-send" disabled={!ready || busy} onClick={send} style={{ ...btn(true), opacity: !ready || busy ? 0.5 : 1 }}>
                {preview?.needsApproval ? 'Tuma kwa admin aidhinishe' : form.later ? 'Panga kutuma' : 'Tuma'}
              </button>
              <button type="button" data-testid="msg-test" disabled={!form.title.trim() || !form.message.trim() || busy} onClick={test} style={btn(false)}>Nitumie nakala kwanza</button>
            </div>
          </section>

          <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <section style={card} data-testid="msg-preview">
              <span style={label}>Inavyoonekana kwenye simu</span>
              <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: 12, background: '#f8fafc' }}>
                <div style={{ fontSize: 12, color: MUTED, fontWeight: 700 }}>KenteXa · sasa hivi</div>
                <div style={{ fontWeight: 800, marginTop: 4 }}>{form.title || 'Kichwa'}</div>
                <div style={{ color: '#334155', marginTop: 2, whiteSpace: 'pre-wrap', fontSize: 14 }}>{form.message || 'Ujumbe utaonekana hapa.'}</div>
                {(chosen.page || form.linkUrl) && <div style={{ marginTop: 8, fontSize: 13, color: '#1d4ed8', fontWeight: 700 }}>Inafungua: {chosen.page ? linkLabel(chosen.page, form.param) : form.linkUrl}</div>}
              </div>
            </section>
            <section style={card}>
              <span style={label}>Itawafikia</span>
              {preview ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 }}>
                  <div><b style={{ fontSize: 22 }}>{preview.recipients.toLocaleString('en-US')}</b> watu</div>
                  {form.sendSms && <div>SMS: {preview.withPhone.toLocaleString('en-US')} wenye simu × sehemu {preview.smsParts} = <b>{tzs(preview.smsCostTzs)}</b></div>}
                  {preview.needsApproval && <div style={{ color: '#92400e' }}>Inahitaji idhini ya admin kabla ya kutumwa.</div>}
                </div>
              ) : <div style={{ color: MUTED, fontSize: 14 }}>Andika kichwa na ujumbe, kisha uchague anayepokea.</div>}
            </section>
          </aside>
        </div>

        <section style={card}>
          <div role="tablist" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button type="button" role="tab" aria-selected={tab === 'all'} onClick={() => setTab('all')} style={{ ...btn(tab === 'all'), padding: '7px 14px' }}>Zote</button>
            <button type="button" role="tab" aria-selected={tab === 'waiting'} onClick={() => setTab('waiting')} style={{ ...btn(tab === 'waiting'), padding: '7px 14px' }}>Zinasubiri idhini ({waiting.length})</button>
          </div>
          {shown.length === 0 ? <p style={{ color: MUTED, margin: 0 }}>Hakuna taarifa bado.</p> : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} data-testid="msg-list">
              {shown.map((m) => {
                const [st, bg, fg] = STATUS[m.status] || STATUS.sent;
                const mine = !!myId && m.createdBy?.id === myId;
                return (
                  <li key={m.id} data-testid={`msg-${m.id}`} style={{ borderTop: `1px solid ${LINE}`, padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <b style={{ fontSize: 15 }}>{m.title}</b>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 10, background: bg, color: fg }}>{st}</span>
                      {m.sendSms && <span style={{ fontSize: 12, color: MUTED }}>+ SMS</span>}
                    </div>
                    <div style={{ fontSize: 14, color: '#334155' }}>{m.message}</div>
                    <div style={{ fontSize: 13, color: MUTED }}>
                      {[`Kwa: ${m.audienceLabel}`, m.actionPage ? `Inafungua: ${linkLabel(m.actionPage, m.actionParam)}` : null,
                        m.createdBy?.name ? `Ameandika: ${m.createdBy.name}` : null, m.approvedBy && m.status !== 'rejected' ? `Ameidhinisha: ${m.approvedBy}` : null,
                        m.status === 'scheduled' ? `Itatumwa ${when(m.scheduledAt)}` : when(m.sentAt || m.createdAt)].filter(Boolean).join(' · ')}
                    </div>
                    {m.status === 'sent' && (
                      <div style={{ fontSize: 13 }}>
                        Imefika kwa <b>{m.recipientCount.toLocaleString('en-US')}</b> · imefunguliwa na <b>{m.openedCount.toLocaleString('en-US')}</b>
                        {m.recipientCount > 0 ? ` (${Math.round((m.openedCount / m.recipientCount) * 100)}%)` : ''}
                        {m.sendSms ? ` · SMS ${m.smsCount}` : ''}
                      </div>
                    )}
                    {m.status === 'rejected' && m.rejectReason && <div style={{ fontSize: 13, color: '#b91c1c' }}>Sababu: {m.rejectReason}</div>}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {isAdmin && m.status === 'pending_approval' && rejecting?.id !== m.id && (
                        <>
                          <button type="button" data-testid={`approve-${m.id}`} onClick={() => act(m.id, 'approve')} style={{ ...btn(true), padding: '6px 14px', fontSize: 13 }}>Idhinisha na tuma</button>
                          <button type="button" onClick={() => setRejecting({ id: m.id, reason: '' })} style={{ ...btn(false), padding: '6px 14px', fontSize: 13 }}>Kataa</button>
                        </>
                      )}
                      {rejecting?.id === m.id && (
                        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                          <input aria-label="Sababu ya kukataa" placeholder="Sababu (ataiona aliyeandika)" value={rejecting.reason} onChange={(e) => setRejecting({ id: m.id, reason: e.target.value })} style={{ ...input, flex: 1 }} />
                          <button type="button" onClick={() => act(m.id, 'reject', { reason: rejecting.reason })} style={{ ...btn(true), padding: '6px 14px', fontSize: 13 }}>Kataa</button>
                          <button type="button" onClick={() => setRejecting(null)} style={{ ...btn(false), padding: '6px 14px', fontSize: 13 }}>Acha</button>
                        </div>
                      )}
                      {['pending_approval', 'scheduled'].includes(m.status) && (isAdmin || mine) && rejecting?.id !== m.id && (
                        <button type="button" onClick={() => act(m.id, 'cancel')} style={{ ...btn(false), padding: '6px 14px', fontSize: 13 }}>Sitisha</button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
