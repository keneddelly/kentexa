import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/Navbar';
import { useCart } from '../../context/CartContext';
import api from '../../api/api';

const SellerStore = ({ onNavigate, isLoggedIn, onLogout, userRole, sellerId }) => {
  const { t } = useTranslation();
  const [seller, setSeller] = useState(null);
  const [products, setProducts] = useState([]);
  const [classifieds, setClassifieds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('products');
  const [search, setSearch] = useState('');
  const { addToCart } = useCart();

  useEffect(() => {
    if (sellerId) fetchStoreData();
  }, [sellerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchStoreData = async () => {
    try {
      setLoading(true);
      const [sellerRes, productsRes, classifiedsRes] = await Promise.all([
        api.get(`/seller/public/${sellerId}`),
        api.get(`/products/seller/${sellerId}`),
        api.get(`/classifieds/seller/${sellerId}`).catch(() => ({ data: [] })),
      ]);
      setSeller(sellerRes.data);
      setProducts(productsRes.data);
      setClassifieds(classifiedsRes.data);
    } catch (err) {
      console.error('Failed to load store:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredClassifieds = classifieds.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <Navbar currentPage="Stores" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
        <div style={{ textAlign: 'center', padding: '80px', color: '#64748b' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
          <p>{t('seller_store.loading_store')}</p>
        </div>
      </div>
    );
  }

  if (!seller) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <Navbar currentPage="Stores" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
        <div style={{ textAlign: 'center', padding: '80px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>😕</div>
          <p style={{ color: '#64748b' }}>{t('seller_store.store_not_found')}</p>
          <button onClick={() => onNavigate('Stores')} style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '10px', cursor: 'pointer', marginTop: '16px', fontWeight: '700' }}>
            {t('seller_store.browse_stores')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
      <Navbar currentPage="Stores" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />

      {/* Store Header */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
        padding: '40px 32px',
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <button
            onClick={() => onNavigate('Stores')}
            style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#94a3b8', border: 'none', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', marginBottom: '20px' }}
          >
            {t('seller_store.all_stores')}
          </button>
          <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Store Logo */}
            <div style={{
              width: '90px', height: '90px', borderRadius: '16px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '40px', flexShrink: 0,
              border: '3px solid rgba(255,255,255,0.2)',
              overflow: 'hidden',
            }}>
              {seller.logo ? (
                <img src={seller.logo} alt={seller.businessName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : '🏪'}
            </div>

            {/* Store Info */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '28px', fontWeight: '900', color: '#fff', margin: 0 }}>
                  {seller.businessName}
                </h1>
                <span style={{ backgroundColor: '#dcfce7', color: '#16a34a', fontSize: '12px', fontWeight: '700', padding: '4px 10px', borderRadius: '10px' }}>
                  {t('seller_store.verified_seller')}
                </span>
              </div>
              {seller.businessDescription && (
                <p style={{ fontSize: '15px', color: '#94a3b8', marginBottom: '16px', lineHeight: '1.6' }}>
                  {seller.businessDescription}
                </p>
              )}
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                {seller.address && (
                  <span style={{ fontSize: '13px', color: '#64748b' }}>📍 {seller.address}</span>
                )}
                {seller.phone && (
                  <span style={{ fontSize: '13px', color: '#64748b' }}>📞 {seller.phone}</span>
                )}
              </div>
            </div>

            {/* Store Stats */}
            <div style={{ display: 'flex', gap: '16px' }}>
              {[
                { label: t('seller_store.stat_products'), value: products.length, icon: '📦' },
                { label: t('seller_store.stat_listings'), value: classifieds.length, icon: '📋' },
              ].map(stat => (
                <div key={stat.label} style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px 20px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ fontSize: '22px', marginBottom: '4px' }}>{stat.icon}</div>
                  <div style={{ fontSize: '22px', fontWeight: '900', color: '#fff' }}>{stat.value}</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '32px', maxWidth: '1100px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* Search */}
        <input
          type="text"
          placeholder={t('seller_store.search_placeholder', { name: seller.businessName })}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', marginBottom: '20px', boxSizing: 'border-box', backgroundColor: '#fff', outline: 'none' }}
        />

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '2px solid #e2e8f0' }}>
          {[
            { key: 'products', label: t('seller_store.tab_products', { count: products.length }) },
            { key: 'classifieds', label: t('seller_store.tab_classifieds', { count: classifieds.length }) },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              backgroundColor: 'transparent',
              color: activeTab === tab.key ? '#7c3aed' : '#64748b',
              border: 'none',
              borderBottom: activeTab === tab.key ? '3px solid #7c3aed' : '3px solid transparent',
              padding: '10px 20px', cursor: 'pointer',
              fontSize: '14px', fontWeight: activeTab === tab.key ? '800' : '600',
              marginBottom: '-2px',
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Products Tab */}
        {activeTab === 'products' && (
          <>
            {filteredProducts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', backgroundColor: '#fff', borderRadius: '16px' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📦</div>
                <p style={{ color: '#64748b' }}>{t('seller_store.no_products_found')}</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
                {filteredProducts.map(product => (
                  <div key={product.id} style={{
                    backgroundColor: '#fff', borderRadius: '14px',
                    overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                    border: '1px solid #f1f5f9', transition: 'all 0.2s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)'; }}
                  >
                    <div style={{ height: '180px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {product.images?.[0] ? (
                        <img src={product.images[0]} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : <span style={{ fontSize: '48px' }}>📦</span>}
                    </div>
                    <div style={{ padding: '16px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '6px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#fff' }}>
                        {product.category?.replace(/_/g, ' ')}
                      </span>
                      <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b', margin: '8px 0 4px' }}>
                        {product.name}
                      </h3>
                      <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px', lineHeight: '1.4' }}>
                        {product.description?.substring(0, 60)}...
                      </p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ fontSize: '16px', fontWeight: '800', color: '#7c3aed' }}>
                          TZS {Number(product.price).toLocaleString()}
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '6px', backgroundColor: product.isAvailable ? '#dcfce7' : '#fee2e2', color: product.isAvailable ? '#16a34a' : '#dc2626' }}>
                          {product.isAvailable ? t('seller_store.in_stock') : t('seller_store.out_of_stock')}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => onNavigate(`ProductDetail-${product.id}`)}
                          style={{ flex: 1, backgroundColor: '#ede9fe', color: '#7c3aed', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '700' }}
                        >
                          {t('seller_store.view_button')}
                        </button>
                        <button
                          onClick={() => { if (product.isAvailable) addToCart(product); }}
                          disabled={!product.isAvailable}
                          style={{ flex: 1, background: product.isAvailable ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#e2e8f0', color: product.isAvailable ? '#fff' : '#94a3b8', border: 'none', padding: '8px', borderRadius: '8px', cursor: product.isAvailable ? 'pointer' : 'not-allowed', fontSize: '12px', fontWeight: '700' }}
                        >
                          {t('seller_store.add_button')}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Classifieds Tab */}
        {activeTab === 'classifieds' && (
          <>
            {filteredClassifieds.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', backgroundColor: '#fff', borderRadius: '16px' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
                <p style={{ color: '#64748b' }}>{t('seller_store.no_classifieds_found')}</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                {filteredClassifieds.map(item => (
                  <div key={item.id} onClick={() => onNavigate(`ClassifiedDetail-${item.id}`)} style={{
                    backgroundColor: '#fff', borderRadius: '14px', overflow: 'hidden',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.06)', cursor: 'pointer',
                    border: '1px solid #f1f5f9', transition: 'all 0.2s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
                  >
                    <div style={{ height: '160px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {item.images?.[0] ? (
                        <img src={item.images[0]} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : <span style={{ fontSize: '48px' }}>📋</span>}
                    </div>
                    <div style={{ padding: '14px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '6px', background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: '#fff' }}>
                        {item.category}
                      </span>
                      <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b', margin: '8px 0 4px' }}>{item.title}</h3>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '16px', fontWeight: '800', color: '#7c3aed' }}>TZS {Number(item.price).toLocaleString()}</span>
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>📍 {item.location || t('seller_store.default_location')}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
};

export default SellerStore;