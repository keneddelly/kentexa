import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

/**
 * Admin: Mfululizo na Mada (Topic Series #410 phase 3, owner approved 2026-11-17).
 *  Mfululizo  every series (draft, published, archived); create one; open one to edit its name,
 *             description, cover and topics, publish / archive it, attach a public post by its link,
 *             move episodes up and down, remove one. Only published series and public posts are
 *             ever shown to people.
 *  Mada       the topics: name, short note, description for the topic page, place, on / off; add one.
 */
const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const STATUS = { draft: ['Rasimu', '#f1f5f9', '#334155'], published: ['Imechapishwa', '#dcfce7', '#166534'], archived: ['Imehifadhiwa', '#fef3c7', '#92400e'] };

const card = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 };
const input = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 10, border: '1px solid #cfd9de', fontSize: 14, fontFamily: 'inherit' };
const btn = (dark, busy) => ({ height: 38, padding: '0 16px', borderRadius: 19, border: dark ? 'none' : '1px solid #cfd9de', background: dark ? INK : '#fff',
  color: dark ? '#fff' : INK, fontWeight: 700, fontSize: 14, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, fontFamily: 'inherit' });
const small = { height: 30, minWidth: 30, padding: '0 10px', borderRadius: 15, border: '1px solid #cfd9de', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700 };
const Tag = ({ s }) => {
  const [t, bg, fg] = STATUS[s] || STATUS.draft;
  return <span style={{ background: bg, color: fg, fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>{t}</span>;
};
const err = (e, fallback = 'Imeshindikana') => {
  const m = e?.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : (m || fallback);
};
const Label = ({ children }) => <span style={{ fontSize: 13, fontWeight: 700, color: MUTED }}>{children}</span>;

/** Choose topics as chips. */
const TopicChips = ({ topics, value, onChange }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
    {topics.filter((t) => t.active !== false).map((t) => {
      const on = value.includes(t.key);
      return (
        <button key={t.key} type="button" onClick={() => onChange(on ? value.filter((k) => k !== t.key) : [...value, t.key])}
          style={{ border: on ? 'none' : '1px solid #cfd9de', background: on ? INK : '#fff', color: on ? '#fff' : INK, borderRadius: 999, padding: '5px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          {t.label}
        </button>
      );
    })}
  </div>
);

export function SeriesEditor({ id, topics, onBack }) {
  const [s, setS] = useState(null);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [post, setPost] = useState('');
  const [epTitle, setEpTitle] = useState('');

  const take = (data) => {
    setS(data);
    setForm({ title: data.title || '', description: data.description || '', coverUrl: data.coverUrl || '', topics: data.topics || [], communityId: data.communityId ?? '' });
  };
  useEffect(() => {
    Promise.resolve().then(() => api.get(`/series/admin/${id}`)).then((r) => take(r.data)).catch((e) => setMsg(err(e, 'Imeshindikana kupakia')));
  }, [id]);

  const run = async (fn, done) => {
    setBusy(true); setMsg('');
    try { const r = await fn(); if (r?.data) take(r.data); if (done) setMsg(done); return true; }
    catch (e) { setMsg(err(e)); return false; } finally { setBusy(false); }
  };
  const save = () => run(() => api.patch(`/series/${id}`, {
    title: form.title, description: form.description, coverUrl: form.coverUrl, topics: form.topics,
    communityId: form.communityId === '' ? null : Number(form.communityId),
  }), 'Imehifadhiwa');
  const setStatus = (status) => run(() => api.patch(`/series/${id}`, { status }), status === 'published' ? 'Imechapishwa: watu wanaiona sasa' : 'Hali imebadilishwa');
  const add = async () => {
    if (await run(() => api.post(`/series/${id}/episodes`, { post, title: epTitle || undefined }), 'Sehemu imeongezwa')) { setPost(''); setEpTitle(''); }
  };
  const move = (index, step) => {
    const ids = s.episodeList.map((e) => e.postId);
    const j = index + step;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    run(() => api.put(`/series/${id}/episodes/order`, { postIds: ids }));
  };
  const remove = (postId) => run(() => api.delete(`/series/${id}/episodes/${postId}`), 'Sehemu imeondolewa');
  const uploadCover = async (file) => {
    if (!file) return;
    setBusy(true); setMsg('');
    try {
      const fd = new FormData();
      fd.append('files', file);
      const up = await api.post('/upload/images', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = up?.data?.urls?.[0];
      if (!url) throw new Error('Picha haikupakiwa');
      setForm((f) => ({ ...f, coverUrl: url }));
    } catch (e) { setMsg(err(e, 'Picha haikupakiwa')); } finally { setBusy(false); }
  };

  return (
    <div data-testid="series-editor" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button type="button" onClick={onBack} style={{ ...btn(false), alignSelf: 'flex-start' }}>← Mfululizo yote</button>
      {msg && <div role="status" style={{ fontSize: 14 }}>{msg}</div>}
      {!s && !msg && <div>Inapakia…</div>}
      {s && form && (
        <>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <b style={{ fontSize: 18 }}>{s.title}</b><Tag s={s.status} />
            </div>
            <Label>Jina</Label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120} style={input} data-testid="series-edit-title" />
            <Label>Maelezo</Label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} maxLength={2000} style={{ ...input, resize: 'vertical' }} />
            <Label>Picha ya juu</Label>
            {form.coverUrl && <img src={form.coverUrl} alt="" style={{ width: 240, maxWidth: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 10 }} />}
            <input type="file" accept="image/*" onChange={(e) => uploadCover(e.target.files?.[0])} style={{ fontSize: 14 }} />
            <Label>Mada</Label>
            <TopicChips topics={topics} value={form.topics} onChange={(v) => setForm({ ...form, topics: v })} />
            <Label>Jumuiya (namba, si lazima)</Label>
            <input value={form.communityId} onChange={(e) => setForm({ ...form, communityId: e.target.value.replace(/\D/g, '') })} inputMode="numeric" style={{ ...input, width: 160 }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" disabled={busy} onClick={save} style={btn(true, busy)} data-testid="series-save">Hifadhi</button>
              {s.status !== 'published' && <button type="button" disabled={busy} onClick={() => setStatus('published')} style={btn(false, busy)} data-testid="series-publish">Chapisha</button>}
              {s.status === 'published' && <button type="button" disabled={busy} onClick={() => setStatus('draft')} style={btn(false, busy)}>Rudisha rasimu</button>}
              {s.status !== 'archived' && <button type="button" disabled={busy} onClick={() => setStatus('archived')} style={btn(false, busy)}>Hifadhi kumbukumbu</button>}
              {s.status === 'published' && <a href={s.path} target="_blank" rel="noreferrer" style={{ alignSelf: 'center', color: '#1d9bf0', fontWeight: 700, fontSize: 14 }}>Fungua ukurasa</a>}
            </div>
          </div>

          <div style={card}>
            <b>Sehemu ({s.episodeList.length})</b>
            {s.episodeList.length === 0 && <span style={{ fontSize: 14, color: MUTED }}>Bado hakuna sehemu. Ongeza chapisho la wazi hapa chini.</span>}
            {s.episodeList.map((e, i) => (
              <div key={e.postId} data-testid={`series-ep-${e.postId}`} style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: `1px solid ${LINE}`, paddingTop: 10 }}>
                <b style={{ width: 28, color: '#1d4ed8' }}>{String(i + 1).padStart(2, '0')}</b>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</span>
                  <span style={{ fontSize: 12, color: e.visible ? MUTED : '#b42318' }}>
                    Chapisho #{e.postId}{e.visible ? '' : ' · halionekani kwa watu (limefichwa, limefutwa au si la wazi)'}
                  </span>
                </span>
                <button type="button" aria-label="Juu" disabled={busy || i === 0} onClick={() => move(i, -1)} style={small} data-testid={`series-up-${e.postId}`}>↑</button>
                <button type="button" aria-label="Chini" disabled={busy || i === s.episodeList.length - 1} onClick={() => move(i, 1)} style={small}>↓</button>
                <button type="button" disabled={busy} onClick={() => remove(e.postId)} style={small}>Ondoa</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
              <input value={post} onChange={(e) => setPost(e.target.value)} placeholder="Kiungo cha chapisho (kentexa.com/post/...) au namba yake"
                style={{ ...input, flex: 2, minWidth: 220 }} data-testid="series-add-post" />
              <input value={epTitle} onChange={(e) => setEpTitle(e.target.value)} placeholder="Jina la sehemu (si lazima)" maxLength={120} style={{ ...input, flex: 1, minWidth: 160 }} />
              <button type="button" disabled={busy || !post.trim()} onClick={add} style={btn(true, busy)} data-testid="series-add">Ongeza sehemu</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SeriesList({ topics }) {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);
  const [title, setTitle] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => Promise.resolve().then(() => api.get('/series/admin/all'))
    .then((r) => setRows(Array.isArray(r?.data) ? r.data : [])).catch((e) => { setRows([]); setMsg(err(e, 'Imeshindikana kupakia')); });
  useEffect(() => { if (!open) load(); }, [open]);
  const create = async () => {
    setBusy(true); setMsg('');
    try { const r = await api.post('/series', { title }); setTitle(''); setOpen(r.data.id); }
    catch (e) { setMsg(err(e)); } finally { setBusy(false); }
  };
  if (open) return <SeriesEditor id={open} topics={topics} onBack={() => setOpen(null)} />;
  return (
    <div data-testid="series-list" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ ...card, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Jina la mfululizo mpya (mf. Business Conversations)" maxLength={120}
          style={{ ...input, flex: 1, minWidth: 240 }} data-testid="series-new-title" />
        <button type="button" disabled={busy || title.trim().length < 3} onClick={create} style={btn(true, busy)} data-testid="series-create">Unda mfululizo</button>
      </div>
      {msg && <div role="status" style={{ fontSize: 14 }}>{msg}</div>}
      {rows === null && <div>Inapakia…</div>}
      {rows && rows.length === 0 && <div style={{ color: MUTED }}>Bado hakuna mfululizo. Unda wa kwanza hapo juu.</div>}
      {rows && rows.map((r) => (
        <button key={r.id} type="button" onClick={() => setOpen(r.id)} data-testid={`series-row-${r.id}`}
          style={{ ...card, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', width: '100%' }}>
            <b>{r.title}</b><Tag s={r.status} />
          </div>
          <span style={{ fontSize: 13, color: MUTED }}>
            Sehemu {r.episodes} · wafuasi {r.followers}{r.topics?.length ? ` · ${r.topics.map((k) => topics.find((t) => t.key === k)?.label || k).join(', ')}` : ''}
          </span>
        </button>
      ))}
    </div>
  );
}

function TopicsAdmin({ topics, reload }) {
  const [edit, setEdit] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState({ key: '', label: '', note: '' });
  const value = (t, k) => (edit[t.key]?.[k] !== undefined ? edit[t.key][k] : (t[k] ?? ''));
  const change = (t, k, v) => setEdit((e) => ({ ...e, [t.key]: { ...(e[t.key] || {}), [k]: v } }));
  const save = async (t, extra = {}) => {
    setBusy(true); setMsg('');
    try { await api.patch(`/topics/admin/${t.key}`, { ...(edit[t.key] || {}), ...extra }); setEdit((e) => ({ ...e, [t.key]: undefined })); setMsg(`${t.label}: imehifadhiwa`); await reload(); }
    catch (e) { setMsg(err(e)); } finally { setBusy(false); }
  };
  const add = async () => {
    setBusy(true); setMsg('');
    try { await api.post('/topics/admin', fresh); setFresh({ key: '', label: '', note: '' }); setMsg('Mada imeongezwa'); await reload(); }
    catch (e) { setMsg(err(e)); } finally { setBusy(false); }
  };
  return (
    <div data-testid="topics-admin" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {msg && <div role="status" style={{ fontSize: 14 }}>{msg}</div>}
      {topics.map((t) => (
        <div key={t.key} style={{ ...card, opacity: t.active ? 1 : 0.7 }} data-testid={`topic-row-${t.key}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <b>{t.label} <span style={{ color: MUTED, fontWeight: 500 }}>/topic/{t.key}</span></b>
            <span style={{ fontSize: 13, color: MUTED }}>machapisho {t.posts} · wafuasi {t.followers}{t.active ? '' : ' · imezimwa'}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px', gap: 8 }}>
            <input value={value(t, 'label')} onChange={(e) => change(t, 'label', e.target.value)} maxLength={60} style={input} aria-label="Jina" />
            <input value={value(t, 'note')} onChange={(e) => change(t, 'note', e.target.value)} maxLength={120} style={input} aria-label="Maelezo mafupi" placeholder="Maelezo mafupi" />
            <input value={value(t, 'position')} onChange={(e) => change(t, 'position', e.target.value.replace(/\D/g, ''))} style={input} aria-label="Nafasi" inputMode="numeric" />
          </div>
          <textarea value={value(t, 'description')} onChange={(e) => change(t, 'description', e.target.value)} rows={2} maxLength={400}
            placeholder="Maelezo ya ukurasa wa mada (si lazima)" style={{ ...input, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={busy || !edit[t.key]} onClick={() => save(t)} style={btn(true, busy)}>Hifadhi</button>
            <button type="button" disabled={busy} onClick={() => save(t, { active: !t.active })} style={btn(false, busy)}>{t.active ? 'Zima' : 'Washa'}</button>
          </div>
        </div>
      ))}
      <div style={card}>
        <b>Ongeza mada</b>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <input value={fresh.key} onChange={(e) => setFresh({ ...fresh, key: e.target.value.toLowerCase().replace(/[^a-z_]/g, '') })} placeholder="ufunguo (mf. elimu)" style={input} data-testid="topic-new-key" />
          <input value={fresh.label} onChange={(e) => setFresh({ ...fresh, label: e.target.value })} placeholder="Jina (mf. Elimu)" maxLength={60} style={input} data-testid="topic-new-label" />
          <input value={fresh.note} onChange={(e) => setFresh({ ...fresh, note: e.target.value })} placeholder="Maelezo mafupi" maxLength={120} style={input} />
        </div>
        <button type="button" disabled={busy || fresh.key.length < 2 || fresh.label.trim().length < 2} onClick={add} style={{ ...btn(true, busy), alignSelf: 'flex-start' }} data-testid="topic-add">Ongeza</button>
      </div>
    </div>
  );
}

export default function AdminSeries({ activePage, onNavigate, onLogout }) {
  const [tab, setTab] = useState('series');
  const [topics, setTopics] = useState([]);
  const loadTopics = () => Promise.resolve().then(() => api.get('/topics/admin'))
    .then((r) => setTopics(Array.isArray(r?.data) ? r.data : [])).catch(() => setTopics([]));
  useEffect(() => { loadTopics(); }, []);
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f7f9f9' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32, maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: INK }}>Mfululizo na Mada</h1>
        <div style={{ display: 'flex', borderBottom: '1px solid #cfd9de' }}>
          {[['series', 'Mfululizo'], ['topics', 'Mada']].map(([k, l]) => (
            <button key={k} type="button" data-testid={`admin-series-tab-${k}`} onClick={() => setTab(k)}
              style={{ border: 'none', background: 'none', padding: '10px 18px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                color: tab === k ? INK : MUTED, borderBottom: tab === k ? '3px solid #1d9bf0' : '3px solid transparent' }}>{l}</button>
          ))}
        </div>
        {tab === 'series' ? <SeriesList topics={topics} /> : <TopicsAdmin topics={topics} reload={loadTopics} />}
      </main>
    </div>
  );
}
