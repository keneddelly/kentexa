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
import api from '../../api/api';

const B  = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';

const LOOKING_FOR_CATEGORIES = [
  'Electronics', 'Fashion', 'Food', 'Hardware', 'Furniture',
  'Beauty', 'Agriculture', 'Automotive', 'Services', 'Other',
];

const routeTitle = (r) => {
  if (r.routeType === 'intercity' && r.originCity && r.destinationCity) {
    return `${r.originCity} → ${r.destinationCity}`;
  }
  if (r.routeType === 'local_loop' && r.loopStops?.length) {
    return r.loopStops.join(' → ');
  }
  if (r.routeType === 'last_mile' && r.coverageWards?.length) {
    return `${r.coverageCity || ''} — ${r.coverageWards.slice(0, 3).join(', ')}`.trim();
  }
  return 'My Route';
};

const CreateMomentModal = ({ onClose, onPosted, currentUser, initialMode }) => {
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
    Promise.allSettled([
      api.get(`/classifieds/seller/${uid}`),
      api.get(`/products/seller/${uid}`),
      api.get('/services/my'),
      api.get('/transport/routes'),
    ]).then(([cl, pr, sv, rt]) => {
      const items = [];
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
          type: 'route', id: r.id, title: routeTitle(r), image: null,
        }));
      }
      setMyItems(items);
    }).finally(() => setLoadingItems(false));
  }, [currentUser?.id]);

  const handlePickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError('');
  };

  const handlePost = async () => {
    if (mode === 'selling') {
      if (!file)   { setError('Add a photo first'); return; }
      if (!tagged) { setError('Tag a product, listing, or service'); return; }
    } else {
      if (!caption.trim()) { setError('Describe what you\u2019re looking for'); return; }
      if (!category)        { setError('Pick a category'); return; }
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
        if (mode === 'selling' && !imageUrl) throw new Error('Upload failed');
      }

      if (mode === 'selling') {
        await api.post('/feed/publish', {
          type: 'moment',
          title: caption.trim() || tagged.title,
          body: caption.trim() || null,
          imageUrl,
          linkedEntityType: tagged.type,
          linkedEntityId: tagged.id,
        });
      } else {
        await api.post('/feed/publish', {
          type: 'looking_for',
          title: caption.trim(),
          body: caption.trim(),
          imageUrl,
          category,
        });
      }

      onPosted?.();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not post — try again');
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
            {mode === 'selling' ? '📸 Share a Moment' : '🙋 Looking For Something'}
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
            🛍️ I'm Selling
          </button>
          <button onClick={() => { setMode('looking_for'); setError(''); }}
            style={{ flex:1, padding:'10px 0', borderRadius:10, cursor:'pointer',
              border: mode==='looking_for' ? '2px solid #7C3AED' : '1.5px solid #E2E8F0',
              backgroundColor: mode==='looking_for' ? '#F5F3FF' : WH,
              color: mode==='looking_for' ? '#7C3AED' : GR, fontSize:13, fontWeight:800 }}>
            🙋 Looking For
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
                Change photo
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
                {mode==='selling' ? 'Tap to add a photo' : 'Add a photo (optional)'}
              </span>
            </button>
          )}

          {/* Caption / description */}
          <textarea value={caption} onChange={e => setCaption(e.target.value)}
            placeholder={mode==='selling'
              ? 'Say something about it (optional)...'
              : "What are you looking for? e.g. \u201cNeed a used fridge, working condition, Kariakoo area\u201d"}
            maxLength={140}
            style={{ width:'100%', minHeight:60, padding:'10px 12px', borderRadius:10,
              border:'1px solid #E2E8F0', fontSize:13, resize:'vertical',
              boxSizing:'border-box', fontFamily:'inherit', marginBottom:16, outline:'none' }} />

          {mode === 'selling' ? (
            <>
              {/* Tag picker */}
              <div style={{ fontSize:12, fontWeight:800, color:DK, marginBottom:8 }}>
                Tag what this Moment is about
              </div>
              {loadingItems ? (
                <div style={{ fontSize:12, color:GR, padding:'12px 0' }}>Loading your items...</div>
              ) : myItems.length === 0 ? (
                <div style={{ fontSize:12, color:GR, backgroundColor:'#F8FAFC',
                  borderRadius:10, padding:14 }}>
                  You don't have any products, listings, services, or routes yet — add one first,
                  then come back to share a Moment about it.
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:220,
                  overflowY:'auto' }}>
                  {myItems.map((item, i) => {
                    const prevType = myItems[i - 1]?.type;
                    const showHeader = item.type !== prevType;
                    const typeLabel = {
                      product: '🛍️ Shop Products', classified: '🏷️ Listings',
                      service: '🔧 Services', route: '🚌 My Routes',
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
                              : (item.type==='product'?'🛍️':item.type==='service'?'🔧':item.type==='route'?'🚌':'🏷️')}
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
                Category
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
                🙋 Sellers who have what you need can reply with "I Have This" —
                you'll see their actual product right in the comments.
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
            {posting ? 'Posting...' : mode==='selling' ? '📸 Share Moment' : '🙋 Post Request'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateMomentModal;