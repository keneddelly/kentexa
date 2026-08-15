import React, { useEffect, useState, useCallback } from 'react';
import WishlistHeart from '../components/WishlistHeart';
import api from '../../api/api';
import { useTranslation } from 'react-i18next';

const B  = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';

const ClassifiedsPublic = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const [classifieds, setClassifieds] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [filter, setFilter]           = useState('all');
  const [search, setSearch]           = useState('');
  const [searchInput, setSearchInput] = useState('');
  const { t } = useTranslation();

  // Fetched from GET /categories — this list used to be hardcoded here with
  // its own key set, including an 'other' filter chip that never matched
  // anything (the real backend category was 'general'), silently filtering
  // to zero results whenever clicked.
  const [categories, setCategories] = useState([{ key: 'all', icon: '🔥', label: 'All' }]);
  useEffect(() => {
    api.get('/categories').then(res => {
      setCategories([
        { key: 'all', icon: '🔥', label: 'All' },
        ...(res.data || []).map(c => ({ key: c.key, icon: c.icon, label: c.label })),
      ]);
    }).catch(() => {});
  }, []);

  const fetchClassifieds = useCallback(async () => {
    try {
      setLoading(true);
      // Always fetch all, filter client-side for instant search
      const res = await api.get('/classifieds');
      setClassifieds(res.data || []);
    } catch (err) {
      console.error(err);
      setClassifieds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchClassifieds(); }, [fetchClassifieds]);

  const handleSearch = () => setSearch(searchInput.trim().toLowerCase());
  const handleCategoryClick = (key) => { setFilter(key); setSearch(''); setSearchInput(''); };

  // Filter: category + search across title, description, location
  const filtered = classifieds.filter(c => {
    const matchCat    = filter === 'all' || c.category === filter;
    const matchSearch = !search || (
      c.title?.toLowerCase().includes(search) ||
      c.description?.toLowerCase().includes(search) ||
      c.location?.toLowerCase().includes(search) ||
      c.category?.toLowerCase().includes(search)
    );
    return matchCat && matchSearch && c.status === 'active';
  });

  const statusColor = (status) => ({
    active:  { backgroundColor: '#DCFCE7', color: '#16A34A' },
    sold:    { backgroundColor: '#FEE2E2', color: '#DC2626' },
    expired: { backgroundColor: '#FEF9C3', color: '#CA8A04' },
  }[status] || { backgroundColor: '#F1F5F9', color: GR });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#F1F5F9',
      paddingBottom: 90, fontFamily: 'Manrope,Inter,-apple-system,sans-serif' }}>
      <style>{`
        .cl-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 12px; }
        @media (min-width: 480px)  { .cl-grid { grid-template-columns: repeat(3,1fr); } }
        @media (min-width: 700px)  { .cl-grid { grid-template-columns: repeat(4,1fr); } }
        @media (min-width: 1000px) { .cl-grid { grid-template-columns: repeat(5,1fr); } }
        .cl-card { background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.07); border:1px solid #f1f5f9; cursor:pointer; transition:transform 0.2s,box-shadow 0.2s; }
        .cl-card:hover { transform:translateY(-4px); box-shadow:0 10px 24px rgba(37,99,235,0.15); }
        .cl-img { width:100%; aspect-ratio:4/3; object-fit:cover; display:block; }
        .cl-img-ph { width:100%; aspect-ratio:4/3; background:#f1f5f9; display:flex; align-items:center; justify-content:center; font-size:32px; }
        .cl-scroll { display:flex; gap:8px; overflow-x:auto; padding-bottom:4px; scrollbar-width:none; }
        .cl-scroll::-webkit-scrollbar { display:none; }
      `}</style>

      {/* ── Sticky top bar ── */}
      <div style={{ backgroundColor: WH, borderBottom: '1px solid #F1F5F9', padding: '14px 16px',
        position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', gap: 10,
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <button onClick={() => onNavigate('Home')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={DK} strokeWidth="2.5">
            <polyline points="15,18 9,12 15,6" />
          </svg>
        </button>
        <span style={{ fontSize: 15, fontWeight: 800, color: DK }}>
          📋 {t('classifieds.title')}
        </span>
      </div>

      {/* Explore header */}
      <div style={{ background: `linear-gradient(135deg,#1E1B4B,${B})`, padding: '16px 16px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          {isLoggedIn && (
            <button onClick={() => onNavigate('SellerClassifieds')}
              style={{ backgroundColor: WH, color: B, border: 'none', padding: '8px 16px', borderRadius: 20,
                cursor: 'pointer', fontSize: 12, fontWeight: 800, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
              + Post Ad
            </button>
          )}
        </div>

        {/* Search bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Search classifieds..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && handleSearch()}
            style={{ flex: 1, padding: '10px 14px', borderRadius: 20, border: 'none', fontSize: 13, outline: 'none', backgroundColor: 'rgba(255,255,255,0.15)', color: WH, minWidth: 0 }}
          />
          <button onClick={handleSearch}
            style={{ backgroundColor: WH, color: B, border: 'none', padding: '10px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
            Search
          </button>
          {(search || filter !== 'all') && (
            <button onClick={() => { setSearch(''); setSearchInput(''); setFilter('all'); }}
              style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: WH, border: 'none', padding: '10px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
              ✕ Clear
            </button>
          )}
        </div>

        {/* Category chips */}
        <div className="cl-scroll">
          {categories.map(cat => (
            <button key={cat.key} onClick={() => handleCategoryClick(cat.key)}
              style={{ padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, backgroundColor: filter === cat.key ? WH : 'rgba(255,255,255,0.14)', color: filter === cat.key ? B : WH, flexShrink: 0, whiteSpace: 'nowrap' }}>
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active filters */}
      {(search || filter !== 'all') && (
        <div style={{ padding: '8px 16px', backgroundColor: '#EFF6FF', borderBottom: '1px solid #BFDBFE', fontSize: 12, color: '#1D4ED8', fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          🔍 Showing:
          {filter !== 'all' && <span style={{ backgroundColor: B, color: WH, padding: '2px 8px', borderRadius: 10 }}>{categories.find(c => c.key === filter)?.icon} {filter}</span>}
          {search && <span style={{ backgroundColor: B, color: WH, padding: '2px 8px', borderRadius: 10 }}>"{search}"</span>}
          <span style={{ color: GR }}>· {filtered.length} results</span>
        </div>
      )}

      {/* Count */}
      {!search && filter === 'all' && (
        <div style={{ padding: '8px 16px', fontSize: 12, color: GR, fontWeight: 600 }}>
          {filtered.length} {t('classifieds.found')}
        </div>
      )}

      {/* Grid */}
      <div style={{ padding: '8px 16px 20px', flex: 1 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: GR }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', backgroundColor: WH, borderRadius: 16, color: '#94A3B8' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
            <p style={{ fontWeight: 700, color: DK, marginBottom: 6 }}>No listings found</p>
            <p style={{ fontSize: 13 }}>
              {search ? `No results for "${search}"` : 'No listings in this category yet'}
            </p>
            {(search || filter !== 'all') && (
              <button onClick={() => { setSearch(''); setSearchInput(''); setFilter('all'); }}
                style={{ marginTop: 12, backgroundColor: B, color: WH, border: 'none', padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                Show All Listings
              </button>
            )}
          </div>
        ) : (
          <div className="cl-grid">
            {filtered.map(item => (
              <div key={item.id} className="cl-card" onClick={() => onNavigate(`ClassifiedDetail-${item.id}`)}>
                <div style={{ position: 'relative' }}>
                  {item.images?.[0]
                    ? <img src={item.images[0]} alt={item.title} className="cl-img" onError={e => { e.target.style.display='none'; }} />
                    : <div className="cl-img-ph">📋</div>
                  }
                  <WishlistHeart classifiedId={item.id} isLoggedIn={isLoggedIn} onNavigate={onNavigate}
                    size={16} style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(255,255,255,0.92)',
                      borderRadius: '50%', width: 28, height: 28 }} />
                  <span style={{ position: 'absolute', bottom: 8, left: 8, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, ...statusColor(item.status) }}>
                    {item.status?.toUpperCase()}
                  </span>
                </div>
                <div style={{ padding: '10px 10px 12px' }}>
                  <span style={{ fontSize: 10, backgroundColor: '#EFF6FF', color: B, padding: '2px 7px', borderRadius: 8, fontWeight: 700 }}>
                    {categories.find(c => c.key === item.category)?.icon || '📋'} {item.category?.replace(/_/g,' ')}
                  </span>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: DK, margin: '6px 0 4px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4 }}>
                    {item.title}
                  </h3>
                  <div style={{ fontSize: 14, fontWeight: 900, color: B, marginBottom: 2 }}>
                    TZS {Number(item.price).toLocaleString()}
                  </div>
                  {item.isNegotiable && <span style={{ fontSize: 10, color: GR, fontWeight: 600 }}>Negotiable · </span>}
                  <span style={{ fontSize: 10, color: '#94A3B8' }}>📍 {item.location || 'Tanzania'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClassifiedsPublic;
