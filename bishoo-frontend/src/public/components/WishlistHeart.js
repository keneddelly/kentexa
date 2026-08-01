/**
 * WishlistHeart.js — Heart toggle button for any saveable thing
 * Place at: src/public/components/WishlistHeart.js
 *
 * Usage (classified — original, still works unchanged):
 *   <WishlistHeart classifiedId={item.id} isLoggedIn={isLoggedIn} onNavigate={onNavigate} />
 *
 * Usage (any other type):
 *   <WishlistHeart entityType="product" entityId={item.id} isLoggedIn={isLoggedIn} onNavigate={onNavigate} />
 *
 * Routes through the same unified save system (PostEngagement, type=SAVE)
 * used everywhere else in the app — Wishlist.js reads from that same
 * system, so anything saved here now actually shows up there. The old
 * /wishlist/toggle endpoint was a separate, classified-only table that
 * never fed into the unified saved-items list.
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';

const WishlistHeart = ({
  classifiedId,       // backward-compat shorthand for entityType="classified"
  entityType,
  entityId,
  isLoggedIn,
  onNavigate,
  size = 28,
  style = {},
}) => {
  const { t } = useTranslation();
  const type = entityType || (classifiedId != null ? 'classified' : null);
  const id   = entityId ?? classifiedId;

  const [saved,   setSaved]   = useState(false);
  const [loading, setLoading] = useState(false);

  const PREFIX = { classified: 'cls', product: 'prd', service: 'svc' };

  // Check if already saved
  useEffect(() => {
    if (!isLoggedIn || !type || id == null) return;
    api.get('/feed/saved/ids')
      .then(r => {
        const ids = r.data || [];
        const prefixed = `${PREFIX[type] || type}-${id}`;
        setSaved(ids.includes(prefixed) || ids.includes(Number(id)));
      })
      .catch(() => {});
  }, [type, id, isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = async (e) => {
    e.stopPropagation();
    e.preventDefault();

    if (!isLoggedIn) {
      onNavigate('PublicLogin');
      return;
    }
    if (!type || id == null) return;

    try {
      setLoading(true);
      const res = await api.post('/engagements', { entityType: type, entityId: id, type: 'save' });
      setSaved(!!res.data.toggled);
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      title={saved ? t('wishlist_heart.remove_saved') : t('wishlist_heart.save')}
      style={{
        background: 'none',
        border: 'none',
        cursor: loading ? 'wait' : 'pointer',
        padding: 4,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        transition: 'transform 0.15s',
        ...style,
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.2)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5
             2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09
             C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5
             c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          fill={saved ? '#ef4444' : 'none'}
          stroke={saved ? '#ef4444' : '#94a3b8'}
          strokeWidth="2"
        />
      </svg>
    </button>
  );
};

export default WishlistHeart;