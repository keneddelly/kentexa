import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';

export default function ProfileConnections({ profile, kind, isLoggedIn, currentUser, onNavigate, onClose, onChanged }) {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const closeRef = useRef(null);
  const generation = useRef(0);
  const closeHandler = useRef(onClose);
  closeHandler.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    const escape = e => { if (e.key === 'Escape') closeHandler.current(); };
    document.addEventListener('keydown', escape);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      generation.current += 1;
      document.body.style.overflow = oldOverflow;
      document.removeEventListener('keydown', escape);
      previous?.focus?.();
    };
  }, []);
  useEffect(() => {
    const version = ++generation.current;
    setLoading(true); setError('');
    api.get(`/profiles/${profile.id}/${kind}`, { params: { page, limit: 20 } })
      .then(({ data }) => {
        if (generation.current !== version) return;
        setItems(previous => page === 1 ? data.items : [...previous, ...data.items]);
        setHasMore(!!data.hasMore);
      })
      .catch(() => { if (generation.current === version) setError(t('profile_connections.error')); })
      .finally(() => { if (generation.current === version) setLoading(false); });
  }, [profile.id, kind, page, t]);
  const follow = async item => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    if (busy != null || !item.profileId) return;
    setBusy(item.profileId); setError('');
    try {
      const { data } = await api.post(`/profiles/${item.profileId}/follow`);
      setItems(previous => previous.map(row => row.profileId === item.profileId ? { ...row, isFollowing: data.following } : row));
      await onChanged?.();
    } catch { setError(t('profile_connections.error')); }
    finally { setBusy(null); }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="profile-connections-title"
        onKeyDown={e => {
          if (e.key !== 'Tab') return;
          const controls = [...e.currentTarget.querySelectorAll('button:not(:disabled)')];
          const first = controls[0], last = controls[controls.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }}
        style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto', padding: 16 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <h2 id="profile-connections-title" style={{ fontSize: 20, margin: 0 }}>{t(`profile_connections.${kind}`)}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={t('profile_connections.close')}
            style={{ minWidth: 44, minHeight: 44, border: 'none', background: '#f1f5f9', borderRadius: 10, fontSize: 24 }}>×</button>
        </header>
        <p style={{ fontSize: 16, color: '#64748b' }}>{kind === 'following' && profile.type !== 'personal' ? t('profile_connections.account_hint') : profile.displayName}</p>
        {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
        {!loading && !error && items.length === 0 && <p>{t('profile_connections.empty')}</p>}
        {items.map(item => (
          <div key={item.profileId || `user-${item.ownerId}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
            <button type="button" onClick={() => { onClose(); onNavigate(`CommerceProfile-${item.ownerId}`, item.profileId ? { commerceProfileId: item.profileId } : null); }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, border: 'none', background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
              {item.photoUrl ? <img src={item.photoUrl} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} /> :
                <span aria-hidden="true" style={{ width: 44, height: 44, borderRadius: '50%', background: '#eff6ff', color: '#1d4ed8', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{item.displayName?.slice(0, 1)}</span>}
              <span style={{ fontSize: 16, overflowWrap: 'anywhere' }}>
                <strong>{item.displayName}</strong>
                <small style={{ display: 'block', color: '#64748b', fontSize: 13 }}>{t(`profile_connections.type_${item.type}`)}</small>
                {item.isFollowedBy && <small style={{ display: 'block', color: '#2563eb', fontSize: 13 }}>{t('profile_connections.follows_you')}</small>}
              </span>
            </button>
            {item.profileId && item.ownerId !== currentUser?.id && <button type="button" disabled={busy != null} onClick={() => follow(item)}
              style={{ minHeight: 44, maxWidth: 130, border: '1px solid #2563eb', background: item.isFollowing ? '#fff' : '#2563eb', color: item.isFollowing ? '#2563eb' : '#fff', borderRadius: 9, padding: '8px 10px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              {t(item.isFollowing ? 'commerce_profile.unfollow_button' : item.isFollowedBy ? 'commerce_profile.follow_back_button' : 'commerce_profile.follow_button')}
            </button>}
          </div>
        ))}
        {loading && <p role="status">{t('common.loading')}</p>}
        {hasMore && !loading && <button type="button" onClick={() => setPage(p => p + 1)} style={{ minHeight: 44, marginTop: 12 }}>{t('profile_connections.more')}</button>}
      </section>
    </div>
  );
}
