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
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';
import LocationPicker from '../components/LocationPicker';

const fmt = (n) => Number(n || 0).toLocaleString();

const CustomerCard = ({ customer, onOpen, onMessage, t }) => {
  const SEGMENTS = {
    all:      { label: t('seller_customers.seg_all'),      color: '#64748b', bg: '#f1f5f9' },
    vip:      { label: t('seller_customers.seg_vip'),      color: '#d97706', bg: '#fef3c7' },
    regular:  { label: t('seller_customers.seg_regular'),  color: '#1d4ed8', bg: '#dbeafe' },
    new:      { label: t('seller_customers.seg_new'),      color: '#16a34a', bg: '#dcfce7' },
    inactive: { label: t('seller_customers.seg_inactive'), color: '#dc2626', bg: '#fee2e2' },
  };
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
            📦 <strong style={{ color: '#1e293b' }}>{customer.totalOrders}</strong> {t('seller_customers.orders_unit')}
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

const DATE_LOCALE_MAP = { en: 'en-GB', sw: 'sw-TZ', fr: 'fr-FR' };

const SellerCustomers = ({ onNavigate }) => {
  const { t, i18n } = useTranslation();
  const dateLocale = DATE_LOCALE_MAP[i18n.language] || 'sw-TZ';
  const SEGMENTS = {
    all:      { label: t('seller_customers.seg_all'),      color: '#64748b', bg: '#f1f5f9' },
    vip:      { label: t('seller_customers.seg_vip'),      color: '#d97706', bg: '#fef3c7' },
    regular:  { label: t('seller_customers.seg_regular'),  color: '#1d4ed8', bg: '#dbeafe' },
    new:      { label: t('seller_customers.seg_new'),      color: '#16a34a', bg: '#dcfce7' },
    inactive: { label: t('seller_customers.seg_inactive'), color: '#dc2626', bg: '#fee2e2' },
  };
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
    } catch { setError(t('seller_customers.load_failed')); }
    finally { setLoading(false); }
  }, [search, segment, t]);

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
    if (!addForm.name.trim()) { setError(t('seller_customers.name_required')); return; }
    setSaving(true);
    try {
      await api.post('/business/customers', addForm);
      setAdding(false);
      setAddForm({ name: '', phone: '', email: '', notes: '' });
      fetchCustomers();
    } catch (err) {
      setError(err?.response?.data?.message || t('seller_customers.add_customer_failed'));
    } finally { setSaving(false); }
  };

  const inp = { width: '100%', padding: '10px 12px', borderRadius: 10,
    border: '1px solid #e2e8f0', fontSize: 13, outline: 'none',
    boxSizing: 'border-box', marginBottom: 10 };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <BackBar title={t('seller_customers.title')} onBack={() => onNavigate('back')} />

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 16px 80px' }}>

        {/* Stats row */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)',
            gap: 10, marginBottom: 20 }}>
            {[
              { label: t('seller_customers.stat_total_customers'),  value: stats.totalCustomers,  color: '#1d4ed8', bg: '#eff6ff' },
              { label: t('seller_customers.stat_new_this_month'),  value: stats.newThisMonth,    color: '#16a34a', bg: '#f0fdf4' },
              { label: t('seller_customers.stat_total_revenue'),  value: `TZS ${fmt(stats.totalRevenue)}`, color: '#7c3aed', bg: '#f5f3ff' },
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
          <input type="text" placeholder={t('seller_customers.search_placeholder')}
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
                {t('seller_customers.whatsapp_campaign')}
              </div>
              <span style={{ fontSize: 11, backgroundColor: '#dcfce7', color: '#16a34a',
                padding: '3px 10px', borderRadius: 100, fontWeight: 700 }}>
                {data.customers.filter(c => c.phone).length} {t('seller_customers.with_phone')}
              </span>
            </div>

            {/* Message templates — kept in Swahili regardless of seller UI
                language: these are sent verbatim to Tanzanian customers, not
                shown to the seller as interface text. */}
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>
              {t('seller_customers.quick_templates')}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {[
                { label: t('seller_customers.template_new_products'), msg: 'Habari! 🎉 Tuna bidhaa mpya zinazokungoja! Tembelea dukani letu na uone bei nzuri. Asante kwa kutuamini! 🙏' },
                { label: t('seller_customers.template_discount'), msg: 'Habari! 💰 PUNGUZO KUBWA leo tu! Bidhaa zetu zimepunguzwa bei. Haraka uagize kabla hazijaikwa! Piga simu au ujumbe.' },
                { label: t('seller_customers.template_thanks'), msg: 'Habari! Tunakushukuru kwa ununuzi wako wa hivi karibuni. 🙏 Tunatumai utarudi tena. Una swali lolote, tuko hapa!' },
                { label: t('seller_customers.template_delivered'), msg: 'Habari! 📦 Bidhaa yako imetolewa! Tafadhali thibitisha kupokea. Asante kwa kutumia huduma zetu.' },
              ].map(tmpl => (
                <button key={tmpl.label}
                  onClick={() => { bulkMsgRef.current && (bulkMsgRef.current.value = tmpl.msg); setBulkMsg(tmpl.msg); }}
                  style={{ fontSize: 10, padding: '5px 10px', borderRadius: 8,
                    border: '1px solid #86efac', backgroundColor: '#fff',
                    cursor: 'pointer', fontWeight: 700, color: '#16a34a' }}>
                  {tmpl.label}
                </button>
              ))}
            </div>

            {/* Message textarea */}
            <textarea
              ref={bulkMsgRef}
              value={bulkMsg}
              onChange={e => setBulkMsg(e.target.value)}
              placeholder={t('seller_customers.bulk_message_placeholder')}
              rows={3}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8,
                border: '1px solid #86efac', fontSize: 12, resize: 'none',
                boxSizing: 'border-box', marginBottom: 8, outline: 'none',
                fontFamily: 'inherit' }} />

            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
              {t('seller_customers.tap_customer_hint')}
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
          {adding ? t('seller_customers.close') : t('seller_customers.add_new_customer')}
        </button>

        {/* Add form */}
        {adding && (
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16,
            marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 14 }}>
              {t('seller_customers.new_customer_title')}
            </div>
            <input placeholder={t('seller_customers.name_field')} value={addForm.name}
              onChange={e => setAddForm(p => ({...p, name: e.target.value}))}
              style={inp} />
            <input placeholder={t('seller_customers.phone_field')} value={addForm.phone}
              onChange={e => setAddForm(p => ({...p, phone: e.target.value}))}
              style={inp} />
            <input placeholder={t('seller_customers.email_field')} value={addForm.email}
              onChange={e => setAddForm(p => ({...p, email: e.target.value}))}
              style={inp} />
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>
                {t('seller_customers.customer_location_optional')}
              </div>
              <LocationPicker
                value={addLocation}
                onChange={loc => {
                  setAddLocation(loc);
                  setAddForm(p => ({
                    ...p,
                    address:    [loc.wardName, loc.districtName, loc.regionName].filter(Boolean).join(', '),
                    regionId:   loc.regionId   || null,
                    region:     loc.regionName || '',
                    districtId: loc.districtId || null,
                    district:   loc.districtName || '',
                    wardId:     loc.wardId     || null,
                    ward:       loc.wardName   || '',
                  }));
                }}
              />
            </div>
            <textarea placeholder={t('seller_customers.notes_field')} value={addForm.notes}
              onChange={e => setAddForm(p => ({...p, notes: e.target.value}))}
              rows={2} style={{ ...inp, resize: 'none' }} />
            {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{error}</div>}
            <button onClick={handleAddCustomer} disabled={saving}
              style={{ width: '100%', backgroundColor: '#1d4ed8', color: '#fff',
                border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer',
                fontSize: 13, fontWeight: 800 }}>
              {saving ? t('seller_customers.adding') : t('seller_customers.add_customer_button')}
            </button>
          </div>
        )}

        {error && !adding && (
          <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}

        {/* Customer list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>{t('seller_customers.loading')}</div>
        ) : data.customers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>👥</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>
              {t('seller_customers.no_customers_yet')}
            </div>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              {t('seller_customers.no_customers_desc')}
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
              {t('seller_customers.customers_count', { count: data.total })}
            </div>
            {data.customers.map(c => (
              <CustomerCard key={c.id} customer={c} t={t}
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
                  [t('seller_customers.phone_label'),    selected.phone   || '—'],
                  [t('seller_customers.email_label'),   selected.email   || '—'],
                  [t('seller_customers.address_label'),  selected.address || [selected.ward, selected.district, selected.region].filter(Boolean).join(', ') || '—'],
                  [t('seller_customers.orders_label'), selected.totalOrders],
                  [t('seller_customers.spent_label'), `TZS ${fmt(selected.totalSpent)}`],
                  [t('seller_customers.avg_label'), `TZS ${fmt(selected.averageOrderValue)}`],
                  [t('seller_customers.last_order_label'), selected.lastOrderAt ? new Date(selected.lastOrderAt).toLocaleDateString(dateLocale) : '—'],
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
                  {t('seller_customers.start_conversation')}
                </button>
                {selected.phone && (
                  <a href={`https://wa.me/${String(selected.phone).replace(/[^\d]/g,'').replace(/^0/,'255')}`}
                    target="_blank" rel="noreferrer"
                    style={{ backgroundColor: '#25D366', color: '#fff',
                      padding: 14, borderRadius: 12, textDecoration: 'none',
                      fontSize: 14, fontWeight: 800, textAlign: 'center', display: 'block' }}>
                    {t('seller_customers.whatsapp')}
                  </a>
                )}
                <button onClick={() => {
                  setSelected(null);
                  onNavigate('SellerShipment', {
                    name:       selected.name       || '',
                    phone:      selected.phone      || '',
                    address:    selected.address    || '',
                    regionId:   selected.regionId   || null,
                    region:     selected.region     || '',
                    districtId: selected.districtId || null,
                    district:   selected.district   || '',
                    wardId:     selected.wardId      || null,
                    ward:       selected.ward        || '',
                  });
                }}
                  style={{ backgroundColor: '#f0fdf4', color: '#16a34a',
                    border: '1px solid #86efac', padding: 14, borderRadius: 12,
                    cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
                  {t('seller_customers.ship_item')}
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