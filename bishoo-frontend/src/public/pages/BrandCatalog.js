/**
 * BrandCatalog.js — a logged-in brand identity (src/brands/ Phase C)
 * managing their own OfficialProduct catalog rows directly (spec §20).
 * Mirrors AdminBrands.js's OfficialProducts.js UI shape exactly, scoped
 * to the active brand profile — same create + toggle-active scope, no
 * bigger. The admin's own unscoped CRUD stays untouched and available for
 * any brand that hasn't been given login access yet.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';

const EMPTY_FORM = { name: '', category: '', subcategory: '' };

const BrandCatalog = ({ onNavigate, activeProfileId }) => {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchItems = async () => {
    if (!activeProfileId) { setLoading(false); return; }
    try {
      setLoading(true);
      const res = await api.get(`/official-products/mine/${activeProfileId}`);
      setItems(res.data || []);
    } catch { setError(t('brand_catalog.load_failed')); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchItems(); }, [activeProfileId]); // eslint-disable-line react-hooks/exhaustive-deps

  const showMsg = (m) => { setMessage(m); setTimeout(() => setMessage(''), 4000); };
  const showErr = (m) => { setError(m);   setTimeout(() => setError(''),   4000); };

  const createItem = async () => {
    if (!form.name.trim() || !form.category.trim()) { showErr(t('brand_catalog.name_category_required')); return; }
    try {
      setSaving(true);
      await api.post(`/official-products/mine/${activeProfileId}`, {
        name: form.name,
        category: form.category,
        subcategory: form.subcategory || undefined,
      });
      showMsg(t('brand_catalog.item_created'));
      setShowForm(false); setForm(EMPTY_FORM);
      fetchItems();
    } catch (err) { showErr(err?.response?.data?.message || t('brand_catalog.create_failed')); }
    finally { setSaving(false); }
  };

  const toggleActive = async (item) => {
    try {
      await api.patch(`/official-products/mine/${activeProfileId}/${item.id}`, { isActive: !item.isActive });
      fetchItems();
    } catch { showErr(t('brand_catalog.update_failed')); }
  };

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', marginBottom: 10 };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
      <BackBar onBack={() => onNavigate('back')} title={`📋 ${t('brand_catalog.title')}`} top={0} />
      <div style={{ padding: 16, maxWidth: 640, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>{t('brand_catalog.intro')}</p>
          <button onClick={() => setShowForm(true)}
            style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
            + {t('brand_catalog.new_item_button')}
          </button>
        </div>

        {message && <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '10px 14px', borderRadius: 10, fontSize: 12, marginBottom: 12 }}>{message}</div>}
        {error && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, fontSize: 12, marginBottom: 12 }}>{error}</div>}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>{t('brand_catalog.loading')}</div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>{t('brand_catalog.no_items_desc')}</div>
          </div>
        ) : (
          items.map(item => (
            <div key={item.id} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{item.name}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {item.category}{item.subcategory ? ` / ${item.subcategory}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, backgroundColor: item.isActive ? '#f0fdf4' : '#fee2e2', color: item.isActive ? '#16a34a' : '#dc2626' }}>
                  {item.isActive ? t('brand_catalog.status_active') : t('brand_catalog.status_inactive')}
                </span>
                <button onClick={() => toggleActive(item)}
                  style={{ backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {item.isActive ? t('brand_catalog.deactivate_button') : t('brand_catalog.activate_button')}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 480, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 900 }}>{t('brand_catalog.new_item_title')}</div>
              <button onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#64748b' }}>×</button>
            </div>
            <input placeholder={t('brand_catalog.name_placeholder')} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
            <input placeholder={t('brand_catalog.category_placeholder')} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inputStyle} />
            <input placeholder={t('brand_catalog.subcategory_placeholder')} value={form.subcategory} onChange={e => setForm(f => ({ ...f, subcategory: e.target.value }))} style={inputStyle} />
            <button onClick={createItem} disabled={saving}
              style={{ width: '100%', padding: 14, background: saving ? '#93c5fd' : 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 900 }}>
              {saving ? t('brand_catalog.saving') : t('brand_catalog.create_button')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrandCatalog;
