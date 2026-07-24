/**
 * SellerCustomers.js — Seller CRM
 * Place at: src/public/pages/SellerCustomers.js
 *
 * Seller sees ALL their customers in one place:
 * - Auto-populated from every order
 * - Spending history, order count, segment
 * - Search, filter by segment
 * - Tap to view full customer profile
 * - Start conversation directly
 */
import React, { useState, useEffect, useCallback } from 'react';
import BackBar from '../components/BackBar';
import api from '../../api/api';
import LocationPicker from '../components/LocationPicker';

const SEGMENTS = {
  all:      { label: 'Wote',      color: '#64748b', bg: '#f1f5f9' },
  vip:      { label: '👑 VIP',    color: '#d97706', bg: '#fef3c7' },
  regular:  { label: '⭐ Kawaida',color: '#1d4ed8', bg: '#dbeafe' },
  new:      { label: '🆕 Wapya',  color: '#16a34a', bg: '#dcfce7' },
  inactive: { label: '😴 Kimya',  color: '#dc2626', bg: '#fee2e2' },
};

const fmt = (n) => Number(n || 0).toLocaleString();

const CustomerCard = ({ customer, onOpen, onMessage }) => {
  const seg = SEGMENTS[customer.segment] || SEGMENTS.regular;
  const initial = (customer.name || '?')[0].toUpperCase();

  return (
    <div onClick={() => onOpen(customer)}
      style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16,
        marginBottom: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>

      {/* Avatar */}
      <div style={{ width: 48, height: 48, borderRadius: '50%',
        background: 'linear-gradient(135deg,#1d4ed8,#7c3aed)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, fontWeight: 900, color: '#fff', flexShrink: 0 }}>
        {initial}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: '65%' }}>
            {customer.name}
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px',
            borderRadius: 100, backgroundColor: seg.bg, color: seg.color,
            flexShrink: 0 }}>
            {seg.label}
          </span>
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
          {customer.phone || customer.email || '—'}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            📦 <strong style={{ color: '#1e293b' }}>{customer.totalOrders}</strong> maagizo
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            💰 <strong style={{ color: '#16a34a' }}>TZS {fmt(customer.totalSpent)}</strong>
          </div>
        </div>
      </div>

      {/* Message button */}
      <button onClick={e => { e.stopPropagation(); onMessage(customer); }}
        style={{ background: 'none', border: '1px solid #e2e8f0',
          borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
          fontSize: 16, flexShrink: 0 }}>
        💬
      </button>
    </div>
  );
};

const SellerCustomers = ({ onNavigate }) => {
  const [data,     setData]     = useState({ customers: [], total: 0, segments: {} });
  const [loading,  setLoading]  = useState(true);
  const [stats,    setStats]    = useState(null);
  const [search,   setSearch]   = useState('');
  const [segment,  setSegment]  = useState('all');
  const [selected, setSelected] = useState(null);
  const [adding,   setAdding]   = useState(false);
  const [addForm,  setAddForm]  = useState({ name: '', phone: '', email: '', notes: '' });
  const [addLocation, setAddLocation] = useState({ regionId: null, regionName: '', districtId: null, districtName: '', wardId: null, wardName: '' });
  const [saving,   setSaving]   = useState(false);
  const [bulkMsg,  setBulkMsg]  = useState('');
  const bulkMsgRef = React.useRef(null);
  const [error,    setError]    = useState('');

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: '1', limit: '50' });
      if (search)               params.set('search', search);
      if (segment !== 'all')    params.set('segment', segment);
      const res = await api.get(`/business/customers?${params}`);
      setData(res.data);
    } catch { setError('Imeshindwa kupakia wateja'); }
    finally { setLoading(false); }
  }, [search, segment]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  // One-time migration: backfill existing orders into customer records
  // Runs once per session when seller opens the page
  useEffect(() => {
    const migrated = sessionStorage.getItem('kx_customers_migrated');
    if (migrated) return;
    api.post('/business/customers/migrate')
      .then(r => {
        sessionStorage.setItem('kx_customers_migrated', '1');
        if (r.data?.migrated > 0) fetchCustomers();
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.get('/business/customers/stats')
      .then(r => setStats(r.data))
      .catch(() => {});
  }, []);

  const handleAddCustomer = async () => {
    if (!addForm.name.trim()) { setError('Jina linahitajika'); return; }
    setSaving(true);
    try {
      await api.post('/business/customers', addForm);
      setAdding(false);
      setAddForm({ name: '', phone: '', email: '', notes: '' });
      fetchCustomers();
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kuongeza mteja');
    } finally { setSaving(false); }
  };

  const inp = { width: '100%', padding: '10px 12px', borderRadius: 10,
    border: '1px solid #e2e8f0', fontSize: 13, outline: 'none',
    boxSizing: 'border-box', marginBottom: 10 };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <BackBar title="Wateja Wangu" onBack={() => onNavigate('back')} />

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 16px 80px' }}>

        {/* Stats row */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)',
            gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Wateja Wote',  value: stats.totalCustomers,  color: '#1d4ed8', bg: '#eff6ff' },
              { label: 'Wapya Mwezi',  value: stats.newThisMonth,    color: '#16a34a', bg: '#f0fdf4' },
              { label: 'Mapato Yote',  value: `TZS ${fmt(stats.totalRevenue)}`, color: '#7c3aed', bg: '#f5f3ff' },
            ].map(s => (
              <div key={s.label} style={{ backgroundColor: s.bg, borderRadius: 12,
                padding: '12px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: s.color }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 3, fontWeight: 600 }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <span style={{ position: 'absolute', left: 12, top: 11, fontSize: 16 }}>🔍</span>
          <input type="text" placeholder="Tafuta jina, simu, barua pepe..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...inp, paddingLeft: 36, marginBottom: 0 }} />
        </div>

        {/* Segment tabs */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto',
          marginBottom: 16, paddingBottom: 4 }}>
          {Object.entries(SEGMENTS).map(([key, s]) => (
            <button key={key} onClick={() => setSegment(key)}
              style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 100,
                border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                backgroundColor: segment === key ? s.bg : '#f1f5f9',
                color: segment === key ? s.color : '#64748b' }}>
              {s.label}
              {key !== 'all' && data.segments?.[key] > 0 &&
                <span style={{ marginLeft: 4 }}>({data.segments[key]})</span>}
            </button>
          ))}
        </div>

        {/* Bulk WhatsApp Campaign */}
        {segment !== 'all' && data.customers.length > 0 && (
          <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #86efac',
            borderRadius: 14, padding: 16, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#16a34a' }}>
                📣 Kampeni ya WhatsApp
              </div>
              <span style={{ fontSize: 11, backgroundColor: '#dcfce7', color: '#16a34a',
                padding: '3px 10px', borderRadius: 100, fontWeight: 700 }}>
                {data.customers.filter(c => c.phone).length} na simu
              </span>
            </div>

            {/* Message templates */}
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>
              Templeti za Haraka:
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {[
                { label: '🎉 Bidhaa Mpya', msg: 'Habari! 🎉 Tuna bidhaa mpya zinazokungoja! Tembelea dukani letu na uone bei nzuri. Asante kwa kutuamini! 🙏' },
                { label: '💰 Punguzo', msg: 'Habari! 💰 PUNGUZO KUBWA leo tu! Bidhaa zetu zimepunguzwa bei. Haraka uagize kabla hazijaikwa! Piga simu au ujumbe.' },
                { label: '🙏 Asante', msg: 'Habari! Tunakushukuru kwa ununuzi wako wa hivi karibuni. 🙏 Tunatumai utarudi tena. Una swali lolote, tuko hapa!' },
                { label: '📦 Imetolewa', msg: 'Habari! 📦 Bidhaa yako imetolewa! Tafadhali thibitisha kupokea. Asante kwa kutumia huduma zetu.' },
              ].map(t => (
                <button key={t.label}
                  onClick={() => { bulkMsgRef.current && (bulkMsgRef.current.value = t.msg); setBulkMsg(t.msg); }}
                  style={{ fontSize: 10, padding: '5px 10px', borderRadius: 8,
                    border: '1px solid #86efac', backgroundColor: '#fff',
                    cursor: 'pointer', fontWeight: 700, color: '#16a34a' }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Message textarea */}
            <textarea
              ref={bulkMsgRef}
              value={bulkMsg}
              onChange={e => setBulkMsg(e.target.value)}
              placeholder="Andika ujumbe wako hapa au chagua templeti hapo juu..."
              rows={3}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8,
                border: '1px solid #86efac', fontSize: 12, resize: 'none',
                boxSizing: 'border-box', marginBottom: 8, outline: 'none',
                fontFamily: 'inherit' }} />

            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
              💡 Bonyeza jina la mteja hapa chini — WhatsApp itafunguka na ujumbe tayari
            </div>

            {/* Customer buttons */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {data.customers.filter(c => c.phone).map(c => {
                const phone = String(c.phone).replace(/[^\d]/g,'').replace(/^0/,'255');
                const msg   = encodeURIComponent(bulkMsg || '');
                return (
                  <a key={c.id}
                    href={`https://wa.me/${phone}${msg ? '?text=' + msg : ''}`}
                    target="_blank" rel="noreferrer"
                    style={{ padding: '6px 12px', backgroundColor: '#25D366', color: '#fff',
                      borderRadius: 8, textDecoration: 'none', fontSize: 11,
                      fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    📲 {c.name.split(' ')[0]}
                  </a>
                );
              })}
            </div>
          </div>
        )}


        {/* Add customer button */}
        <button onClick={() => setAdding(!adding)}
          style={{ width: '100%', padding: '12px 16px', borderRadius: 12,
            border: '2px dashed #1d4ed8', backgroundColor: '#eff6ff',
            color: '#1d4ed8', fontSize: 13, fontWeight: 800, cursor: 'pointer',
            marginBottom: 16 }}>
          {adding ? '✕ Funga' : '+ Ongeza Mteja Mpya'}
        </button>

        {/* Add form */}
        {adding && (
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16,
            marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 14 }}>
              Mteja Mpya
            </div>
            <input placeholder="Jina *" value={addForm.name}
              onChange={e => setAddForm(p => ({...p, name: e.target.value}))}
              style={inp} />
            <input placeholder="Simu (e.g. 0712345678)" value={addForm.phone}
              onChange={e => setAddForm(p => ({...p, phone: e.target.value}))}
              style={inp} />
            <input placeholder="Barua pepe (hiari)" value={addForm.email}
              onChange={e => setAddForm(p => ({...p, email: e.target.value}))}
              style={inp} />
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>
                📍 Eneo la Mteja (hiari)
              </div>
              <LocationPicker
                value={addLocation}
                onChange={loc => {
                  setAddLocation(loc);
                  setAddForm(p => ({
                    ...p,
                    address:  [loc.wardName, loc.districtName, loc.regionName].filter(Boolean).join(', '),
                    district: loc.districtName || '',
                    region:   loc.regionName   || '',
                  }));
                }}
              />
            </div>
            <textarea placeholder="Maelezo (hiari)" value={addForm.notes}
              onChange={e => setAddForm(p => ({...p, notes: e.target.value}))}
              rows={2} style={{ ...inp, resize: 'none' }} />
            {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{error}</div>}
            <button onClick={handleAddCustomer} disabled={saving}
              style={{ width: '100%', backgroundColor: '#1d4ed8', color: '#fff',
                border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer',
                fontSize: 13, fontWeight: 800 }}>
              {saving ? '⏳ Inaongeza...' : '✅ Ongeza Mteja'}
            </button>
          </div>
        )}

        {error && !adding && (
          <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}

        {/* Customer list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳ Inapakia...</div>
        ) : data.customers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>👥</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>
              Hakuna Wateja Bado
            </div>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              Wateja wataongezwa otomatiki unapopokea maagizo.
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
              {data.total} wateja
            </div>
            {data.customers.map(c => (
              <CustomerCard key={c.id} customer={c}
                onOpen={setSelected}
                onMessage={c => onNavigate(`SellerInbox-${c.id}`)} />
            ))}
          </>
        )}

        {/* Customer detail drawer */}
        {selected && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
            zIndex: 9999, display: 'flex', justifyContent: 'flex-end' }}
            onClick={() => setSelected(null)}>
            <div style={{ width: '100%', maxWidth: 480, backgroundColor: '#fff',
              height: '100%', overflowY: 'auto', padding: 24 }}
              onClick={e => e.stopPropagation()}>

              <div style={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 18, fontWeight: 900 }}>{selected.name}</div>
                <button onClick={() => setSelected(null)}
                  style={{ background: 'none', border: 'none', fontSize: 22,
                    cursor: 'pointer', color: '#94a3b8' }}>✕</button>
              </div>

              {/* Customer info */}
              <div style={{ backgroundColor: '#f8fafc', borderRadius: 14,
                padding: 16, marginBottom: 16 }}>
                {[
                  ['📞 Simu',    selected.phone   || '—'],
                  ['✉️ Barua',   selected.email   || '—'],
                  ['📍 Anwani',  selected.address || [selected.ward, selected.district, selected.region].filter(Boolean).join(', ') || '—'],
                  ['📦 Maagizo', selected.totalOrders],
                  ['💰 Matumizi', `TZS ${fmt(selected.totalSpent)}`],
                  ['📊 Wastani', `TZS ${fmt(selected.averageOrderValue)}`],
                  ['🕐 Agizo la Mwisho', selected.lastOrderAt ? new Date(selected.lastOrderAt).toLocaleDateString('sw-TZ') : '—'],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between',
                    padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                    <span style={{ color: '#64748b' }}>{l}</span>
                    <span style={{ fontWeight: 700, color: '#1e293b' }}>{v}</span>
                  </div>
                ))}
              </div>

              {selected.notes && (
                <div style={{ backgroundColor: '#fef3c7', borderRadius: 12,
                  padding: 12, marginBottom: 16, fontSize: 13, color: '#92400e' }}>
                  📝 {selected.notes}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button onClick={() => {
                  setSelected(null);
                  onNavigate(`SellerInbox-${selected.id}`);
                }} style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none',
                  padding: 14, borderRadius: 12, cursor: 'pointer',
                  fontSize: 14, fontWeight: 800 }}>
                  💬 Anza Mazungumzo
                </button>
                {selected.phone && (
                  <a href={`https://wa.me/${String(selected.phone).replace(/[^\d]/g,'').replace(/^0/,'255')}`}
                    target="_blank" rel="noreferrer"
                    style={{ backgroundColor: '#25D366', color: '#fff',
                      padding: 14, borderRadius: 12, textDecoration: 'none',
                      fontSize: 14, fontWeight: 800, textAlign: 'center', display: 'block' }}>
                    📲 WhatsApp
                  </a>
                )}
                <button onClick={() => {
                  setSelected(null);
                  onNavigate('SellerShipment', {
                    name:     selected.name    || '',
                    phone:    selected.phone   || '',
                    address:  selected.address || '',
                    district: selected.district || '',
                    region:   selected.region   || '',
                  });
                }}
                  style={{ backgroundColor: '#f0fdf4', color: '#16a34a',
                    border: '1px solid #86efac', padding: 14, borderRadius: 12,
                    cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
                  📦 Tuma Bidhaa
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SellerCustomers;