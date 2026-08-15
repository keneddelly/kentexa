import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';
import { useCart } from '../../context/CartContext';

const ListingsPage = ({ onNavigate }) => {
  const { t } = useTranslation();
  const [products, setProducts]       = useState([]);
  const [classifieds, setClassifieds] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [tab, setTab]                 = useState('all');
  const [search, setSearch]           = useState('');
  const [searchInput, setSearchInput] = useState('');
  const { addToCart } = useCart();

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [pRes, cRes] = await Promise.all([
        api.get('/products').catch(() => ({ data: [] })),
        api.get('/classifieds').catch(() => ({ data: [] })),
      ]);
      setProducts(pRes.data || []);
      setClassifieds((cRes.data || []).filter(c => c.status === 'active'));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => setSearch(searchInput.trim().toLowerCase());

  const filteredProducts = products.filter(p =>
    !search ||
    p.name?.toLowerCase().includes(search) ||
    p.category?.toLowerCase().includes(search) ||
    p.description?.toLowerCase().includes(search)
  );

  const filteredClassifieds = classifieds.filter(c =>
    !search ||
    c.title?.toLowerCase().includes(search) ||
    c.category?.toLowerCase().includes(search) ||
    c.location?.toLowerCase().includes(search)
  );

  const totalCount = filteredProducts.length + filteredClassifieds.length;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9', fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <style>{`
        .lp-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 12px; }
        @media (min-width: 480px) { .lp-grid { grid-template-columns: repeat(3,1fr); } }
        @media (min-width: 768px) { .lp-grid { grid-template-columns: repeat(4,1fr); } }
        @media (min-width: 1024px) { .lp-grid { grid-template-columns: repeat(5,1fr); } }
        .lp-card { background:#fff; border-radius:14px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.06); cursor:pointer; border:1px solid #f1f5f9; transition:transform 0.2s; }
        .lp-card:hover { transform:translateY(-3px); box-shadow:0 8px 20px rgba(0,0,0,0.1); }
        .lp-scroll { display:flex; gap:8px; overflow-x:auto; scrollbar-width:none; }
        .lp-scroll::-webkit-scrollbar { display:none; }
      `}</style>

      <BackBar onBack={() => onNavigate('back')} top={0} />

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1e1b4b,#1d4ed8)', padding: '16px 16px 14px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: '#fff', margin: '0 0 12px', fontFamily: 'Manrope,sans-serif' }}>
          {t('listings_page.page_title')}
        </h1>

        {/* Search */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input type="text" placeholder={t('listings_page.search_placeholder')}
            value={searchInput} onChange={e => setSearchInput(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && handleSearch()}
            style={{ flex: 1, padding: '10px 14px', borderRadius: 20, border: 'none', fontSize: 13, outline: 'none', backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff', minWidth: 0 }} />
          <button onClick={handleSearch}
            style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
            {t('listings_page.search_button')}
          </button>
          {search && (
            <button onClick={() => { setSearch(''); setSearchInput(''); }}
              style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', padding: '10px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ backgroundColor: '#fff', borderBottom: '2px solid #f1f5f9', display: 'flex' }}>
        {[
          { key: 'all',         label: t('listings_page.tab_all', { count: totalCount }) },
          { key: 'products',    label: t('listings_page.tab_products', { count: filteredProducts.length }) },
          { key: 'classifieds', label: t('listings_page.tab_ads', { count: filteredClassifieds.length }) },
        ].map(tabItem => (
          <button key={tabItem.key} onClick={() => setTab(tabItem.key)}
            style={{ flex: 1, padding: '12px 8px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: tab === tabItem.key ? '#1d4ed8' : '#64748b', borderBottom: tab === tabItem.key ? '3px solid #1d4ed8' : '3px solid transparent', marginBottom: -2, whiteSpace: 'nowrap' }}>
            {tabItem.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '12px 16px 80px', flex: 1, maxWidth: 1100, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>{t('listings_page.loading')}
          </div>
        ) : totalCount === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', backgroundColor: '#fff', borderRadius: 16 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <p style={{ fontWeight: 700, color: '#1e293b' }}>{t('listings_page.no_results')}</p>
            {search && (
              <button onClick={() => { setSearch(''); setSearchInput(''); }}
                style={{ marginTop: 12, backgroundColor: '#1d4ed8', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                {t('listings_page.clear_search')}
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Products */}
            {(tab === 'all' || tab === 'products') && filteredProducts.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                {tab === 'all' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{t('listings_page.store_products_title')}</span>
                      <span style={{ fontSize: 11, backgroundColor: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>{filteredProducts.length}</span>
                    </div>
                    <span onClick={() => setTab('products')} style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 700, cursor: 'pointer' }}>{t('listings_page.see_all')}</span>
                  </div>
                )}
                <div className="lp-grid">
                  {filteredProducts.map(p => (
                    <div key={p.id} className="lp-card" onClick={() => onNavigate(`ProductDetail-${p.id}`)}>
                      <div style={{ width: '100%', aspectRatio: '1/1', backgroundColor: '#f1f5f9', overflow: 'hidden', position: 'relative' }}>
                        {p.images?.[0]
                          ? <img src={p.images[0]} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>📦</div>
                        }
                        <span style={{ position: 'absolute', top: 6, left: 6, fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 6, backgroundColor: '#1d4ed8', color: '#fff' }}>{t('listings_page.store_badge')}</span>
                        {!p.isAvailable && (
                          <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ color: '#fff', fontSize: 10, fontWeight: 800 }}>{t('listings_page.out_of_stock')}</span>
                          </div>
                        )}
                      </div>
                      <div style={{ padding: '8px 10px' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>{p.name}</div>
                        <div style={{ fontSize: 13, fontWeight: 900, color: '#1d4ed8', marginBottom: 4 }}>TZS {Number(p.displayPrice || p.basePrice || 0).toLocaleString()}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 9, color: '#16a34a', fontWeight: 700 }}>{t('listings_page.free_delivery')}</span>
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

            {/* Classifieds */}
            {(tab === 'all' || tab === 'classifieds') && filteredClassifieds.length > 0 && (
              <div>
                {tab === 'all' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{t('listings_page.classified_ads_title')}</span>
                      <span style={{ fontSize: 11, backgroundColor: '#fce7f3', color: '#db2777', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>{filteredClassifieds.length}</span>
                    </div>
                    <span onClick={() => setTab('classifieds')} style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 700, cursor: 'pointer' }}>{t('listings_page.see_all')}</span>
                  </div>
                )}
                <div className="lp-grid">
                  {filteredClassifieds.map(item => (
                    <div key={item.id} className="lp-card" onClick={() => onNavigate(`ClassifiedDetail-${item.id}`)}>
                      <div style={{ position: 'relative' }}>
                        {item.images?.[0]
                          ? <img src={item.images[0]} alt={item.title} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
                          : <div style={{ width: '100%', aspectRatio: '4/3', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>📋</div>
                        }
                        <span style={{ position: 'absolute', top: 6, left: 6, fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 6, backgroundColor: '#db2777', color: '#fff' }}>{t('listings_page.ad_badge')}</span>
                        {item.isNegotiable && (
                          <span style={{ position: 'absolute', bottom: 6, left: 6, fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 6, backgroundColor: '#fef9c3', color: '#ca8a04' }}>{t('listings_page.negotiable_badge')}</span>
                        )}
                      </div>
                      <div style={{ padding: '8px 10px 12px' }}>
                        <h3 style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', margin: '0 0 3px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4 }}>
                          {item.title}
                        </h3>
                        <div style={{ fontSize: 13, fontWeight: 900, color: '#db2777', marginBottom: 2 }}>
                          TZS {Number(item.price).toLocaleString()}
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8' }}>📍 {item.location || t('listings_page.default_location')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ListingsPage;