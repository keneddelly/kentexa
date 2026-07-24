/**
 * WishlistHeart.js — Heart toggle button for any listing
 * Place at: src/public/components/WishlistHeart.js
 *
 * Usage:
 *   import WishlistHeart from '../components/WishlistHeart';
 *   <WishlistHeart classifiedId={item.id} isLoggedIn={isLoggedIn} onNavigate={onNavigate} />
 *
 * Add to any card or detail page. Handles its own state.
 */
import React, { useState, useEffect } from 'react';
import api from '../../api/api';

const WishlistHeart = ({
  classifiedId,
  isLoggedIn,
  onNavigate,
  size = 28,
  style = {},
}) => {
  const [saved,   setSaved]   = useState(false);
  const [loading, setLoading] = useState(false);

  // Check if already saved
  useEffect(() => {
    if (!isLoggedIn || !classifiedId) return;
    // Use cached wishlist IDs from localStorage if available
    try {
      const cached = JSON.parse(localStorage.getItem('kentexa_wishlist_ids') || '[]');
      if (cached.includes(Number(classifiedId))) { setSaved(true); return; }
    } catch {}
    // Fetch from API
    api.get('/wishlist/ids')
      .then(r => {
        const ids = r.data || [];
        localStorage.setItem('kentexa_wishlist_ids', JSON.stringify(ids));
        setSaved(ids.includes(Number(classifiedId)));
      })
      .catch(() => {});
  }, [classifiedId, isLoggedIn]);

  const handleToggle = async (e) => {
    e.stopPropagation();
    e.preventDefault();

    if (!isLoggedIn) {
      onNavigate('PublicLogin');
      return;
    }

    try {
      setLoading(true);
      const res = await api.post(`/wishlist/toggle/${classifiedId}`);
      const nowSaved = res.data.saved;
      setSaved(nowSaved);

      // Update localStorage cache
      try {
        const cached = JSON.parse(localStorage.getItem('kentexa_wishlist_ids') || '[]');
        const updated = nowSaved
          ? [...cached, Number(classifiedId)]
          : cached.filter(id => id !== Number(classifiedId));
        localStorage.setItem('kentexa_wishlist_ids', JSON.stringify(updated));
      } catch {}
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
      title={saved ? 'Ondoa kwenye orodha' : 'Hifadhi'}
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