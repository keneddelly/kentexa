import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/Navbar';
import BackBar from '../components/BackBar';
import api from '../../api/api';
import { useCart } from '../../context/CartContext';

const getCategories = (t) => ({
  electronics:   { icon: '📱', label: t('category_page.cat_electronics'),    color: '#1d4ed8', bg: '#ede9fe' },
  vehicles:      { icon: '🚗', label: t('category_page.cat_vehicles'),       color: '#ea580c', bg: '#ffedd5' },
  property:      { icon: '🏢', label: t('category_page.cat_property'),      color: '#16a34a', bg: '#dcfce7' },
  fashion:       { icon: '👗', label: t('category_page.cat_fashion'),        color: '#db2777', bg: '#fce7f3' },
  services:      { icon: '🔧', label: t('category_page.cat_services'),      color: '#ca8a04', bg: '#fef9c3' },
  home_garden:   { icon: '🏠', label: t('category_page.cat_home_garden'),   color: '#0891b2', bg: '#cffafe' },
  health_beauty: { icon: '💄', label: t('category_page.cat_health_beauty'), color: '#9333ea', bg: '#f3e8ff' },
  food:          { icon: '🍎', label: t('category_page.cat_food'),          color: '#16a34a', bg: '#dcfce7' },
  baby_kids:     { icon: '🧸', label: t('category_page.cat_baby_kids'),     color: '#f59e0b', bg: '#fef9c3' },
  sports:        { icon: '⚽', label: t('category_page.cat_sports'),        color: '#2563eb', bg: '#dbeafe' },
  agriculture:   { icon: '🌾', label: t('category_page.cat_agriculture'),   color: '#65a30d', bg: '#ecfccb' },
  security:      { icon: '🔒', label: t('category_page.cat_security'),      color: '#1d4ed8', bg: '#dbeafe' },
  books:         { icon: '📚', label: t('category_page.cat_books'),         color: '#7c3aed', bg: '#ede9fe' },
  arts:          { icon: '🎨', label: t('category_page.cat_arts'),          color: '#e11d48', bg: '#ffe4e6' },
  general:       { icon: '📦', label: t('category_page.cat_general'),       color: '#64748b', bg: '#f1f5f9' },
});

const CategoryPage = ({ onNavigate, isLoggedIn, onLogout, userRole, category }) => {
  const { t } = useTranslation();
  const [products, setProducts]     = useState([]);
  const [classifieds, setClassifieds] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState('all'); // 'all' | 'products' | 'classifieds'
  const [search, setSearch]         = useState('');
  const { addToCart } = useCart();

  const CATEGORIES = getCategories(t);
  const cat = CATEGORIES[category] || { icon: '📦', label: category?.replace(/_/g,' ') || t('category_page.cat_fallback'), color: '#1d4ed8', bg: '#ede9fe' };

  useEffect(() => {
    if (category) fetchAll();
  }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [pRes, cRes] = await Promise.all([
        api.get(`/products?category=${category}`).catch(() => ({ data: [] })),
        api.get(`/classifieds?category=${category}`).catch(() => ({ data: [] })),
      ]);
      setProducts(pRes.data || []);
      setClassifieds((cRes.data || []).filter(c => c.status === 'active'));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(p =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase())
  );
  const filteredClassifieds = classifieds.filter(c =>
    !search || c.title?.toLowerCase().includes(search.toLowerCase()) ||
    c.description?.toLowerCase().includes(search.toLowerCase())
  );

  const totalCount = filteredProducts.length + filteredClassifieds.length;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9', fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <style>{`
        .cp-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 12px; }
        @media (min-width: 480px) { .cp-grid { grid-template-columns: repeat(3,1fr); } }
        @media (min-width: 768px) { .cp-grid { grid-template-columns: repeat(4,1fr); } }
        .cp-card { background:#fff; border-radius:14px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.06); cursor:pointer; border:1px solid #f1f5f9; transition:transform 0.2s; }
        .cp-card:hover { transform:translateY(-3px); box-shadow:0 8px 20px rgba(0,0,0,0.1); }
      `}</style>

      <Navbar currentPage="CategoryPage" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => onNavigate('Home')} title={`${cat.icon} ${cat.label}`} />

      {/* Category Hero */}
      <div style={{ backgroundColor: cat.color, padding: '20px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>
            {cat.icon}
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: '#fff', margin: 0, fontFamily: 'Manrope,sans-serif' }}>{cat.label}</h1>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', margin: 0 }}>
              {loading ? t('category_page.loading') : t('category_page.listings_count', { count: totalCount })}
            </p>
          </div>
        </div>

        {/* Search */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="text" placeholder={t('category_page.search_placeholder', { label: cat.label })}
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, padding: '10px 14px', borderRadius: 20, border: 'none', fontSize: 13, outline: 'none', backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff', minWidth: 0 }} />
          {search && (
            <button onClick={() => setSearch('')}
              style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', padding: '10px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>✕</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ backgroundColor: '#fff', borderBottom: '2px solid #f1f5f9', display: 'flex', overflowX: 'auto' }}>
        {[
          { key: 'all',         label: t('category_page.tab_all', { count: filteredProducts.length + filteredClassifieds.length }) },
          { key: 'products',    label: t('category_page.tab_products', { count: filteredProducts.length }) },
          { key: 'classifieds', label: t('category_page.tab_classifieds', { count: filteredClassifieds.length }) },
        ].map(tabItem => (
          <button key={tabItem.key} onClick={() => setTab(tabItem.key)}
            style={{ flexShrink: 0, padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: tab === tabItem.key ? cat.color : '#64748b', borderBottom: tab === tabItem.key ? `3px solid ${cat.color}` : '3px solid transparent', marginBottom: -2, whiteSpace: 'nowrap' }}>
            {tabItem.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '12px 16px 24px', flex: 1 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>{t('category_page.loading_category', { label: cat.label })}
          </div>
        ) : totalCount === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', backgroundColor: '#fff', borderRadius: 16 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{cat.icon}</div>
            <p style={{ fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>{t('category_page.no_listings', { label: cat.label })}</p>
            <p style={{ fontSize: 13, color: '#94a3b8' }}>{t('category_page.check_back')}</p>
            <button onClick={() => onNavigate('Home')}
              style={{ marginTop: 16, backgroundColor: cat.color, color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              {t('category_page.back_to_home')}
            </button>
          </div>
        ) : (
          <div>
            {/* ── PRODUCTS SECTION ── */}
            {(tab === 'all' || tab === 'products') && filteredProducts.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                {tab === 'all' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{t('category_page.store_products_title')}</span>
                      <span style={{ fontSize: 11, backgroundColor: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>{filteredProducts.length}</span>
                    </div>
                    <span onClick={() => setTab('products')} style={{ fontSize: 12, color: cat.color, fontWeight: 700, cursor: 'pointer' }}>{t('category_page.see_all')}</span>
                  </div>
                )}
                <div className="cp-grid">
                  {filteredProducts.map(p => (
                    <div key={p.id} className="cp-card" onClick={() => onNavigate(`ProductDetail-${p.id}`)}>
                      <div style={{ width: '100%', paddingTop: '100%', backgroundColor: '#f1f5f9', overflow: 'hidden', position: 'relative' }}>
                        <div style={{ position: 'absolute', inset: 0 }}>
                          {p.images?.[0]
                            ? <img src={p.images[0]} alt={p.name} onError={e => { e.target.style.display = 'none'; }} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>📦</div>
                          }
                          {/* Product badge */}
                          <span style={{ position: 'absolute', top: 7, left: 7, fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 8, backgroundColor: '#1d4ed8', color: '#fff' }}>{t('category_page.store_badge')}</span>
                          {!p.isAvailable && (
                            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ color: '#fff', fontSize: 11, fontWeight: 800 }}>{t('category_page.out_of_stock')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ padding: '8px 10px' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>{p.name}</div>
                        <div style={{ fontSize: 13, fontWeight: 900, color: '#1d4ed8', marginBottom: 4 }}>TZS {Number(p.displayPrice || p.basePrice || 0).toLocaleString()}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 9, color: '#16a34a', fontWeight: 700 }}>{t('category_page.free_delivery')}</span>
                          <button onClick={e => { e.stopPropagation(); if (p.isAvailable) addToCart(p); }}
                            disabled={!p.isAvailable}
                            style={{ background: p.isAvailable ? 'linear-gradient(135deg,#1d4ed8,#2563eb)' : '#e2e8f0', color: p.isAvailable ? '#fff' : '#94a3b8', border: 'none', padding: '3px 8px', borderRadius: 6, cursor: p.isAvailable ? 'pointer' : 'not-allowed', fontSize: 10, fontWeight: 700 }}>
                            🛒
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── CLASSIFIEDS SECTION ── */}
            {(tab === 'all' || tab === 'classifieds') && filteredClassifieds.length > 0 && (
              <div>
                {tab === 'all' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{t('category_page.classified_ads_title')}</span>
                      <span style={{ fontSize: 11, backgroundColor: '#fce7f3', color: '#db2777', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>{filteredClassifieds.length}</span>
                    </div>
                    <span onClick={() => setTab('classifieds')} style={{ fontSize: 12, color: cat.color, fontWeight: 700, cursor: 'pointer' }}>{t('category_page.see_all')}</span>
                  </div>
                )}
                <div className="cp-grid">
                  {filteredClassifieds.map(item => (
                    <div key={item.id} className="cp-card" onClick={() => onNavigate(`ClassifiedDetail-${item.id}`)}>
                      <div style={{ position: 'relative' }}>
                        {item.images?.[0]
                          ? <img src={item.images[0]} alt={item.title} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
                          : <div style={{ width: '100%', aspectRatio: '4/3', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>📋</div>
                        }
                        {/* Classified badge */}
                        <span style={{ position: 'absolute', top: 7, left: 7, fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 8, backgroundColor: '#db2777', color: '#fff' }}>{t('category_page.ad_badge')}</span>
                        {item.isNegotiable && (
                          <span style={{ position: 'absolute', bottom: 7, left: 7, fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 8, backgroundColor: '#fef9c3', color: '#ca8a04' }}>{t('category_page.negotiable_badge')}</span>
                        )}
                      </div>
                      <div style={{ padding: '8px 10px 12px' }}>
                        <h3 style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', margin: '0 0 4px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4 }}>
                          {item.title}
                        </h3>
                        <div style={{ fontSize: 13, fontWeight: 900, color: '#db2777', marginBottom: 2 }}>
                          TZS {Number(item.price).toLocaleString()}
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8' }}>📍 {item.location || t('category_page.default_location')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
};

export default CategoryPage;