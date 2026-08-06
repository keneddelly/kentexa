import React, { useEffect, useState } from 'react';
import api from '../../api/api';

const Products = ({ activePage, onNavigate, onLogout }) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [message, setMessage]   = useState('');
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState('all'); // all | active | disabled

  useEffect(() => { fetchProducts(); }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await api.get('/products');
      setProducts(res.data);
    } catch (err) {
      setError('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this product permanently? This cannot be undone.')) return;
    try {
      await api.delete(`/products/${id}`);
      setMessage('Product deleted successfully');
      fetchProducts();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to delete product');
    }
  };

  const handleToggleAvailability = async (product) => {
    try {
      await api.patch(`/products/${product.id}`, { isAvailable: !product.isAvailable });
      setMessage(`Product ${!product.isAvailable ? 'enabled' : 'disabled'}`);
      fetchProducts();
    } catch (err) {
      setError('Failed to update product');
    }
  };

  const handleApprove = async (product) => {
    try {
      await api.patch(`/products/${product.id}`, { isApproved: true, isAvailable: true });
      setMessage('Product approved and is now live');
      fetchProducts();
    } catch (err) {
      setError('Failed to approve product');
    }
  };

  const handleReject = async (product) => {
    const reason = window.prompt('Reason for rejection (sent to seller, optional):');
    try {
      await api.patch(`/products/${product.id}`, { isApproved: false, isAvailable: false, rejectionReason: reason || null });
      setMessage('Product rejected');
      fetchProducts();
    } catch (err) {
      setError('Failed to reject product');
    }
  };

  // ── Price display helper — handles old `price` field and new basePrice/displayPrice ──
  const getPrice = (p) => {
    const val = p.displayPrice ?? p.basePrice ?? p.price;
    return val != null && !isNaN(Number(val)) ? Number(val) : null;
  };

  const filtered = products.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.name?.toLowerCase().includes(q) || p.seller?.name?.toLowerCase().includes(q) || p.seller?.phone?.includes(q);
    const matchFilter =
      filter === 'all'      ? true :
      filter === 'pending'  ? p.isApproved === false :
      filter === 'active'   ? p.isAvailable :
      filter === 'disabled' ? !p.isAvailable : true;
    return matchSearch && matchFilter;
  });

  const pendingCount = products.filter(p => p.isApproved === false).length;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => onNavigate('Dashboard')} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#64748b' }}>←</button>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>Products</div>
      </div>
      <main style={{ padding: '32px' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '900', color: '#0f172a', margin: 0, fontFamily: 'Manrope,sans-serif' }}>📦 Products</h1>
            <p style={{ color: '#64748b', marginTop: '4px', fontSize: '14px' }}>{products.length} total · {pendingCount} pending approval</p>
          </div>
          <button onClick={fetchProducts} style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '700' }}>
            🔄 Refresh
          </button>
        </div>

        {message && <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>✅ {message} <button onClick={() => setMessage('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontWeight: 'bold' }}>×</button></div>}
        {error   && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>❌ {error} <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 'bold' }}>×</button></div>}

        {/* Search + filter */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <input type="text" placeholder="🔍 Search product or seller..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none' }} />
          {[
            { key: 'all',      label: `All (${products.length})` },
            { key: 'pending',  label: `⏳ Pending (${pendingCount})` },
            { key: 'active',   label: '✅ Active' },
            { key: 'disabled', label: '⏸ Disabled' },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              style={{ padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, backgroundColor: filter === f.key ? '#1d4ed8' : '#fff', color: filter === f.key ? '#fff' : '#64748b', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              {f.label}
            </button>
          ))}
        </div>

        {loading && <p style={{ color: '#64748b' }}>Loading products...</p>}

        {!loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
            {filtered.length === 0 ? (
              <p style={{ color: '#94a3b8' }}>No products found.</p>
            ) : (
              filtered.map((p) => {
                const price = getPrice(p);
                const isPending = p.isApproved === false;
                return (
                  <div key={p.id} style={{
                    backgroundColor: '#fff', borderRadius: '12px', overflow: 'hidden',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                    border: isPending ? '2px solid #fbbf24' : '1px solid #f1f5f9',
                  }}>
                    {/* Image */}
                    <div style={{ height: '160px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                      {p.images?.[0] ? (
                        <img src={p.images[0]} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                      ) : <span style={{ fontSize: '40px' }}>📦</span>}
                      {p.images?.length > 1 && (
                        <span style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', padding: '2px 8px', borderRadius: 10, fontSize: 11 }}>
                          +{p.images.length - 1} more
                        </span>
                      )}
                      {isPending && (
                        <span style={{ position: 'absolute', top: 8, left: 8, backgroundColor: '#fbbf24', color: '#92400e', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800 }}>
                          ⏳ PENDING REVIEW
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div style={{ padding: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0, flex: 1 }}>{p.name}</h3>
                        <span style={{ padding: '3px 8px', borderRadius: 12, backgroundColor: '#ede9fe', color: '#6366f1', fontSize: 11, fontWeight: 600, flexShrink: 0, marginLeft: 6 }}>
                          {p.category?.replace(/_/g, ' ')}
                        </span>
                      </div>

                      {/* Seller info — who posted it */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, padding: '6px 10px', backgroundColor: '#f8fafc', borderRadius: 8 }}>
                        <span style={{ fontSize: 12 }}>👤</span>
                        <span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>{p.seller?.name || p.seller?.businessName || '—'}</span>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>· {p.seller?.phone || p.seller?.email || '—'}</span>
                      </div>

                      <p style={{ fontSize: 12, color: '#64748b', marginBottom: 10, lineHeight: 1.5 }}>
                        {p.description?.substring(0, 70)}{p.description?.length > 70 ? '...' : ''}
                      </p>

                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                        <span style={{ fontSize: 16, fontWeight: 900, color: '#1d4ed8' }}>
                          {price !== null ? `TZS ${price.toLocaleString()}` : '— No price set'}
                        </span>
                        <span style={{ fontSize: 12, color: '#64748b' }}>Stock: {p.stock ?? '—'}</span>
                      </div>

                      {/* Approval actions — only show for pending products */}
                      {isPending ? (
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                          <button onClick={() => handleApprove(p)}
                            style={{ flex: 1, backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '8px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
                            ✅ Approve
                          </button>
                          <button onClick={() => handleReject(p)}
                            style={{ flex: 1, backgroundColor: '#ef4444', color: '#fff', border: 'none', padding: '8px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
                            ❌ Reject
                          </button>
                        </div>
                      ) : null}

                      {/* Standard actions */}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => handleToggleAvailability(p)}
                          style={{ flex: 1, backgroundColor: p.isAvailable ? '#fef9c3' : '#dcfce7', color: p.isAvailable ? '#ca8a04' : '#16a34a', border: 'none', padding: '8px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                          {p.isAvailable ? '⏸ Disable' : '▶ Enable'}
                        </button>
                        <button onClick={() => handleDelete(p.id)}
                          style={{ flex: 1, backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', padding: '8px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                          🗑 Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Products;