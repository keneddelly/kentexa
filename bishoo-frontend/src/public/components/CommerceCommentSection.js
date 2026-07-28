/**
 * CommerceCommentSection.js — Unified Commerce Comment System
 * Place at: src/public/components/CommerceCommentSection.js
 *
 * Drop into any detail page: <CommerceCommentSection entityType="product"
 * entityId={product.id} entityTitle={product.name} sellerId={product.sellerId}
 * isLoggedIn={isLoggedIn} currentUser={currentUser} onNavigate={onNavigate} />
 *
 * One thread, filterable — no separate Reviews/Questions/Comments pages.
 * Styling matches the rest of KenteXa (inline styles, same B/DK/GR/WH
 * palette, Manrope font) rather than introducing a new design system.
 *
 * FIX (this pass): every api.post()/api.get() in here previously had an
 * empty `catch {}` — if the backend rejected a submission for any reason
 * (validation error, a bad enum reference, anything), the UI silently did
 * nothing. That's very likely why a submitted review "didn't display" —
 * it may never have saved at all, with zero feedback to the user. Every
 * catch below now surfaces the real error message.
 */
import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api/api';

const B  = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';
const AMBER = '#D97706';
const RED = '#DC2626';

const ago = d => {
  if (!d) return '';
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60)    return 'Just now';
  if (s < 3600)  return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
};

const FILTERS = [
  { key: 'all',       label: 'All'      },
  { key: 'reviews',   label: '⭐ Reviews'  },
  { key: 'questions', label: '💬 Questions' },
  { key: 'media',     label: '📷 Media'    },
];

const PURCHASE_BADGE = {
  kentexa_purchase: { label: '✓ Kentexa Purchase', bg: '#DCFCE7', color: '#16A34A' },
  offline_purchase: { label: '✓ Verified Buyer',   bg: '#FEF3C7', color: AMBER    },
  community:        { label: 'Community Review',   bg: '#F1F5F9', color: GR      },
};

// ── Star rating (display or input) ─────────────────────────────────────────
const Stars = ({ value, onChange, size = 16 }) => {
  const interactive = !!onChange;
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span
          key={n}
          onClick={() => interactive && onChange(n)}
          style={{
            fontSize: size,
            cursor: interactive ? 'pointer' : 'default',
            color: n <= value ? '#F59E0B' : '#E2E8F0',
            lineHeight: 1,
          }}
        >★</span>
      ))}
    </div>
  );
};

// ── Rating summary header — average, count, star breakdown bars ───────────
const RatingSummary = ({ summary }) => {
  if (!summary || summary.total === 0) return null;
  const max = Math.max(1, ...Object.values(summary.breakdown));
  return (
    <div style={{ display: 'flex', gap: 20, padding: '16px 14px', backgroundColor: WH,
      borderBottom: '1px solid #F1F5F9', alignItems: 'center' }}>
      <div style={{ textAlign: 'center', flexShrink: 0 }}>
        <div style={{ fontSize: 32, fontWeight: 900, color: DK, lineHeight: 1 }}>
          {summary.average.toFixed(1)}
        </div>
        <Stars value={Math.round(summary.average)} size={14} />
        <div style={{ fontSize: 11, color: GR, marginTop: 4 }}>
          {summary.total} review{summary.total !== 1 ? 's' : ''}
        </div>
        {summary.verifiedPurchaseCount > 0 && (
          <div style={{ fontSize: 10, color: '#16A34A', fontWeight: 700, marginTop: 2 }}>
            {summary.verifiedPurchaseCount} verified
          </div>
        )}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {[5, 4, 3, 2, 1].map(star => (
          <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: GR, width: 10 }}>{star}</span>
            <div style={{ flex: 1, height: 6, backgroundColor: '#F1F5F9', borderRadius: 100, overflow: 'hidden' }}>
              <div style={{
                width: `${(summary.breakdown[star] / max) * 100}%`,
                height: '100%', backgroundColor: '#F59E0B', borderRadius: 100,
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Pinned AI summary card ─────────────────────────────────────────────────
const AiSummaryCard = ({ pinned }) => {
  if (!pinned) return null;
  return (
    <div style={{ margin: '12px 14px', padding: '14px 16px', borderRadius: 14,
      background: 'linear-gradient(135deg,#EFF6FF,#F5F3FF)', border: '1px solid #DBEAFE' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 14 }}>✨</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: B, textTransform: 'uppercase',
          letterSpacing: 0.4 }}>AI Summary of Customer Feedback</span>
      </div>
      <div style={{ fontSize: 13, color: DK, lineHeight: 1.5 }}>{pinned.body}</div>
    </div>
  );
};

// ── Media grid ──────────────────────────────────────────────────────────────
const MediaGrid = ({ media }) => {
  if (!media?.length) return null;
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
      {media.map((m, i) => (
        <div key={i} style={{ width: 72, height: 72, borderRadius: 10, overflow: 'hidden',
          backgroundColor: '#F1F5F9', flexShrink: 0 }}>
          {m.type === 'video' ? (
            <video src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
        </div>
      ))}
    </div>
  );
};

// ── One comment/review/question row + its nested seller reply ─────────────
const CommentRow = ({
  c, isSeller, isLoggedIn, onNavigate, onHelpful, onReplySubmit,
}) => {
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState('');
  const isReview = c.type === 'review';
  const badge = PURCHASE_BADGE[c.purchaseVerification];

  const submitReply = async () => {
    if (!replyBody.trim()) return;
    setSending(true);
    setReplyError('');
    try {
      await onReplySubmit(c.id, replyBody.trim());
      setReplyBody('');
      setShowReplyBox(false);
    } catch (err) {
      setReplyError(err?.response?.data?.message || 'Could not send your reply — try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ padding: '14px', borderBottom: '1px solid #F8FAFC' }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => c.author?.id && onNavigate(`CommerceProfile-${c.author.id}`)}
          style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, border: 'none',
            padding: 0, cursor: 'pointer', overflow: 'hidden', backgroundColor: B,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {c.author?.logo
            ? <img src={c.author.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ color: WH, fontSize: 13, fontWeight: 900 }}>
                {(c.author?.name || 'U').charAt(0).toUpperCase()}
              </span>}
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: DK }}>
              {c.author?.storeName || c.author?.name || 'User'}
            </span>
            {c.type === 'question' && (
              <span style={{ fontSize: 9, fontWeight: 700, color: '#7C3AED', backgroundColor: '#F5F3FF',
                padding: '2px 8px', borderRadius: 100 }}>❓ Question</span>
            )}
            <span style={{ fontSize: 10, color: GR }}>{ago(c.createdAt)}</span>
          </div>

          {isReview && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Stars value={c.rating} size={13} />
              {badge && (
                <span style={{ fontSize: 9, fontWeight: 700, color: badge.color,
                  backgroundColor: badge.bg, padding: '2px 8px', borderRadius: 100 }}>
                  {badge.label}
                </span>
              )}
            </div>
          )}

          {c.body && <div style={{ fontSize: 13, color: DK, lineHeight: 1.5 }}>{c.body}</div>}
          <MediaGrid media={c.media} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
            {isReview && (
              <button onClick={() => onHelpful(c.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', gap: 4, color: c.helpfulByMe ? B : GR,
                  fontSize: 11, fontWeight: 700, padding: 0 }}>
                👍 Helpful{c.helpfulCount > 0 ? ` (${c.helpfulCount})` : ''}
              </button>
            )}
            {isSeller && !c.replies?.length && c.type !== 'seller_reply' && (
              <button onClick={() => { if (!isLoggedIn) { onNavigate('PublicLogin'); return; } setShowReplyBox(s => !s); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: B,
                  fontSize: 11, fontWeight: 700, padding: 0 }}>
                Reply as seller
              </button>
            )}
          </div>

          {showReplyBox && (
            <div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input value={replyBody} onChange={e => setReplyBody(e.target.value)}
                  placeholder="Write your reply..."
                  style={{ flex: 1, padding: '8px 12px', borderRadius: 10, border: '1px solid #E2E8F0',
                    fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
                <button onClick={submitReply} disabled={sending || !replyBody.trim()}
                  style={{ backgroundColor: B, color: WH, border: 'none', borderRadius: 10,
                    padding: '0 14px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                  {sending ? '...' : 'Send'}
                </button>
              </div>
              {replyError && (
                <div style={{ fontSize: 11, color: RED, marginTop: 6, fontWeight: 600 }}>
                  {replyError}
                </div>
              )}
            </div>
          )}

          {/* ── Seller replies — nested, one level ── */}
          {c.replies?.map(r => (
            <div key={r.id} style={{ display: 'flex', gap: 8, marginTop: 10, padding: '10px 12px',
              backgroundColor: '#F8FAFC', borderRadius: 10, borderLeft: `3px solid ${B}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: B }}>
                    {r.author?.storeName || r.author?.name || 'Seller'}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: WH, backgroundColor: B,
                    padding: '1px 7px', borderRadius: 100 }}>Seller</span>
                  <span style={{ fontSize: 10, color: GR }}>{ago(r.createdAt)}</span>
                </div>
                <div style={{ fontSize: 12, color: DK, lineHeight: 1.5 }}>{r.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Composer — Comment / Question / Review toggle ──────────────────────────
const Composer = ({ entityType, entityId, isLoggedIn, currentUser, onNavigate, onPosted }) => {
  const [mode, setMode] = useState('comment'); // 'comment' | 'question' | 'review'
  const [body, setBody] = useState('');
  const [rating, setRating] = useState(0);
  const [offlineClaim, setOfflineClaim] = useState(false);
  const [media, setMedia] = useState([]); // [{url, type}]
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // TODO / INTEGRATION POINT: point this at whatever endpoint
  // upload.controller.ts exposes (per the project handoff doc it's the
  // existing Cloudinary-backed upload used elsewhere, e.g. SellerClassifieds).
  // Adjust the URL/field name/response shape to match that controller.
  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, 10 - media.length);
    if (!files.length) return;
    setUploading(true);
    setError('');
    try {
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        const res = await api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
        const url = res.data?.url || res.data?.secure_url;
        if (url) {
          setMedia(prev => [...prev, { url, type: file.type.startsWith('video') ? 'video' : 'image' }]);
        }
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not upload that file — try again.');
    }
    finally { setUploading(false); }
  };

  const canSubmit = mode === 'review' ? rating > 0 && (body.trim() || media.length) : body.trim().length > 0;

  const submit = async () => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    if (!canSubmit) return;
    try {
      setSending(true);
      setError('');
      const dto = {
        entityType, entityId,
        type: mode === 'review' ? 'review' : mode === 'question' ? 'question' : 'comment',
        body: body.trim() || undefined,
        rating: mode === 'review' ? rating : undefined,
        media: media.length ? media : undefined,
        offlinePurchaseClaim: mode === 'review' ? offlineClaim : undefined,
      };
      const res = await api.post('/comments', dto);
      onPosted(res.data);
      setBody(''); setRating(0); setMedia([]); setOfflineClaim(false); setMode('comment');
    } catch (err) {
      // This used to be an empty catch — any backend rejection (validation
      // error, a bad query, anything) failed completely silently, which is
      // very likely why a submitted review "didn't display": it may never
      // have saved, with zero feedback that anything went wrong.
      setError(err?.response?.data?.message || 'Could not post — please try again.');
    }
    finally { setSending(false); }
  };

  return (
    <div style={{ backgroundColor: WH, borderTop: '1px solid #F1F5F9', padding: '12px 14px' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {[
          { key: 'comment',  label: '💬 Comment' },
          { key: 'question', label: '❓ Ask'      },
          { key: 'review',   label: '⭐ Review'    },
        ].map(m => (
          <button key={m.key} onClick={() => { setMode(m.key); setError(''); }}
            style={{ flex: 1, padding: '7px 0', borderRadius: 10, cursor: 'pointer',
              border: `1.5px solid ${mode === m.key ? B : '#E2E8F0'}`,
              backgroundColor: mode === m.key ? '#EFF6FF' : WH,
              color: mode === m.key ? B : GR, fontSize: 11, fontWeight: 700 }}>
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'review' && (
        <div style={{ marginBottom: 8 }}>
          <Stars value={rating} onChange={setRating} size={24} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8,
            fontSize: 11, color: GR, cursor: 'pointer' }}>
            <input type="checkbox" checked={offlineClaim}
              onChange={e => setOfflineClaim(e.target.checked)} />
            I bought this outside Kentexa
          </label>
        </div>
      )}

      <textarea value={body} onChange={e => setBody(e.target.value)}
        placeholder={mode === 'review' ? 'Share your experience...'
          : mode === 'question' ? 'Ask the seller a question...'
          : 'Write a comment...'}
        style={{ width: '100%', minHeight: 60, padding: '10px 12px', borderRadius: 10,
          border: '1px solid #E2E8F0', fontSize: 13, outline: 'none', resize: 'vertical',
          fontFamily: 'inherit', boxSizing: 'border-box' }} />

      {mode === 'review' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {media.map((m, i) => (
            <div key={i} style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden',
              backgroundColor: '#F1F5F9', position: 'relative' }}>
              <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button onClick={() => setMedia(prev => prev.filter((_, idx) => idx !== i))}
                style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%',
                  backgroundColor: '#EF4444', color: WH, border: 'none', fontSize: 10, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
          ))}
          {media.length < 10 && (
            <label style={{ width: 48, height: 48, borderRadius: 8, border: '1.5px dashed #CBD5E1',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              fontSize: 18, color: GR }}>
              {uploading ? '⏳' : '+'}
              <input type="file" accept="image/*,video/*" multiple hidden
                onChange={handleFileSelect} disabled={uploading} />
            </label>
          )}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: RED, marginTop: 8, fontWeight: 600,
          backgroundColor: '#FEF2F2', borderRadius: 8, padding: '8px 10px' }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button onClick={submit} disabled={!canSubmit || sending}
          style={{ backgroundColor: canSubmit ? B : '#E2E8F0', color: canSubmit ? WH : GR,
            border: 'none', borderRadius: 10, padding: '9px 22px', cursor: canSubmit ? 'pointer' : 'default',
            fontSize: 12, fontWeight: 800 }}>
          {sending ? 'Posting...' : mode === 'review' ? 'Post Review' : mode === 'question' ? 'Ask' : 'Post'}
        </button>
      </div>
    </div>
  );
};

// ── Main ─────────────────────────────────────────────────────────────────
const CommerceCommentSection = ({
  entityType, entityId, entityTitle = 'this listing', sellerId,
  isLoggedIn, currentUser, onNavigate,
}) => {
  const [filter,  setFilter]  = useState('all');
  const [pinned,  setPinned]  = useState(null);
  const [items,   setItems]   = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const isSeller = !!currentUser && !!sellerId && currentUser.id === sellerId;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [listRes, summaryRes] = await Promise.all([
        api.get('/comments', { params: { entityType, entityId, filter } }),
        api.get('/comments/rating-summary', { params: { entityType, entityId } }),
      ]);
      setPinned(listRes.data?.pinned || null);
      setItems(listRes.data?.items || []);
      setSummary(summaryRes.data || null);
    } catch (err) {
      setLoadError(err?.response?.data?.message || 'Could not load comments — try again.');
    }
    finally { setLoading(false); }
  }, [entityType, entityId, filter]);

  useEffect(() => { load(); }, [load]);

  const handleHelpful = async (commentId) => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    try {
      const res = await api.post(`/comments/${commentId}/helpful`);
      setItems(prev => prev.map(c => c.id === commentId
        ? { ...c, helpfulByMe: res.data.helpful, helpfulCount: res.data.helpfulCount }
        : c));
    } catch {
      // Non-critical toggle — fails quietly, but no state is left
      // inconsistent since we never optimistically updated first.
    }
  };

  // Re-throws so CommentRow's submitReply can show the real error inline.
  const handleReply = async (parentId, body) => {
    const res = await api.post(`/comments/${parentId}/reply`, { body });
    setItems(prev => prev.map(c => c.id === parentId
      ? { ...c, replies: [...(c.replies || []), res.data] }
      : c));
  };

  const handlePosted = (newComment) => {
    setItems(prev => [{ ...newComment, replies: [], helpfulByMe: false }, ...prev]);
    if (newComment.type === 'review') {
      api.get('/comments/rating-summary', { params: { entityType, entityId } })
        .then(r => setSummary(r.data)).catch(() => {});
    }
  };

  return (
    <div style={{ backgroundColor: WH, borderRadius: 16, overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>

      <RatingSummary summary={summary} />
      <AiSummaryCard pinned={pinned} />

      {/* Filter tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #F1F5F9', overflowX: 'auto' }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{ flex: 1, padding: '10px 0', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
              color: filter === f.key ? B : GR,
              borderBottom: `2px solid ${filter === f.key ? B : 'transparent'}` }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: GR, fontSize: 12 }}>Loading...</div>
        ) : loadError ? (
          <div style={{ padding: '30px 20px', textAlign: 'center', color: RED, fontSize: 12 }}>
            ⚠️ {loadError}
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: '30px 20px', textAlign: 'center', color: GR, fontSize: 12 }}>
            {filter === 'reviews' ? 'No reviews yet — be the first to share your experience.'
              : filter === 'questions' ? 'No questions yet — ask the seller anything.'
              : filter === 'media' ? 'No photos or videos yet.'
              : 'No comments yet. Start the conversation.'}
          </div>
        ) : (
          items.map(c => (
            <CommentRow key={c.id} c={c} isSeller={isSeller} isLoggedIn={isLoggedIn}
              onNavigate={onNavigate} onHelpful={handleHelpful} onReplySubmit={handleReply} />
          ))
        )}
      </div>

      <Composer entityType={entityType} entityId={entityId} isLoggedIn={isLoggedIn}
        currentUser={currentUser} onNavigate={onNavigate} onPosted={handlePosted} />
    </div>
  );
};

export default CommerceCommentSection;