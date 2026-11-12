/**
 * CreateMomentModal.js — the composer (Home Feed phase D, owner approved 2026-11-02).
 *
 * Opened from the "+" sheet (create actions live only there) and, in edit mode, from a
 * post's own edit button within 15 minutes of publishing.
 *
 *  - Kinds: Moment, Swali, Mjadala, Onyesha bidhaa, Ofa, Kura (phase E), Natafuta.
 *  - Up to 4 photos, each keeping its own width and height; 500 characters of text.
 *  - Onyesha bidhaa and Ofa link one of the person's real products, listings or services;
 *    the price comes from that record, never typed.
 *  - Audience: Wote or Wanaofuata. The server decides who sees what.
 *  - The posting identity is the server-resolved active context (shown, never chosen here).
 *  - Smart Post (owner 2026-11-09): a new post is shown as it will look before "Chapisha"; the
 *    text stays if posting fails. Uzoefu is a kind. The composer's steps are recorded (opened,
 *    kind, preview, closed without posting) with no text, so we learn where people stop.
 */
import { actorLabelParts } from '../utils/publicActor';
import React, { useState, useEffect, useRef } from 'react';
import { saleIntent } from '../utils/saleIntent';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';
import { COMPOSER, POST_KINDS, POLL, postPhotos, formatTag, photoAspect } from '../utils/feedPresentation';
import { extractHashtags } from '../utils/hashtags';

const B  = '#2563EB';
const DK = '#0F1419';
const GR = '#536471';
const LN = '#E6EBEF';
const WH = '#FFFFFF';

const getLookingForCategories = (t) => [
  t('create_moment_modal.category_electronics'), t('create_moment_modal.category_fashion'),
  t('create_moment_modal.category_food'), t('create_moment_modal.category_hardware'),
  t('create_moment_modal.category_furniture'), t('create_moment_modal.category_beauty'),
  t('create_moment_modal.category_agriculture'), t('create_moment_modal.category_automotive'),
  t('create_moment_modal.category_services'), t('create_moment_modal.category_other'),
];

const routeTitle = (r, t) => {
  if (r.routeType === 'intercity' && r.originCity && r.destinationCity) {
    return `${r.originCity} → ${r.destinationCity}`;
  }
  if (r.routeType === 'local_loop' && r.loopStops?.length) {
    return r.loopStops.join(' → ');
  }
  if (r.routeType === 'last_mile' && r.coverageWards?.length) {
    return `${r.coverageCity || ''} — ${r.coverageWards.slice(0, 3).join(', ')}`.trim();
  }
  return t('create_moment_modal.my_route_fallback');
};

const KIND_ICON = {
  moment: 'M4 7h3l2-3h6l2 3h3v12H4zM12 17a4 4 0 100-8 4 4 0 000 8z',
  question: 'M9 9a3 3 0 115 2c-1 .7-2 1.3-2 3M12 18h.01',
  discussion: 'M4 5h11v8H8l-4 3zM15 9h5v8l-3-2h-6v-2',
  showcase: 'M6 7h12l1 13H5zM9 7a3 3 0 016 0',
  offer: 'M20 12l-8 8-9-9V3h8zM7.5 9a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  looking_for: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5',
  poll: 'M5 20V10M12 20V4M19 20v-7',
  experience: 'M4 5h16v11H9l-5 4zM8 9h8M8 12h5',
};

/** Records one composer step. Never blocks or fails the composer. */
const composerEvent = (step, data = {}) => {
  try { Promise.resolve(api.post('/feed/analytics/composer', { step, ...data })).catch(() => {}); } catch { /* offline */ }
};
const Icon = ({ d, color = 'currentColor', size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

const PLACEHOLDER = {
  moment: 'Nini kinaendelea leo?',
  question: 'Uliza swali lako...',
  discussion: 'Anzisha mjadala...',
  showcase: 'Eleza bidhaa au huduma unayoonyesha...',
  offer: 'Eleza ofa yako...',
  poll: 'Andika swali la kura...',
  experience: 'Shiriki uzoefu wako: hadithi, maoni au somo ulilojifunza...',
};

/** Reads a picked photo's own width and height (null when the browser cannot tell). */
const measure = (url) => new Promise((resolve) => {
  if (typeof Image === 'undefined') { resolve({ width: null, height: null }); return; }
  const img = new Image();
  img.onload = () => resolve({ width: img.naturalWidth || null, height: img.naturalHeight || null });
  img.onerror = () => resolve({ width: null, height: null });
  img.src = url;
});

const CreateMomentModal = ({ onClose, onPosted, currentUser, initialMode, activeProfileId, activeProfile, onNavigate, editPost, onEdited, initialCommunityId = null, initialKind = null, initialText = '' }) => {
  const { t } = useTranslation();
  const isEdit = !!editPost;
  const LOOKING_FOR_CATEGORIES = getLookingForCategories(t);
  // The welcome's first post (owner 2026-11-02) can open on a kind with a ready start.
  const [kind,      setKind]      = useState(initialMode === 'looking_for' ? 'looking_for' : (initialKind || 'moment'));
  const mode = kind === 'looking_for' ? 'looking_for' : 'moment';
  const kindInfo = POST_KINDS.find((k) => k.key === kind) || POST_KINDS[0];
  // Photos: { file?, url?, preview, width, height }. An edit starts with the post's own photos.
  const [photos,    setPhotos]    = useState(() => (isEdit ? postPhotos(editPost).map((p) => ({ ...p, preview: p.url })) : []));
  const [caption,   setCaption]   = useState(isEdit ? (editPost.body || editPost.title || '') : (initialText || ''));
  const detectedHashtags = extractHashtags(caption);
  const [audience,  setAudience]  = useState(isEdit && editPost.visibility === 'followers' ? 'followers' : 'public');
  const [category,  setCategory]  = useState('');
  // Phase E: a poll's options (2 to 6) and how long it stays open.
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollDays,    setPollDays]    = useState(3);
  // Social Home (owner approved 2026-11-02): every post made here is about a topic. The last
  // one used is offered first; the list comes from the server (none loaded = not asked).
  const [topicList,   setTopicList]   = useState([]);
  const [topicKey,    setTopicKey]    = useState(() => {
    if (isEdit) return '';
    try { return localStorage.getItem('kentexa_last_topic') || ''; } catch { return ''; }
  });
  useEffect(() => {
    if (isEdit) return undefined;
    let alive = true;
    api.get('/feed/topics').then((r) => { if (alive) setTopicList(Array.isArray(r?.data) ? r.data : []); }).catch(() => {});
    return () => { alive = false; };
  }, [isEdit]);
  // Social Home part 3: "Chapisha kwenye": Home, or one of the person's communities.
  const [myCommunities, setMyCommunities] = useState([]);
  const [communityId,   setCommunityId]   = useState(initialCommunityId ? Number(initialCommunityId) : null);
  useEffect(() => {
    if (isEdit) return undefined;
    let alive = true;
    api.get('/communities', { params: { mine: '1' } })
      .then((r) => { if (alive) setMyCommunities(Array.isArray(r?.data) ? r.data : []); }).catch(() => {});
    return () => { alive = false; };
  }, [isEdit]);
  // In a community the post takes the community's topic unless one is chosen.
  const askTopic = !isEdit && kind !== 'looking_for' && topicList.length > 0 && !communityId;
  const [myItems,   setMyItems]   = useState([]);
  const [loadingItems, setLoadingItems] = useState(!isEdit);
  const [tagged,    setTagged]    = useState(null); // { type, id, title, price }
  const [posting,   setPosting]   = useState(false);
  const [error,     setError]     = useState('');
  // A Moment that reads like a sale becomes a classified ad (owner 2026-10-26: new users
  // post sale items as Moments, so buyers never find them in search). The user can
  // still keep it a Moment with one tap; never blocked.
  const [keepMoment, setKeepMoment] = useState(false);
  const intent = !isEdit && kind === 'moment' ? saleIntent(caption, { tagged: !!tagged && tagged.type !== 'business' }) : { sale: false, price: null };
  const asAd = intent.sale && !keepMoment && !!onNavigate;
  const fileRef = useRef(null);
  // Smart Post: 'write' then 'preview'. Editing and "Endelea kama tangazo" skip the preview.
  const [step, setStep] = useState('write');
  const postedRef = useRef(false);
  useEffect(() => { if (!isEdit) composerEvent('opened', { kind }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const chooseKind = (key) => {
    setKind(key); setError('');
    if (key !== kind) composerEvent('kind', { kind: key });
  };
  // Smart Post "Pendekeza" (owner 2026-11-09): one AI suggestion, only when the person taps it.
  // Nothing changes until they tap "Tumia"; a missing suggestion never blocks posting.
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [suggestNote, setSuggestNote] = useState('');
  const askSuggestion = async () => {
    setSuggesting(true); setSuggestion(null); setSuggestNote('');
    try {
      const r = await api.post('/feed/composer/suggest', { text: caption.trim(), kind });
      if (r?.data?.suggestion) setSuggestion(r.data.suggestion);
      else setSuggestNote(r?.data?.unavailable ? 'Pendekezo halipatikani sasa. Endelea kuandika.' : 'Chapisho lako liko vizuri kama lilivyo.');
    } catch (e) {
      setSuggestNote(e?.response?.data?.message || 'Pendekezo halipatikani sasa. Endelea kuandika.');
    } finally { setSuggesting(false); }
  };
  const applySuggestion = () => {
    const s = suggestion;
    if (!s) return;
    setKind(s.kind);
    if (s.text) setCaption(s.text.slice(0, COMPOSER.text));
    if (s.kind === 'poll' && s.options?.length >= 2) setPollOptions(s.options.slice(0, POLL.maxOptions));
    composerEvent('suggest_used', { kind: s.kind });
    setSuggestion(null); setError('');
  };
  const dismissSuggestion = () => {
    composerEvent('suggest_dismissed', { kind: suggestion?.kind });
    setSuggestion(null);
  };

  const close = () => {
    if (!isEdit && !postedRef.current) {
      composerEvent('abandoned', { kind, at: step, hasText: !!caption.trim(), photos: photos.length });
    }
    onClose();
  };

  useEffect(() => {
    if (isEdit) return;
    const uid = currentUser?.id;
    if (!uid) { setLoadingItems(false); return; }
    // Scoped to the ACTIVE profile when one is known: a personal profile only ever
    // sees its own listings here, never the business's products, and vice versa.
    const productsCall = activeProfileId
      ? api.get(`/products/profile/${activeProfileId}`)
      : api.get(`/products/seller/${uid}`);
    const classifiedsCall = activeProfileId
      ? api.get(`/classifieds/profile/${activeProfileId}`)
      : api.get(`/classifieds/seller/${uid}`);
    const servicesCall = api.get('/services/my/ads', {
      params: activeProfileId ? { commerceProfileId: activeProfileId } : undefined,
    });
    Promise.allSettled([
      classifiedsCall,
      productsCall,
      servicesCall,
      api.get('/transport/routes'),
    ]).then(([cl, pr, sv, rt]) => {
      const items = [];
      // Tagging the active profile itself lets every identity (a hub has no products)
      // post an update about itself.
      if (activeProfileId) {
        items.push({
          type: 'business',
          id: activeProfileId,
          title: activeProfile?.displayName || currentUser?.name || t('create_moment_modal.type_label_business'),
          image: activeProfile?.photoUrl || null,
        });
      }
      if (cl.status === 'fulfilled') {
        (cl.value.data || []).forEach(c => items.push({
          type: 'classified', id: c.id, title: c.title, image: c.images?.[0], price: Number(c.flashSalePrice || c.price) || null,
        }));
      }
      if (pr.status === 'fulfilled') {
        (pr.value.data || []).forEach(p => items.push({
          type: 'product', id: p.id, title: p.name, image: p.images?.[0], price: Number(p.displayPrice || p.basePrice) || null,
        }));
      }
      if (sv.status === 'fulfilled') {
        (sv.value.data?.ads || sv.value.data || []).forEach(s => items.push({
          type: 'service', id: s.id, title: s.title, image: s.images?.[0], price: Number(s.price) || null,
        }));
      }
      if (rt.status === 'fulfilled') {
        (rt.value.data || []).forEach(r => items.push({
          type: 'route', id: r.id, title: routeTitle(r, t), image: null,
        }));
      }
      setMyItems(items);
    }).finally(() => setLoadingItems(false));
  }, [currentUser?.id, activeProfileId, activeProfile, t, isEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Onyesha bidhaa and Ofa link a real thing that is sold: product, listing or service.
  const linkable = kindInfo.needsItem ? myItems.filter((i) => ['product', 'classified', 'service'].includes(i.type)) : myItems;
  const showLinks = !isEdit && (kind === 'moment' || kindInfo.needsItem);
  useEffect(() => {
    if (tagged && kindInfo.needsItem && !['product', 'classified', 'service'].includes(tagged.type)) setTagged(null);
    if (tagged && !showLinks) setTagged(null);
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePickFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const room = COMPOSER.photos - photos.length;
    if (room <= 0) { setError(`Picha zisizidi ${COMPOSER.photos}.`); return; }
    const picked = await Promise.all(files.slice(0, room).map(async (file) => {
      const preview = URL.createObjectURL(file);
      return { file, preview, ...(await measure(preview)) };
    }));
    setPhotos((prev) => [...prev, ...picked].slice(0, COMPOSER.photos));
    setError(files.length > room ? `Picha ${COMPOSER.photos} tu ndizo zimechukuliwa.` : '');
  };
  const removePhoto = (i) => setPhotos((prev) => prev.filter((_, j) => j !== i));

  const actor = actorLabelParts(activeProfile, t);
  const actorUnresolved = !isEdit && !activeProfileId;

  /** Uploads the new photos (one call) and returns the full list in order. */
  const uploadPhotos = async () => {
    const fresh = photos.filter((p) => p.file);
    let urls = [];
    if (fresh.length) {
      const form = new FormData();
      fresh.forEach((p) => form.append('files', p.file));
      const up = await api.post('/upload/images', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      urls = up.data?.urls || [];
      if (urls.length < fresh.length) throw new Error(t('create_moment_modal.upload_failed'));
    }
    let k = 0;
    return photos.map((p) => ({ url: p.file ? urls[k++] : p.url, width: p.width ?? null, height: p.height ?? null }));
  };

  /** What is still missing before the post can go out ('' when it is ready). */
  const problem = () => {
    if (actorUnresolved) return t('actor_label.unresolved');
    const text = caption.trim();
    if (mode === 'moment') {
      if (!photos.length && !text) return 'Weka picha au andika kitu.';
      if ((kind === 'question' || kind === 'discussion') && !text) return 'Andika swali au mada ya mjadala.';
      if (kind === 'experience' && !text) return 'Andika uzoefu wako.';
      if (kind === 'poll') {
        if (!text) return 'Andika swali la kura.';
        const opts = pollOptions.map((o) => o.trim());
        if (opts.some((o) => !o)) return 'Jaza kila chaguo, au liondoe.';
        if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) return 'Machaguo mawili yanafanana.';
      }
      if (kindInfo.needsItem && !tagged) return 'Chagua bidhaa, tangazo au huduma unayoonyesha.';
      if (askTopic && !topicList.some((tp) => tp.key === topicKey)) return 'Chagua mada ya chapisho hili.';
    } else {
      if (!text) return t('create_moment_modal.validate_describe');
      if (!category) return t('create_moment_modal.validate_pick_category');
    }
    if (text.length > COMPOSER.text) return `Maandishi yasizidi herufi ${COMPOSER.text}.`;
    return '';
  };

  /** The main button: a new post goes to the preview first; an edit or an ad goes straight on. */
  const handleNext = () => {
    if (isEdit || asAd) { handlePost(); return; }
    const p = problem();
    if (p) { setError(p); return; }
    setError('');
    setStep('preview');
    composerEvent('preview', { kind, photos: photos.length, audience });
  };

  const handlePost = async () => {
    const p = problem();
    if (p) { setError(p); setStep('write'); return; }
    const text = caption.trim();
    try {
      setPosting(true);
      setError('');
      const media = await uploadPhotos();

      if (isEdit) {
        const res = await api.patch(`/feed/${editPost.id}`, {
          title: text || editPost.title,
          body: text || null,
          media,
          visibility: audience,
        });
        onEdited?.(res?.data);
        onClose();
        return;
      }

      if (asAd) {
        // Straight to the classified form, filled with what they wrote and the photos.
        onNavigate('CreateClassified', { prefill: {
          title: text.split(/\n|[.!?]\s/)[0].slice(0, 80),
          description: text,
          price: intent.price || '',
          images: media.map((m) => m.url),
        } });
        onClose();
        return;
      }

      if (mode === 'moment') {
        await api.post('/feed/publish', {
          type: 'moment',
          intent: kindInfo.intent,
          title: text || tagged?.title || 'Moment',
          body: text || null,
          media,
          imageUrl: media[0]?.url || null,
          linkedEntityType: tagged?.type || null,
          linkedEntityId: tagged?.id || null,
          // The price is the linked record's own, never typed here.
          price: kindInfo.needsItem && tagged?.price ? tagged.price : undefined,
          poll: kind === 'poll' ? { options: pollOptions.map((o) => o.trim()), durationDays: pollDays } : undefined,
          topic: askTopic ? topicKey : (communityId && topicKey ? topicKey : undefined),
          communityId: communityId || undefined,
          visibility: audience,
          commerceProfileId: activeProfileId || undefined,
        });
      } else {
        await api.post('/feed/publish', {
          type: 'looking_for',
          title: text,
          body: text,
          media,
          imageUrl: media[0]?.url || null,
          category,
          visibility: audience,
          commerceProfileId: activeProfileId || undefined,
        });
      }

      postedRef.current = true;
      onPosted?.();
      onClose();
    } catch (err) {
      // The text, photos and choices stay as they were; the person can try again.
      setError(err?.response?.data?.message || err?.message || t('create_moment_modal.post_failed'));
    } finally {
      setPosting(false);
    }
  };

  const pill = (on) => ({
    padding: '6px 12px', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
    border: `1px solid ${on ? DK : LN}`, background: WH, color: on ? DK : GR,
  });

  return (
    <div style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.6)',
      zIndex:4500, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div style={{ width:'100%', maxWidth:520, backgroundColor:WH,
        borderRadius:'20px 20px 0 0', maxHeight:'94vh', display:'flex',
        flexDirection:'column' }}>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'10px 12px', borderBottom:`1px solid ${LN}`, flexShrink:0 }}>
          <button type="button" onClick={close} aria-label="Funga" style={{ background:'none', border:'none',
            cursor:'pointer', fontSize:22, color:DK, padding:4, width:34 }}>×</button>
          <div style={{ fontSize:16, fontWeight:800, color:DK }}>
            {isEdit ? 'Hariri chapisho' : step === 'preview' ? 'Kagua kabla ya kuchapisha' : mode === 'moment' ? 'Chapisho jipya' : t('create_moment_modal.title_looking_for')}
          </div>
          <div style={{ width:34 }} />
        </div>

        {/* I2: the canonical actor this post will be published as (server-resolved). */}
        {actor && !isEdit && (
          <div style={{ margin: '10px 16px 0', fontSize: 13, color: GR, flexShrink: 0 }}>
            {t('actor_label.posting_as')} <b style={{ color: DK }}>{actor.title}</b>{actor.subtitle ? ` · ${actor.subtitle}` : ''}
          </div>
        )}
        {actorUnresolved && (
          <div role="alert" style={{ margin: '8px 16px 0', padding: '8px 12px', borderRadius: 10, backgroundColor: '#FEF3C7', color: '#92400E', fontSize: 12, flexShrink: 0 }}>
            {t('actor_label.unresolved')}
          </div>
        )}

        {step === 'preview' && (
          <PostPreview actor={actor} kind={kind} kindInfo={kindInfo} text={caption.trim()} photos={photos}
            pollOptions={pollOptions} pollDays={pollDays} tagged={tagged} audience={audience} category={category}
            topic={topicList.find((tp) => tp.key === topicKey)?.label || ''}
            community={myCommunities.find((c) => c.id === communityId)?.name || ''} error={error} />
        )}

        <div style={{ flex:1, overflowY:'auto', padding:16, minHeight:0, display: step === 'preview' ? 'none' : 'flex', flexDirection:'column', gap:14 }}>
          {/* The type grid: what kind of post this is. Not offered when editing. */}
          {!isEdit && (
            <div role="radiogroup" aria-label="Aina ya chapisho" style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:6 }}>
              {POST_KINDS.map((k) => {
                const on = kind === k.key;
                return (
                  <button key={k.key} type="button" role="radio" aria-checked={on} data-testid={`kind-${k.key}`}
                    onClick={() => chooseKind(k.key)}
                    style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'8px 4px', borderRadius:12,
                      border:`1px solid ${on ? B : LN}`, background: on ? '#eff6ff' : WH, color: on ? B : DK,
                      fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                    <Icon d={KIND_ICON[k.key]} />{k.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Text, with the 500-character count */}
          <div>
            <textarea value={caption} onChange={e => setCaption(e.target.value.slice(0, COMPOSER.text))}
              placeholder={mode === 'moment' ? (PLACEHOLDER[kind] || PLACEHOLDER.moment) : t('create_moment_modal.placeholder_looking_for')}
              maxLength={COMPOSER.text} aria-label="Maandishi"
              style={{ width:'100%', minHeight:96, padding:'10px 0', border:'none', borderBottom:`1px solid ${LN}`,
                fontSize:16, lineHeight:1.45, resize:'vertical', boxSizing:'border-box', fontFamily:'inherit', outline:'none', color:DK }} />
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
              <span style={{ fontSize:12, color:GR }}>Tumia # kuunganisha chapisho lako na mada</span>
              {!isEdit && caption.trim().length >= 15 && !suggestion ? (
                <button type="button" data-testid="suggest" onClick={askSuggestion} disabled={suggesting}
                  style={{ padding:'4px 0', border:'none', background:'none', color:B, fontSize:14, fontWeight:700, cursor: suggesting ? 'default' : 'pointer', fontFamily:'inherit' }}>
                  {suggesting ? 'Inafikiria...' : 'Pendekeza'}
                </button>
              ) : <span />}
              <span data-testid="char-count" style={{ fontSize:12, color: caption.length >= COMPOSER.text ? '#B91C1C' : GR, fontVariantNumeric:'tabular-nums' }}>
                {caption.length} / {COMPOSER.text}
              </span>
            </div>
            {detectedHashtags.length > 0 && (
              <div data-testid="detected-hashtags" aria-label="Hashtags zilizotambuliwa" style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:8 }}>
                {detectedHashtags.map((tag) => (
                  <span key={tag.normalized} style={{ padding:'5px 10px', borderRadius:16, background:'#eff6ff', color:B, fontSize:13, fontWeight:700 }}>
                    #{tag.label}
                  </span>
                ))}
              </div>
            )}
            {suggestNote && !suggestion && <div role="status" style={{ fontSize:13, color:GR, marginTop:4 }}>{suggestNote}</div>}
            {suggestion && (
              <div data-testid="suggestion" style={{ marginTop:8, padding:12, borderRadius:12, border:`1px solid ${B}`, background:'#eff6ff', display:'flex', flexDirection:'column', gap:6 }}>
                <div style={{ fontSize:13, fontWeight:700, color:B }}>
                  Pendekezo: {(POST_KINDS.find((k) => k.key === suggestion.kind) || {}).label || suggestion.kind}
                </div>
                {suggestion.reason && <div style={{ fontSize:13, color:GR }}>{suggestion.reason}</div>}
                {suggestion.text && <div style={{ fontSize:15, color:DK, whiteSpace:'pre-wrap', overflowWrap:'anywhere' }}>{suggestion.text}</div>}
                {suggestion.options?.length > 0 && (
                  <ul style={{ margin:0, paddingLeft:18, fontSize:14, color:DK }}>{suggestion.options.map((o) => <li key={o}>{o}</li>)}</ul>
                )}
                <div style={{ display:'flex', gap:8 }}>
                  <button type="button" data-testid="suggestion-use" onClick={applySuggestion}
                    style={{ height:36, padding:'0 16px', borderRadius:18, border:'none', background:DK, color:WH, fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Tumia</button>
                  <button type="button" data-testid="suggestion-dismiss" onClick={dismissSuggestion}
                    style={{ height:36, padding:'0 16px', borderRadius:18, border:`1px solid ${LN}`, background:WH, color:DK, fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Hapana, asante</button>
                </div>
              </div>
            )}
          </div>

          {/* Social Home part 3: where the post goes */}
          {!isEdit && kind !== 'looking_for' && myCommunities.length > 0 && (
            <div>
              <div style={{ fontSize:14, fontWeight:800, color:DK, marginBottom:6 }}>Chapisha kwenye</div>
              <div role="radiogroup" aria-label="Chapisha kwenye" style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                <button type="button" role="radio" aria-checked={!communityId} data-testid="post-where-home" onClick={() => setCommunityId(null)} style={pill(!communityId)}>Mwanzo (wote)</button>
                {myCommunities.map((c) => (
                  <button key={c.id} type="button" role="radio" aria-checked={communityId === c.id} data-testid={`post-where-${c.id}`}
                    onClick={() => setCommunityId(c.id)} style={pill(communityId === c.id)}>{c.name}</button>
                ))}
              </div>
            </div>
          )}

          {/* Social Home: the topic of this post */}
          {askTopic && (
            <div>
              <div style={{ fontSize:14, fontWeight:800, color:DK, marginBottom:6 }}>Mada</div>
              <div role="radiogroup" aria-label="Mada" style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {topicList.map((tp) => (
                  <button key={tp.key} type="button" role="radio" aria-checked={topicKey === tp.key} data-testid={`post-topic-${tp.key}`}
                    onClick={() => { setTopicKey(tp.key); try { localStorage.setItem('kentexa_last_topic', tp.key); } catch { /* storage blocked */ } }}
                    style={pill(topicKey === tp.key)}>{tp.label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Phase E: the poll's options and how long it stays open */}
          {kind === 'poll' && !isEdit && (
            <div data-testid="poll-editor" style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {pollOptions.map((o, i) => (
                <div key={i} style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <input value={o} maxLength={POLL.optionLength} aria-label={`Chaguo ${i + 1}`} data-testid={`poll-option-${i}`}
                    placeholder={`Chaguo ${i + 1}`}
                    onChange={(e) => setPollOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                    style={{ flex:1, minWidth:0, height:40, padding:'0 10px', borderRadius:10, border:`1px solid ${LN}`, fontSize:15, fontFamily:'inherit', color:DK, background:WH }} />
                  {pollOptions.length > POLL.minOptions && (
                    <button type="button" aria-label={`Ondoa chaguo ${i + 1}`} onClick={() => setPollOptions((prev) => prev.filter((_, j) => j !== i))}
                      style={{ width:32, height:32, border:'none', background:'none', color:GR, fontSize:20, cursor:'pointer' }}>×</button>
                  )}
                </div>
              ))}
              {pollOptions.length < POLL.maxOptions && (
                <button type="button" data-testid="poll-add-option" onClick={() => setPollOptions((prev) => [...prev, ''])}
                  style={{ height:38, borderRadius:10, border:`1.5px dashed ${LN}`, background:WH, color:GR, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                  + Ongeza chaguo ({pollOptions.length}/{POLL.maxOptions})
                </button>
              )}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                <span style={{ fontSize:14, fontWeight:700, color:DK }}>Kura inafungwa</span>
                <span role="radiogroup" aria-label="Kura inafungwa" style={{ display:'flex', gap:6 }}>
                  {POLL.days.map((d) => (
                    <button key={d} type="button" role="radio" aria-checked={pollDays === d} data-testid={`poll-days-${d}`}
                      onClick={() => setPollDays(d)} style={pill(pollDays === d)}>Siku {d}</button>
                  ))}
                </span>
              </div>
            </div>
          )}

          {/* Up to 4 photos */}
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={handlePickFiles} data-testid="photo-input" />
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:6 }}>
            {photos.map((p, i) => (
              <div key={p.preview || p.url} data-testid="composer-photo" style={{ position:'relative', aspectRatio:'1 / 1', borderRadius:10, overflow:'hidden', background:'#F1F5F9' }}>
                <img src={p.preview || p.url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                <button type="button" onClick={() => removePhoto(i)} aria-label="Ondoa picha"
                  style={{ position:'absolute', top:4, right:4, width:22, height:22, borderRadius:11, border:'none',
                    background:'rgba(15,20,25,0.72)', color:WH, fontSize:14, lineHeight:'22px', cursor:'pointer', padding:0 }}>×</button>
              </div>
            ))}
            {photos.length < COMPOSER.photos && (
              <button type="button" onClick={() => fileRef.current?.click()} aria-label="Ongeza picha" data-testid="add-photo"
                style={{ aspectRatio:'1 / 1', borderRadius:10, border:`1.5px dashed ${LN}`, background:WH, color:GR,
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2, cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:700 }}>
                <Icon d="M12 5v14M5 12h14" color={GR} />
                {photos.length}/{COMPOSER.photos}
              </button>
            )}
          </div>

          {mode === 'moment' ? (
            showLinks && (
              <div>
                <div style={{ fontSize:14, fontWeight:800, color:DK, marginBottom:4 }}>
                  {kindInfo.needsItem ? 'Chagua bidhaa au huduma' : 'Unganisha kitu (si lazima)'}
                </div>
                <div style={{ fontSize:13, color:GR, marginBottom:8, lineHeight:1.45 }}>
                  {kindInfo.needsItem
                    ? 'Bei inatoka kwenye bidhaa yenyewe. Wanaoona wanaweza kuinunua au kuiomba.'
                    : 'Unganisha na bidhaa, tangazo, huduma, njia au wasifu ili wanaoona waendelee. Haitengenezi tangazo.'}
                </div>
                {loadingItems ? (
                  <div style={{ fontSize:13, color:GR, padding:'8px 0' }}>{t('create_moment_modal.loading_items')}</div>
                ) : linkable.length === 0 ? (
                  <div style={{ fontSize:13, color:GR, backgroundColor:'#F7F9FA', borderRadius:10, padding:12 }}>
                    {kindInfo.needsItem ? 'Huna bidhaa, tangazo wala huduma bado.' : t('create_moment_modal.no_items_msg')}
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:220, overflowY:'auto' }}>
                    {linkable.map((item) => {
                      const on = tagged?.type === item.type && tagged?.id === item.id;
                      const typeLabel = {
                        business: t('create_moment_modal.type_label_business'),
                        product: t('create_moment_modal.type_label_product'), classified: t('create_moment_modal.type_label_classified'),
                        service: t('create_moment_modal.type_label_service'), route: t('create_moment_modal.type_label_route'),
                      }[item.type];
                      return (
                        <button key={`${item.type}-${item.id}`} type="button" onClick={() => setTagged(on ? null : item)} aria-pressed={on}
                          data-testid={`link-${item.type}-${item.id}`}
                          style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:10,
                            border:`1px solid ${on ? B : LN}`, backgroundColor: on ? '#eff6ff' : WH, cursor:'pointer', textAlign:'left', fontFamily:'inherit' }}>
                          <div style={{ width:32, height:32, borderRadius:8, backgroundColor:'#F1F5F9', flexShrink:0, overflow:'hidden' }}>
                            {item.image && <img src={item.image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />}
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:14, fontWeight:700, color:DK, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.title}</div>
                            <div style={{ fontSize:12, color:GR }}>{typeLabel}{item.price ? ` · TZS ${Number(item.price).toLocaleString('en-US')}` : ''}</div>
                          </div>
                          {on && <Icon d="M5 12l5 5L20 7" color={B} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )
          ) : (
            <div>
              <div style={{ fontSize:14, fontWeight:800, color:DK, marginBottom:8 }}>
                {t('create_moment_modal.category_label')}
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {LOOKING_FOR_CATEGORIES.map(cat => (
                  <button key={cat} type="button" onClick={() => setCategory(cat)} style={pill(category === cat)}>{cat}</button>
                ))}
              </div>
              <div style={{ fontSize:13, color:GR, marginTop:10, lineHeight:1.5 }}>
                {t('create_moment_modal.looking_for_hint')}
              </div>
            </div>
          )}

          {/* Audience: the server enforces it on every read */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, borderTop:`1px solid ${LN}`, paddingTop:12 }}>
            <span style={{ fontSize:14, fontWeight:700, color:DK }}>Wanaoona</span>
            <span role="radiogroup" aria-label="Wanaoona" style={{ display:'flex', gap:6 }}>
              <button type="button" role="radio" aria-checked={audience === 'public'} data-testid="audience-public" onClick={() => setAudience('public')} style={pill(audience === 'public')}>Wote</button>
              <button type="button" role="radio" aria-checked={audience === 'followers'} data-testid="audience-followers" onClick={() => setAudience('followers')} style={pill(audience === 'followers')}>Wanaofuata</button>
            </span>
          </div>

          {kind === 'moment' && intent.sale && onNavigate && (
            <div data-testid="moment-sale-hint" role="status"
              style={{ padding:12, borderRadius:12, background:'#eff6ff', color:'#0f1419', fontSize:15, lineHeight:'20px' }}>
              {keepMoment
                ? <>Itawekwa kama Moment. <button type="button" onClick={() => setKeepMoment(false)}
                    style={{ background:'none', border:'none', padding:0, color:'#1d4ed8', fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Ifanye tangazo</button></>
                : <>Hii inaonekana ni bidhaa ya kuuza{intent.price ? ` (TZS ${Number(intent.price).toLocaleString('en-US')})` : ''}. Tutaiweka kama <b>tangazo</b> ili wanunuzi wakupate kwenye utafutaji.
                    {' '}<button type="button" data-testid="keep-moment" onClick={() => setKeepMoment(true)}
                    style={{ background:'none', border:'none', padding:0, color:'#1d4ed8', fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Hapana, ni Moment tu</button></>}
            </div>
          )}

          {error && step === 'write' && (
            <div role="alert" style={{ fontSize:13, color:'#B91C1C', fontWeight:600 }}>
              {error}
            </div>
          )}
        </div>

        {step === 'preview' ? (
          <div style={{ flexShrink:0, padding:'12px 16px max(12px, env(safe-area-inset-bottom))', borderTop:`1px solid ${LN}`, display:'flex', gap:8 }}>
            <button type="button" data-testid="preview-back" onClick={() => { setStep('write'); setError(''); }} disabled={posting}
              style={{ flex:1, height:48, background:WH, color:DK, border:`1px solid ${LN}`, borderRadius:24, cursor:'pointer', fontSize:15, fontWeight:700, fontFamily:'inherit' }}>
              Rudi kuhariri
            </button>
            <button type="button" data-testid="preview-publish" onClick={handlePost} disabled={posting}
              style={{ flex:1, height:48, background: posting ? '#93C5FD' : DK, color:WH, border:'none', borderRadius:24,
                cursor: posting ? 'not-allowed' : 'pointer', fontSize:15, fontWeight:700, fontFamily:'inherit' }}>
              {posting ? t('create_moment_modal.posting') : 'Chapisha'}
            </button>
          </div>
        ) : (
        <div style={{ flexShrink:0, padding:'12px 16px max(12px, env(safe-area-inset-bottom))',
          borderTop:`1px solid ${LN}` }}>
          <button type="button" onClick={handleNext} disabled={posting || actorUnresolved}
            style={{ width:'100%', height:48, background: posting ? '#93C5FD' : DK,
              color:WH, border:'none', borderRadius:24,
              cursor: posting ? 'not-allowed' : 'pointer', fontSize:15, fontWeight:700, fontFamily:'inherit' }}>
            {posting ? t('create_moment_modal.posting')
              : isEdit ? 'Hifadhi mabadiliko'
              : asAd ? 'Endelea kama tangazo'
              : mode === 'moment' ? t('create_moment_modal.share_moment_button') : t('create_moment_modal.post_request_button')}
          </button>
        </div>
        )}
      </div>
    </div>
  );
};

/**
 * The post as the feed card will show it: who posts, the kind, the text, the photos, the poll,
 * the linked item and who will see it. Nothing here is sent; "Chapisha" sends it.
 */
function PostPreview({ actor, kind, kindInfo, text, photos, pollOptions, pollDays, tagged, audience, category, topic, community, error }) {
  const tag = kind === 'looking_for' ? 'Natafuta' : formatTag(kindInfo.intent);
  const one = photos.length === 1 ? photos[0] : null;
  const where = [
    audience === 'followers' ? 'Wanaofuata tu' : 'Wote',
    community ? `Jumuiya: ${community}` : topic ? `Mada: ${topic}` : '',
    kind === 'looking_for' && category ? `Aina: ${category}` : '',
  ].filter(Boolean).join(' · ');
  return (
    <div data-testid="post-preview" style={{ flex:1, overflowY:'auto', padding:16, minHeight:0, display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ fontSize:13, color:GR }}>Hivi ndivyo chapisho lako litakavyoonekana.</div>
      <article style={{ border:`1px solid ${LN}`, borderRadius:16, padding:14, display:'flex', flexDirection:'column', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <b style={{ fontSize:15, color:DK }}>{actor?.title || 'Wewe'}</b>
          {actor?.subtitle && <span style={{ fontSize:13, color:GR }}>{actor.subtitle}</span>}
          {tag && <span style={{ fontSize:12, fontWeight:700, color:B, border:`1px solid ${B}`, borderRadius:10, padding:'1px 8px' }}>{tag}</span>}
        </div>
        {text && <div style={{ fontSize:15, lineHeight:1.45, color:DK, whiteSpace:'pre-wrap', overflowWrap:'anywhere' }}>{text}</div>}
        {one && (
          <img src={one.preview || one.url} alt="" style={{ width:'100%', aspectRatio: photoAspect(one.width && one.height ? one.width / one.height : null), objectFit:'cover', borderRadius:12, display:'block' }} />
        )}
        {photos.length > 1 && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4, borderRadius:12, overflow:'hidden' }}>
            {photos.map((p) => (
              <img key={p.preview || p.url} src={p.preview || p.url} alt="" style={{ width:'100%', aspectRatio:'1 / 1', objectFit:'cover', display:'block' }} />
            ))}
          </div>
        )}
        {kind === 'poll' && (
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {pollOptions.map((o, i) => (
              <div key={i} style={{ border:`1px solid ${LN}`, borderRadius:10, padding:'8px 12px', fontSize:14, color:DK }}>{o.trim()}</div>
            ))}
            <div style={{ fontSize:12, color:GR }}>Kura inafungwa baada ya siku {pollDays}</div>
          </div>
        )}
        {tagged && (
          <div style={{ display:'flex', alignItems:'center', gap:10, border:`1px solid ${LN}`, borderRadius:10, padding:'8px 10px' }}>
            {tagged.image && <img src={tagged.image} alt="" style={{ width:32, height:32, borderRadius:8, objectFit:'cover' }} />}
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:14, fontWeight:700, color:DK, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tagged.title}</div>
              {tagged.price ? <div style={{ fontSize:12, color:GR }}>TZS {Number(tagged.price).toLocaleString('en-US')}</div> : null}
            </div>
          </div>
        )}
      </article>
      <div data-testid="preview-audience" style={{ fontSize:13, color:GR }}>Wanaoona: {where}</div>
      {error && <div role="alert" style={{ fontSize:13, color:'#B91C1C', fontWeight:600 }}>{error}</div>}
    </div>
  );
}

export default CreateMomentModal;
