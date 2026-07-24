import React, { useEffect, useState, useCallback } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import api from '../../api/api';
import { useTranslation } from 'react-i18next';

const ClassifiedsPublic = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const [classifieds, setClassifieds] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [filter, setFilter]           = useState('all');
  const [search, setSearch]           = useState('');
  const [searchInput, setSearchInput] = useState('');
  const { t } = useTranslation();

  const categories = [
    { key: 'all',          icon: '🔥', label: 'All' },
    { key: 'electronics',  icon: '📱', label: 'Electronics' },
    { key: 'vehicles',     icon: '🚗', label: 'Vehicles' },
    { key: 'property',     icon: '🏢', label: 'Property' },
    { key: 'fashion',      icon: '👗', label: 'Fashion' },
    { key: 'services',     icon: '🔧', label: 'Services' },
    { key: 'home_garden',  icon: '🏠', label: 'Home' },
    { key: 'agriculture',  icon: '🌾', label: 'Agriculture' },
    { key: 'health_beauty',icon: '💄', label: 'Health' },
    { key: 'food',         icon: '🍎', label: 'Food' },
    { key: 'baby_kids',    icon: '🧸', label: 'Kids' },
    { key: 'sports',       icon: '⚽', label: 'Sports' },
    { key: 'security',     icon: '🔒', label: 'Security' },
    { key: 'books',        icon: '📚', label: 'Books' },
    { key: 'other',        icon: '📦', label: 'Other' },
  ];

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
    active:  { backgroundColor: '#dcfce7', color: '#16a34a' },
    sold:    { backgroundColor: '#fee2e2', color: '#dc2626' },
    expired: { backgroundColor: '#fef9c3', color: '#ca8a04' },
  }[status] || { backgroundColor: '#f1f5f9', color: '#64748b' });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <style>{`
        .cl-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 12px; }
        @media (min-width: 480px)  { .cl-grid { grid-template-columns: repeat(3,1fr); } }
        @media (min-width: 700px)  { .cl-grid { grid-template-columns: repeat(4,1fr); } }
        @media (min-width: 1000px) { .cl-grid { grid-template-columns: repeat(5,1fr); } }
        .cl-card { background:#fff; border-radius:14px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.07); border:1px solid #f1f5f9; cursor:pointer; transition:transform 0.2s,box-shadow 0.2s; }
        .cl-card:hover { transform:translateY(-4px); box-shadow:0 10px 24px rgba(37,99,235,0.13); }
        .cl-img { width:100%; aspect-ratio:4/3; object-fit:cover; display:block; }
        .cl-img-ph { width:100%; aspect-ratio:4/3; background:#f1f5f9; display:flex; align-items:center; justify-content:center; font-size:32px; }
        .cl-scroll { display:flex; gap:8px; overflow-x:auto; padding-bottom:4px; scrollbar-width:none; }
        .cl-scroll::-webkit-scrollbar { display:none; }
      `}</style>

      <Navbar currentPage="ClassifiedsPublic" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />

      {/* Header */}
      <div style={{ backgroundColor: '#1e1b4b', padding: '16px 16px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: '#fff', margin: 0, fontFamily: 'Manrope,sans-serif' }}>
            📋 {t('classifieds.title')}
          </h1>
          {isLoggedIn && (
            <button onClick={() => onNavigate('SellerClassifieds')}
              style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
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
            style={{ flex: 1, padding: '10px 14px', borderRadius: 20, border: 'none', fontSize: 13, outline: 'none', backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff', minWidth: 0 }}
          />
          <button onClick={handleSearch}
            style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
            Search
          </button>
          {(search || filter !== 'all') && (
            <button onClick={() => { setSearch(''); setSearchInput(''); setFilter('all'); }}
              style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', padding: '10px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
              ✕ Clear
            </button>
          )}
        </div>

        {/* Category chips */}
        <div className="cl-scroll">
          {categories.map(cat => (
            <button key={cat.key} onClick={() => handleCategoryClick(cat.key)}
              style={{ padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, backgroundColor: filter === cat.key ? '#2563eb' : 'rgba(255,255,255,0.12)', color: '#fff', flexShrink: 0, whiteSpace: 'nowrap' }}>
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active filters */}
      {(search || filter !== 'all') && (
        <div style={{ padding: '8px 16px', backgroundColor: '#eff6ff', borderBottom: '1px solid #bfdbfe', fontSize: 12, color: '#1d4ed8', fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          🔍 Showing:
          {filter !== 'all' && <span style={{ backgroundColor: '#1d4ed8', color: '#fff', padding: '2px 8px', borderRadius: 10 }}>{categories.find(c => c.key === filter)?.icon} {filter}</span>}
          {search && <span style={{ backgroundColor: '#1d4ed8', color: '#fff', padding: '2px 8px', borderRadius: 10 }}>"{search}"</span>}
          <span style={{ color: '#64748b' }}>· {filtered.length} results</span>
        </div>
      )}

      {/* Count */}
      {!search && filter === 'all' && (
        <div style={{ padding: '8px 16px', fontSize: 12, color: '#64748b', fontWeight: 600 }}>
          {filtered.length} {t('classifieds.found')}
        </div>
      )}

      {/* Grid */}
      <div style={{ padding: '8px 16px 20px', flex: 1 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', backgroundColor: '#fff', borderRadius: 16, color: '#94a3b8' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
            <p style={{ fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>No listings found</p>
            <p style={{ fontSize: 13 }}>
              {search ? `No results for "${search}"` : 'No listings in this category yet'}
            </p>
            {(search || filter !== 'all') && (
              <button onClick={() => { setSearch(''); setSearchInput(''); setFilter('all'); }}
                style={{ marginTop: 12, backgroundColor: '#1d4ed8', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
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
                  <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(255,255,255,0.92)', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🤍</div>
                  <span style={{ position: 'absolute', bottom: 8, left: 8, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, ...statusColor(item.status) }}>
                    {item.status?.toUpperCase()}
                  </span>
                </div>
                <div style={{ padding: '10px 10px 12px' }}>
                  <span style={{ fontSize: 10, backgroundColor: '#ede9fe', color: '#2563eb', padding: '2px 7px', borderRadius: 8, fontWeight: 700 }}>
                    📋 {item.category?.replace(/_/g,' ')}
                  </span>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '6px 0 4px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4 }}>
                    {item.title}
                  </h3>
                  <div style={{ fontSize: 14, fontWeight: 900, color: '#2563eb', marginBottom: 2 }}>
                    TZS {Number(item.price).toLocaleString()}
                  </div>
                  {item.isNegotiable && <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Negotiable · </span>}
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>📍 {item.location || 'Tanzania'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default ClassifiedsPublic;