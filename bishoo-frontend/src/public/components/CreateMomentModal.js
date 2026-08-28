/**
 * CreateMomentModal.js — Share a Moment ("I'm Selling") or post a
 * "Looking For" request. Any user, from anywhere in the app.
 *
 * Place at: src/public/components/CreateMomentModal.js
 *
 * Lives at the App.js level (like PostModal) so the ➕ bottom-nav button
 * can open it regardless of which page the user is currently on — not
 * just from HomeFeed's story ring.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';

const B  = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
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

const CreateMomentModal = ({ onClose, onPosted, currentUser, initialMode, activeProfileId, activeProfile }) => {
  const { t } = useTranslation();
  const LOOKING_FOR_CATEGORIES = getLookingForCategories(t);
  const [mode,      setMode]      = useState(initialMode === 'looking_for' ? 'looking_for' : 'selling');
  const [file,      setFile]      = useState(null);
  const [preview,   setPreview]   = useState(null);
  const [caption,   setCaption]   = useState('');
  const [category,  setCategory]  = useState('');
  const [myItems,   setMyItems]   = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [tagged,    setTagged]    = useState(null); // { type, id, title }
  const [posting,   setPosting]   = useState(false);
  const [error,     setError]     = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    const uid = currentUser?.id;
    if (!uid) { setLoadingItems(false); return; }
    // Scoped to the ACTIVE profile when one is known — Kened's Personal
    // profile must only ever see Kened's own classifieds here, never Bishoo
    // Intelligence Systems' products just because they share an account,
    // and vice versa when Bishoo is active. Falls back to the old
    // account-wide endpoints only if activeProfileId is somehow unset
    // (shouldn't happen for a logged-in user, but keeps this from breaking
    // if it ever is). `/services/my` was also just a dead 404 before this —
    // the real route is `/services/my/ads`, so service ads never actually
    // loaded into this picker at all.
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
      // Always available, for every profile type — a Moment tagged to a
      // specific product/service/route only ever fit identities that HAVE
      // one; a Super Agent hub has none of those (no products, no
      // classifieds, no service ads, no transport routes), so "tag
      // something" used to hard-block them from ever posting a Selling-
      // mode Moment at all, even though sharing hub activity to build
      // reputation is exactly what CLAUDE.md's Super Agent identity
      // section calls for. Tagging the active profile itself covers that
      // — and is just as useful for any other identity posting an update
      // that isn't really about one listing (a new branch, a milestone).
      if (activeProfileId) {
        items.push({
          type: 'business',
          id: activeProfileId,
          title: activeProfile?.displayName || currentUser?.storeName || currentUser?.name || t('create_moment_modal.type_label_business'),
          image: activeProfile?.photoUrl || null,
        });
      }
      if (cl.status === 'fulfilled') {
        (cl.value.data || []).forEach(c => items.push({
          type: 'classified', id: c.id, title: c.title, image: c.images?.[0],
        }));
      }
      if (pr.status === 'fulfilled') {
        (pr.value.data || []).forEach(p => items.push({
          type: 'product', id: p.id, title: p.name, image: p.images?.[0],
        }));
      }
      if (sv.status === 'fulfilled') {
        (sv.value.data?.ads || sv.value.data || []).forEach(s => items.push({
          type: 'service', id: s.id, title: s.title, image: s.images?.[0],
        }));
      }
      if (rt.status === 'fulfilled') {
        (rt.value.data || []).forEach(r => items.push({
          type: 'route', id: r.id, title: routeTitle(r, t), image: null,
        }));
      }
      setMyItems(items);
    }).finally(() => setLoadingItems(false));
  }, [currentUser?.id, activeProfileId, activeProfile, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError('');
  };

  const handlePost = async () => {
    if (mode === 'selling') {
      if (!file)   { setError(t('create_moment_modal.validate_add_photo')); return; }
      if (!tagged) { setError(t('create_moment_modal.validate_tag_item')); return; }
    } else {
      if (!caption.trim()) { setError(t('create_moment_modal.validate_describe')); return; }
      if (!category)        { setError(t('create_moment_modal.validate_pick_category')); return; }
    }
    try {
      setPosting(true);
      setError('');

      let imageUrl = null;
      if (file) {
        const form = new FormData();
        form.append('files', file);
        const up = await api.post('/upload/images', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        imageUrl = up.data?.urls?.[0] || null;
        if (mode === 'selling' && !imageUrl) throw new Error(t('create_moment_modal.upload_failed'));
      }

      if (mode === 'selling') {
        await api.post('/feed/publish', {
          type: 'moment',
          title: caption.trim() || tagged.title,
          body: caption.trim() || null,
          imageUrl,
          linkedEntityType: tagged.type,
          linkedEntityId: tagged.id,
          commerceProfileId: activeProfileId || undefined,
        });
      } else {
        await api.post('/feed/publish', {
          type: 'looking_for',
          title: caption.trim(),
          body: caption.trim(),
          imageUrl,
          category,
          commerceProfileId: activeProfileId || undefined,
        });
      }

      onPosted?.();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || t('create_moment_modal.post_failed'));
    } finally {
      setPosting(false);
    }
  };

  return (
    <div style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.75)',
      zIndex:4500, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div style={{ width:'100%', maxWidth:480, backgroundColor:WH,
        borderRadius:'20px 20px 0 0', maxHeight:'92vh', display:'flex',
        flexDirection:'column' }}>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'16px 16px 12px', borderBottom:'1px solid #F1F5F9', flexShrink:0 }}>
          <button onClick={onClose} style={{ background:'none', border:'none',
            cursor:'pointer', fontSize:20, color:GR, padding:4 }}>×</button>
          <div style={{ fontSize:15, fontWeight:900, color:DK }}>
            {mode === 'selling' ? t('create_moment_modal.title_selling') : t('create_moment_modal.title_looking_for')}
          </div>
          <div style={{ width:28 }} />
        </div>

        {/* Mode toggle */}
        <div style={{ display:'flex', gap:8, padding:'12px 16px 0', flexShrink:0 }}>
          <button onClick={() => { setMode('selling'); setError(''); }}
            style={{ flex:1, padding:'10px 0', borderRadius:10, cursor:'pointer',
              border: mode==='selling' ? `2px solid ${B}` : '1.5px solid #E2E8F0',
              backgroundColor: mode==='selling' ? '#EFF6FF' : WH,
              color: mode==='selling' ? B : GR, fontSize:13, fontWeight:800 }}>
            {t('create_moment_modal.toggle_selling')}
          </button>
          <button onClick={() => { setMode('looking_for'); setError(''); }}
            style={{ flex:1, padding:'10px 0', borderRadius:10, cursor:'pointer',
              border: mode==='looking_for' ? '2px solid #7C3AED' : '1.5px solid #E2E8F0',
              backgroundColor: mode==='looking_for' ? '#F5F3FF' : WH,
              color: mode==='looking_for' ? '#7C3AED' : GR, fontSize:13, fontWeight:800 }}>
            {t('create_moment_modal.toggle_looking_for')}
          </button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:16, minHeight:0 }}>
          {/* Photo picker — required for Selling, optional for Looking For */}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handlePickFile} />
          {preview ? (
            <div onClick={() => fileRef.current?.click()}
              style={{ width:'100%', aspectRatio:'1/1', borderRadius:14, overflow:'hidden',
                cursor:'pointer', marginBottom:16, position:'relative' }}>
              <img src={preview} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              <div style={{ position:'absolute', bottom:8, right:8, backgroundColor:'rgba(0,0,0,0.6)',
                color:WH, fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:100 }}>
                {t('create_moment_modal.change_photo')}
              </div>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()}
              style={{ width:'100%', aspectRatio: mode==='selling' ? '1/1' : undefined,
                minHeight: mode==='looking_for' ? 90 : undefined,
                borderRadius:14, border:'2px dashed #CBD5E1', backgroundColor:'#F8FAFC',
                display:'flex', flexDirection:'column', alignItems:'center',
                justifyContent:'center', gap:8, cursor:'pointer', marginBottom:16,
                padding: mode==='looking_for' ? '16px 0' : 0 }}>
              <span style={{ fontSize: mode==='selling' ? 36 : 24 }}>📷</span>
              <span style={{ fontSize:13, fontWeight:700, color:GR }}>
                {mode==='selling' ? t('create_moment_modal.tap_add_photo') : t('create_moment_modal.add_photo_optional')}
              </span>
            </button>
          )}

          {/* Caption / description */}
          <textarea value={caption} onChange={e => setCaption(e.target.value)}
            placeholder={mode==='selling'
              ? t('create_moment_modal.placeholder_selling')
              : t('create_moment_modal.placeholder_looking_for')}
            maxLength={140}
            style={{ width:'100%', minHeight:60, padding:'10px 12px', borderRadius:10,
              border:'1px solid #E2E8F0', fontSize:13, resize:'vertical',
              boxSizing:'border-box', fontFamily:'inherit', marginBottom:16, outline:'none' }} />

          {mode === 'selling' ? (
            <>
              {/* Tag picker */}
              <div style={{ fontSize:12, fontWeight:800, color:DK, marginBottom:8 }}>
                {t('create_moment_modal.tag_moment_label')}
              </div>
              {loadingItems ? (
                <div style={{ fontSize:12, color:GR, padding:'12px 0' }}>{t('create_moment_modal.loading_items')}</div>
              ) : myItems.length === 0 ? (
                <div style={{ fontSize:12, color:GR, backgroundColor:'#F8FAFC',
                  borderRadius:10, padding:14 }}>
                  {t('create_moment_modal.no_items_msg')}
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:220,
                  overflowY:'auto' }}>
                  {myItems.map((item, i) => {
                    const prevType = myItems[i - 1]?.type;
                    const showHeader = item.type !== prevType;
                    const typeLabel = {
                      business: t('create_moment_modal.type_label_business'),
                      product: t('create_moment_modal.type_label_product'), classified: t('create_moment_modal.type_label_classified'),
                      service: t('create_moment_modal.type_label_service'), route: t('create_moment_modal.type_label_route'),
                    }[item.type];
                    return (
                      <React.Fragment key={`${item.type}-${item.id}`}>
                        {showHeader && (
                          <div style={{ fontSize:10, fontWeight:800, color:GR,
                            textTransform:'uppercase', letterSpacing:0.4,
                            marginTop: i > 0 ? 6 : 0 }}>
                            {typeLabel}
                          </div>
                        )}
                        <button onClick={() => setTagged(item)}
                          style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px',
                            borderRadius:10, border: tagged?.type===item.type && tagged?.id===item.id
                              ? `2px solid ${B}` : '1px solid #E2E8F0',
                            backgroundColor: tagged?.type===item.type && tagged?.id===item.id
                              ? '#EFF6FF' : WH,
                            cursor:'pointer', textAlign:'left' }}>
                          <div style={{ width:32, height:32, borderRadius:8, backgroundColor:'#F1F5F9',
                            flexShrink:0, overflow:'hidden', display:'flex', alignItems:'center',
                            justifyContent:'center', fontSize:14 }}>
                            {item.image
                              ? <img src={item.image} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} />
                              : (item.type==='business'?'🏢':item.type==='product'?'🛍️':item.type==='service'?'🔧':item.type==='route'?'🚌':'🏷️')}
                          </div>
                          <div style={{ fontSize:12, fontWeight:700, color:DK, flex:1,
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {item.title}
                          </div>
                          {tagged?.type===item.type && tagged?.id===item.id && (
                            <span style={{ color:B, fontWeight:900 }}>✓</span>
                          )}
                        </button>
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Category picker for Looking For */}
              <div style={{ fontSize:12, fontWeight:800, color:DK, marginBottom:8 }}>
                {t('create_moment_modal.category_label')}
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {LOOKING_FOR_CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => setCategory(cat)}
                    style={{ padding:'7px 14px', borderRadius:100, cursor:'pointer',
                      border: category===cat ? '2px solid #7C3AED' : '1px solid #E2E8F0',
                      backgroundColor: category===cat ? '#F5F3FF' : WH,
                      color: category===cat ? '#7C3AED' : GR,
                      fontSize:12, fontWeight:700 }}>
                    {cat}
                  </button>
                ))}
              </div>
              <div style={{ fontSize:11, color:GR, marginTop:12, lineHeight:1.5,
                backgroundColor:'#F5F3FF', borderRadius:10, padding:12 }}>
                {t('create_moment_modal.looking_for_hint')}
              </div>
            </>
          )}

          {error && (
            <div style={{ fontSize:12, color:'#DC2626', marginTop:10, fontWeight:600 }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ flexShrink:0, padding:'12px 16px max(12px, env(safe-area-inset-bottom))',
          borderTop:'1px solid #F1F5F9' }}>
          <button onClick={handlePost} disabled={posting}
            style={{ width:'100%', background: posting
              ? '#93C5FD' : mode==='selling'
                ? `linear-gradient(135deg,${B},#7C3AED)`
                : 'linear-gradient(135deg,#7C3AED,#EC4899)',
              color:WH, border:'none', borderRadius:12, padding:'13px 0',
              cursor: posting ? 'not-allowed' : 'pointer', fontSize:14, fontWeight:800 }}>
            {posting ? t('create_moment_modal.posting') : mode==='selling' ? t('create_moment_modal.share_moment_button') : t('create_moment_modal.post_request_button')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateMomentModal;