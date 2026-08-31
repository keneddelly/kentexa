import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

const EMPTY_FORM = { brandId: '', name: '', category: 'electronics', subcategory: '' };

const OfficialProducts = ({ activePage, onNavigate, onLogout }) => {
  const [brands, setBrands] = useState([]);
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/brands', { params: { includeInactive: 'true' } }).then(r => setBrands(r.data || [])).catch(() => setBrands([]));
  }, []);

  const fetchItems = async (brandId) => {
    try {
      setLoading(true);
      const res = await api.get('/official-products', { params: brandId ? { brandId } : {} });
      setItems(res.data || []);
    } catch { setError('Failed to load official products'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchItems(selectedBrandId || undefined); }, [selectedBrandId]); // eslint-disable-line react-hooks/exhaustive-deps

  const showMsg = (m) => { setMessage(m); setTimeout(() => setMessage(''), 4000); };
  const showErr = (m) => { setError(m);   setTimeout(() => setError(''),   4000); };

  const createItem = async () => {
    if (!form.brandId || !form.name.trim()) { showErr('Brand and name are required'); return; }
    try {
      setSaving(true);
      await api.post('/official-products', {
        brandId: Number(form.brandId),
        name: form.name,
        category: form.category,
        subcategory: form.subcategory || undefined,
      });
      showMsg('✅ Official product created');
      setShowForm(false); setForm(EMPTY_FORM);
      fetchItems(selectedBrandId || undefined);
    } catch (err) { showErr(err?.response?.data?.message || 'Failed to create'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (item) => {
    try {
      await api.patch(`/official-products/${item.id}`, { isActive: !item.isActive });
      fetchItems(selectedBrandId || undefined);
    } catch { showErr('Failed to update'); }
  };

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', marginBottom: 10 };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32 }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>📋 Official Product Catalog</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>A brand's own canonical items (e.g. LG OLED55C4) — sellers link their own listings to these so offers can be compared</p>
          </div>
          <button onClick={() => setShowForm(true)}
            style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            + New Item
          </button>
        </div>

        {message && <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>{message}</div>}
        {error   && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>❌ {error}</div>}

        <select value={selectedBrandId} onChange={e => setSelectedBrandId(e.target.value)}
          style={{ ...inputStyle, maxWidth: 260, marginBottom: 20 }}>
          <option value="">All brands</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>⏳ Loading...</div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div>No official products yet</div>
          </div>
        ) : (
          <div style={{ backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #f1f5f9' }}>
                  {['Name', 'Brand', 'Category', 'Active', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={it.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{it.name}</td>
                    <td style={{ padding: '14px 16px', fontSize: 12, color: '#64748b' }}>{brands.find(b => b.id === it.brandId)?.name || `#${it.brandId}`}</td>
                    <td style={{ padding: '14px 16px', fontSize: 12, color: '#64748b' }}>{it.category}{it.subcategory ? ` / ${it.subcategory}` : ''}</td>
                    <td style={{ padding: '14px 16px', fontSize: 12, color: it.isActive ? '#16a34a' : '#dc2626' }}>{it.isActive ? 'Active' : 'Inactive'}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <button onClick={() => toggleActive(it)}
                        style={{ backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                        {it.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 24, width: 420 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800 }}>New Official Product</h3>
            <select value={form.brandId} onChange={e => setForm(f => ({ ...f, brandId: e.target.value }))} style={inputStyle}>
              <option value="">Select brand *</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <input placeholder="Name/Model * (e.g. OLED55C4)" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
            <input placeholder="Category (e.g. electronics)" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inputStyle} />
            <input placeholder="Subcategory (optional)" value={form.subcategory} onChange={e => setForm(f => ({ ...f, subcategory: e.target.value }))} style={inputStyle} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
                style={{ flex: 1, padding: 12, borderRadius: 8, border: 'none', backgroundColor: '#f1f5f9', color: '#64748b', cursor: 'pointer', fontWeight: 700 }}>Cancel</button>
              <button onClick={createItem} disabled={saving}
                style={{ flex: 1, padding: 12, borderRadius: 8, border: 'none', backgroundColor: '#1d4ed8', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
                {saving ? 'Saving...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OfficialProducts;
