import React, { useEffect, useState } from 'react';
import api from '../../api/api';

/**
 * "Wafuate" in the home feed (owner 2026-10-26): businesses, offices, transport,
 * service providers and people to follow. Always shown inside the feed (not only
 * when nobody posted a Moment). The server leaves out the viewer's own profiles and
 * the ones they already follow; KenteXa first, then their town, verified, popular.
 */
const KIND = { business: 'Biashara', hub: 'Ofisi ya usafirishaji', transport_provider: 'Usafiri', service_provider: 'Huduma',
  agent: 'Wakala', personal: 'Mtu' };
const INK = '#0f1419';
const MUTED = '#536471';

export default function WhoToFollow({ isLoggedIn, onNavigate, city, limit = 3 }) {
  const [list, setList] = useState(null);
  const [following, setFollowing] = useState({});
  useEffect(() => {
    api.get('/profiles/suggestions', { params: { limit, ...(city ? { city } : {}) } })
      .then((r) => setList(Array.isArray(r.data) ? r.data : []))
      .catch(() => setList([]));
  }, [city, limit]);
  if (!list || list.length === 0) return null;

  const follow = async (p) => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    try {
      const res = await api.post(`/profiles/${p.id}/follow`);
      setFollowing((f) => ({ ...f, [p.id]: res.data?.following ?? !f[p.id] }));
    } catch { /* stays as it was */ }
  };

  return (
    <section aria-label="Wafuate" data-testid="who-to-follow"
      style={{ padding: '14px 16px', borderBottom: '1px solid #eff3f4', background: '#ffffff', color: INK }}>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Wafuate</div>
      {list.map((p) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
          <button type="button" onClick={() => onNavigate(`CommerceProfile-${p.ownerId}`, { commerceProfileId: p.id })} aria-label={p.displayName}
            style={{ width: 44, height: 44, borderRadius: p.type === 'personal' ? 22 : 12, overflow: 'hidden', flexShrink: 0, border: 'none', padding: 0,
              background: INK, color: '#ffffff', fontWeight: 800, fontSize: 17, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {p.photoUrl ? <img src={p.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (p.displayName || 'K').charAt(0).toUpperCase()}
          </button>
          <button type="button" onClick={() => onNavigate(`CommerceProfile-${p.ownerId}`, { commerceProfileId: p.id })}
            style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', color: INK }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 15, fontWeight: 700 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.displayName}</span>
              {p.isVerified && (
                <svg width="15" height="15" viewBox="0 0 24 24" role="img" aria-label="Imethibitishwa" style={{ flexShrink: 0 }}>
                  <path fill="#1d4ed8" d="M12 1l2.6 2.1 3.3-.4 1.1 3.2 3 1.6-.9 3.2.9 3.2-3 1.6-1.1 3.2-3.3-.4L12 23l-2.6-2.1-3.3.4-1.1-3.2-3-1.6.9-3.2-.9-3.2 3-1.6 1.1-3.2 3.3.4z" />
                  <path d="M7.5 12.2l3 3 6-6" fill="none" stroke="#ffffff" strokeWidth="2.2" />
                </svg>
              )}
            </span>
            <span style={{ display: 'block', fontSize: 13, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {[p.category || KIND[p.type], p.location].filter(Boolean).join(' · ')}
            </span>
          </button>
          <button type="button" onClick={() => follow(p)} aria-pressed={!!following[p.id]}
            style={{ height: 36, padding: '0 16px', borderRadius: 18, flexShrink: 0, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              border: following[p.id] ? '1px solid #cfd9de' : 'none', background: following[p.id] ? '#ffffff' : INK, color: following[p.id] ? INK : '#ffffff' }}>
            {following[p.id] ? 'Unafuata' : 'Fuata'}
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onNavigate('Stores')}
        style={{ background: 'none', border: 'none', padding: '4px 0 0', color: '#1d9bf0', fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>
        Ona zaidi
      </button>
    </section>
  );
}
