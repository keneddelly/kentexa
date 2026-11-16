/**
 * ArticleEditor.js — writing a Makala on its own full screen (owner approved 2026-11-16).
 * An optional cover photo, a title (up to 150), the text (up to 20,000) and simple tools that
 * add layout marks where the cursor is: Kichwa kidogo (## ), B (**bold**), Orodha (- ),
 * Nukuu (> ) and Picha (a photo inside, up to 4). "Hakiki" shows it as readers will see it.
 * The draft is kept on this phone until it is published. Same publish rules as every post.
 */
import React, { useEffect, useRef, useState } from 'react';
import api from '../../api/api';
import { formatName } from '../utils/kentexaText';
import { ARTICLE, readMinutes } from '../utils/articleText';
import { ArticleBody, BookIcon, TEAL } from './ArticlePost';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#e1e8ed';
const DRAFT = 'kx_article_draft';

const readDraft = () => {
  try { return JSON.parse(window.localStorage.getItem(DRAFT) || 'null'); } catch { return null; }
};
const saveDraft = (d) => {
  try { window.localStorage.setItem(DRAFT, JSON.stringify(d)); } catch { /* storage off */ }
};
const clearDraft = () => {
  try { window.localStorage.removeItem(DRAFT); } catch { /* storage off */ }
};

const toolBtn = (on) => ({
  minHeight: 38, padding: '0 10px', borderRadius: 10, border: 'none', background: on ? '#f0fdfa' : 'none', color: on ? TEAL : INK,
  fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
});

export default function ArticleEditor({ onClose, onPosted, initialCommunityId = null, initialText = '', activeProfileId = null }) {
  const draft = readDraft();
  const [title, setTitle] = useState(draft?.title || '');
  const [text, setText] = useState(draft?.text || initialText || '');
  const [communityId, setCommunityId] = useState(initialCommunityId ?? draft?.communityId ?? null);
  const [cover, setCover] = useState(null); // { file, preview }
  const [inside, setInside] = useState([]); // photos inside the text: [{ file, preview }]
  const [communities, setCommunities] = useState([]);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(!!draft);
  const bodyRef = useRef(null);

  useEffect(() => {
    let alive = true;
    api.get('/communities', { params: { mine: '1' } })
      .then((r) => { if (alive) setCommunities(Array.isArray(r?.data) ? r.data : []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // The draft is kept a moment after each change (words only; photos are added again).
  useEffect(() => {
    if (!title && !text) return undefined;
    const id = setTimeout(() => { saveDraft({ title, text, communityId }); setSaved(true); }, 600);
    setSaved(false);
    return () => clearTimeout(id);
  }, [title, text, communityId]);

  // Photos inside the text are numbered from 2 while writing (1 is kept for the cover). Without a
  // cover they move down one when shown or published, so "[picha 1]" then means the first photo
  // inside and the article has no cover (see articlePhotos).
  const firstInside = 2;
  const finalText = cover ? text : text.replace(/^(\s*)\[picha (\d+)\](\s*)$/gim, (m, a, n, b) => `${a}[picha ${Math.max(1, Number(n) - 1)}]${b}`);

  /** Adds a layout mark at the cursor (or around the selected words for bold). */
  const mark = (kind) => {
    const el = bodyRef.current;
    const start = el ? el.selectionStart : text.length;
    const end = el ? el.selectionEnd : text.length;
    const before = text.slice(0, start);
    const chosen = text.slice(start, end);
    const after = text.slice(end);
    const lineStart = before.length === 0 || before.endsWith('\n') ? '' : '\n';
    let insert;
    if (kind === 'bold') insert = `**${chosen || 'neno'}**`;
    else if (kind === 'head') insert = `${lineStart}## ${chosen || 'Kichwa kidogo'}\n`;
    else if (kind === 'list') insert = `${lineStart}- ${chosen || ''}`;
    else insert = `${lineStart}> ${chosen || ''}`;
    const next = (before + insert + after).slice(0, ARTICLE.text);
    setText(next);
    const at = Math.min(next.length, before.length + insert.length);
    if (el) requestAnimationFrame(() => { try { el.focus(); el.setSelectionRange(at, at); } catch { /* older browser */ } });
  };

  const addInside = (file) => {
    if (!file) return;
    if (inside.length >= ARTICLE.photos - 1) { setError(`Picha za ndani zisizidi ${ARTICLE.photos - 1}.`); return; }
    const n = firstInside + inside.length;
    setInside((prev) => [...prev, { file, preview: URL.createObjectURL(file) }]);
    const el = bodyRef.current;
    const at = el ? el.selectionStart : text.length;
    const before = text.slice(0, at);
    const pre = before.length === 0 || before.endsWith('\n') ? '' : '\n';
    setText((before + `${pre}[picha ${n}]\n` + text.slice(at)).slice(0, ARTICLE.text));
  };

  const problem = () => {
    if (!title.trim()) return 'Andika kichwa cha makala.';
    if (title.length > ARTICLE.title) return `Kichwa kisizidi herufi ${ARTICLE.title}.`;
    if (text.trim().length < 50) return 'Makala inahitaji maandishi zaidi (angalau herufi 50).';
    return '';
  };

  const publish = async () => {
    const p = problem();
    if (p) { setError(p); return; }
    setBusy(true); setError('');
    try {
      const files = [cover?.file, ...inside.map((x) => x.file)].filter(Boolean); // cover first, then the photos inside in order
      let urls = [];
      if (files.length) {
        const form = new FormData();
        files.forEach((f) => form.append('files', f));
        const up = await api.post('/upload/images', form, { headers: { 'Content-Type': 'multipart/form-data' } });
        urls = up.data?.urls || [];
        if (urls.length < files.length) throw new Error('Picha hazikupakiwa. Jaribu tena.');
      }
      const media = urls.map((url) => ({ url, width: null, height: null }));
      const r = await api.post('/feed/publish', {
        type: 'moment',
        intent: 'article',
        title: title.trim(),
        body: finalText.trim(),
        media,
        imageUrl: media[0]?.url || null,
        communityId: communityId || undefined,
        visibility: 'public',
        commerceProfileId: activeProfileId || undefined,
      });
      clearDraft();
      onPosted?.(r?.data);
      onClose?.();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Imeshindikana kuchapisha. Jaribu tena.');
    } finally { setBusy(false); }
  };

  const previewMedia = [cover, ...inside].filter(Boolean).map((x) => ({ url: x.preview }));
  const previewText = finalText;
  const minutes = readMinutes(text);

  return (
    <div data-testid="article-editor" role="dialog" aria-modal="true" aria-label="Makala mpya"
      style={{ position: 'fixed', inset: 0, zIndex: 4600, background: '#fff', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'calc(10px + env(safe-area-inset-top, 0px)) 12px 10px', borderBottom: `1px solid ${LINE}` }}>
        <button type="button" aria-label="Funga" onClick={onClose}
          style={{ width: 36, height: 36, border: 'none', background: 'none', cursor: 'pointer', fontSize: 22, color: INK, padding: 0 }}>✕</button>
        <b style={{ flex: 1, fontSize: 17, color: INK, display: 'flex', alignItems: 'center', gap: 6 }}><BookIcon size={16} color={TEAL} />Makala mpya</b>
        {(title || text) && <span data-testid="article-saved" style={{ fontSize: 12, color: MUTED }}>{saved ? 'Rasimu imehifadhiwa' : 'Inahifadhi…'}</span>}
        <button type="button" data-testid="article-preview" onClick={() => setPreview((v) => !v)} style={{ ...toolBtn(preview), border: `1px solid ${LINE}` }}>
          {preview ? 'Andika' : 'Hakiki'}
        </button>
        <button type="button" data-testid="article-publish" onClick={publish} disabled={busy}
          style={{ height: 38, padding: '0 16px', borderRadius: 999, border: 'none', background: TEAL, color: '#fff', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
          {busy ? 'Inachapisha…' : 'Chapisha'}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '14px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {preview ? (
            <div data-testid="article-preview-view" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {cover && <img src={cover.preview} alt="" style={{ width: '100%', borderRadius: 12, maxHeight: 280, objectFit: 'cover' }} />}
              <h1 style={{ margin: 0, fontSize: 26, lineHeight: '32px', fontWeight: 800, color: INK }}>{title || 'Kichwa cha makala'}</h1>
              <span style={{ fontSize: 14, color: MUTED }}>dakika {minutes} kusoma</span>
              <ArticleBody text={previewText} media={previewMedia} />
            </div>
          ) : (
            <>
              <label data-testid="article-cover" style={{ height: cover ? 'auto' : 140, border: cover ? 'none' : '2px dashed #cfd9de', borderRadius: 16, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 6, color: MUTED, fontSize: 14, cursor: 'pointer', overflow: 'hidden', position: 'relative' }}>
                {cover ? (
                  <>
                    <img src={cover.preview} alt="" style={{ width: '100%', maxHeight: 240, objectFit: 'cover', display: 'block' }} />
                    <span style={{ position: 'absolute', right: 10, bottom: 10, background: 'rgba(15,20,25,0.7)', color: '#fff', borderRadius: 999, padding: '5px 12px', fontSize: 13, fontWeight: 700 }}>Badilisha picha</span>
                  </>
                ) : 'Weka picha ya juu (si lazima)'}
                <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setCover({ file: f, preview: URL.createObjectURL(f) }); e.target.value = ''; }} />
              </label>
              <textarea data-testid="article-title-input" value={title} onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' ').slice(0, ARTICLE.title))}
                placeholder="Kichwa cha makala" aria-label="Kichwa cha makala" rows={2}
                style={{ border: 'none', outline: 'none', resize: 'none', fontFamily: 'inherit', fontSize: 25, lineHeight: '31px', fontWeight: 800, color: INK, padding: 0 }} />
              <span style={{ fontSize: 12, color: MUTED, textAlign: 'right' }}>Kichwa {title.length} / {ARTICLE.title}</span>
              <textarea ref={bodyRef} data-testid="article-text" value={text} onChange={(e) => setText(e.target.value.slice(0, ARTICLE.text))}
                placeholder={'Andika makala yako hapa…\n\nTumia "Kichwa kidogo" kugawa sehemu, "Orodha" kwa mambo kwa mpangilio, na "Nukuu" kwa maneno ya kukumbukwa.'}
                aria-label="Maandishi ya makala"
                style={{ minHeight: '45vh', border: 'none', outline: 'none', resize: 'vertical', fontFamily: 'inherit', fontSize: 17, lineHeight: '27px', color: INK, padding: 0 }} />
            </>
          )}
          {error && <div role="alert" style={{ fontSize: 14, color: '#b91c1c' }}>{error}</div>}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${LINE}`, background: '#fff', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: `1px solid #eff3f4`, fontSize: 13, color: MUTED }}>
          <select data-testid="article-where" value={communityId || ''} onChange={(e) => setCommunityId(e.target.value ? Number(e.target.value) : null)}
            aria-label="Chapisha kwenye"
            style={{ maxWidth: '60%', height: 32, borderRadius: 999, border: '1px solid #cfd9de', padding: '0 10px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: INK, background: '#fff' }}>
            <option value="">Chapisha kwenye: Mwanzo (wote)</option>
            {communities.map((c) => <option key={c.id} value={c.id}>Chapisha kwenye: {formatName(c.name)}</option>)}
          </select>
          <span data-testid="article-count" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            {text.length.toLocaleString('en-US')} / {ARTICLE.text.toLocaleString('en-US')} · dakika {minutes}
          </span>
        </div>
        {!preview && (
          <div role="toolbar" aria-label="Mpangilio" style={{ display: 'flex', justifyContent: 'space-around', gap: 4, padding: '6px 8px', overflowX: 'auto' }}>
            <button type="button" data-testid="tool-head" onClick={() => mark('head')} style={toolBtn(true)}>Kichwa kidogo</button>
            <button type="button" data-testid="tool-bold" onClick={() => mark('bold')} style={toolBtn(false)} aria-label="Herufi nzito"><b>B</b></button>
            <button type="button" data-testid="tool-list" onClick={() => mark('list')} style={toolBtn(false)}>• Orodha</button>
            <button type="button" data-testid="tool-quote" onClick={() => mark('quote')} style={toolBtn(false)}>❝ Nukuu</button>
            <label data-testid="tool-photo" style={{ ...toolBtn(false), display: 'inline-flex', alignItems: 'center' }}>
              Picha
              <input type="file" accept="image/*" hidden onChange={(e) => { addInside(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
