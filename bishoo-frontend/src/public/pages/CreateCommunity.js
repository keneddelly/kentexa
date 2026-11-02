/**
 * CreateCommunity.js — "Fungua jumuiya" (Social Home part 3, owner approved 2026-11-02).
 * Opened from the "+" sheet. Name, purpose, one topic, optional rules, who can join.
 * The server checks the verified phone, the 5-per-person limit and a free name.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#e6ebef';

const field = { width: '100%', boxSizing: 'border-box', border: `1px solid ${LINE}`, borderRadius: 10, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', color: INK, background: '#fff' };
const pill = (on) => ({ padding: '6px 12px', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
  border: `1px solid ${on ? INK : LINE}`, background: '#fff', color: on ? INK : MUTED });

export default function CreateCommunity({ onNavigate, isLoggedIn }) {
  const [topics, setTopics] = useState([]);
  const [form, setForm] = useState({ name: '', purpose: '', topicKey: '', rules: '', joinPolicy: 'open' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return undefined; }
    let alive = true;
    api.get('/feed/topics').then((r) => { if (alive) setTopics(Array.isArray(r?.data) ? r.data : []); }).catch(() => {});
    return () => { alive = false; };
  }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async () => {
    if (!form.name.trim()) { setError('Jaza jina la jumuiya.'); return; }
    if (!form.purpose.trim()) { setError('Eleza jumuiya inahusu nini.'); return; }
    if (!form.topicKey) { setError('Chagua mada ya jumuiya.'); return; }
    setSaving(true); setError('');
    try {
      const r = await api.post('/communities', form);
      onNavigate(`Community-${r.data.id}`);
    } catch (err) {
      setError(err?.response?.data?.message || 'Jumuiya haikufunguliwa. Jaribu tena.');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', minHeight: '100vh', background: '#fff', padding: '16px 16px 40px', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" aria-label="Rudi" onClick={() => onNavigate('Home')}
          style={{ width: 34, height: 34, border: 'none', background: 'none', cursor: 'pointer', fontSize: 22, color: INK }}>‹</button>
        <h1 style={{ margin: 0, fontSize: 20, color: INK }}>Fungua jumuiya</h1>
      </div>
      <label style={{ fontSize: 13, fontWeight: 700, color: MUTED }}>Jina
        <input data-testid="community-name" value={form.name} onChange={set('name')} maxLength={80} placeholder="Mfano: Wakulima Mwanza" style={{ ...field, marginTop: 4 }} />
      </label>
      <label style={{ fontSize: 13, fontWeight: 700, color: MUTED }}>Inahusu nini
        <textarea data-testid="community-purpose" value={form.purpose} onChange={set('purpose')} maxLength={300} rows={3} style={{ ...field, marginTop: 4, resize: 'vertical' }} />
      </label>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: MUTED, marginBottom: 6 }}>Mada</div>
        <div role="radiogroup" aria-label="Mada" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {topics.map((t) => (
            <button key={t.key} type="button" role="radio" aria-checked={form.topicKey === t.key} data-testid={`community-topic-${t.key}`}
              onClick={() => setForm((f) => ({ ...f, topicKey: t.key }))} style={pill(form.topicKey === t.key)}>{t.label}</button>
          ))}
        </div>
      </div>
      <label style={{ fontSize: 13, fontWeight: 700, color: MUTED }}>Kanuni (si lazima)
        <textarea value={form.rules} onChange={set('rules')} maxLength={500} rows={2} placeholder="Mfano: heshima, hakuna utapeli" style={{ ...field, marginTop: 4, resize: 'vertical' }} />
      </label>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: MUTED, marginBottom: 6 }}>Nani anaweza kujiunga</div>
        <div role="radiogroup" aria-label="Nani anaweza kujiunga" style={{ display: 'flex', gap: 6 }}>
          <button type="button" role="radio" aria-checked={form.joinPolicy === 'open'} onClick={() => setForm((f) => ({ ...f, joinPolicy: 'open' }))} style={pill(form.joinPolicy === 'open')}>Yeyote</button>
          <button type="button" role="radio" aria-checked={form.joinPolicy === 'request'} data-testid="community-request" onClick={() => setForm((f) => ({ ...f, joinPolicy: 'request' }))} style={pill(form.joinPolicy === 'request')}>Kwa ombi</button>
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>
          {form.joinPolicy === 'request' ? 'Unakubali kila ombi. Machapisho yanaonekana kwa wanachama tu.' : 'Yeyote anajiunga mara moja. Machapisho yanaweza kufika Mwanzo chini ya mada yake.'}
        </div>
      </div>
      {error && <div role="alert" style={{ fontSize: 13, color: '#b91c1c' }}>{error}</div>}
      <button type="button" data-testid="community-create" onClick={submit} disabled={saving}
        style={{ height: 46, borderRadius: 23, border: 'none', background: INK, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>
        Fungua
      </button>
    </div>
  );
}
