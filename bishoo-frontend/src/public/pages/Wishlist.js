/**
 * Wishlist.js — Everything a buyer has saved, one unified view
 * Place at: src/public/pages/Wishlist.js
 *
 * Pulls from the same unified save system used everywhere else in the app
 * (PostEngagement, type=SAVE) — a product saved from search, a Moment
 * saved from the feed, a route saved from a transport provider's page,
 * all show up here together, filterable by type.
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';

const B  = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';
const fmt = n => Number(n||0).toLocaleString();

const getTypeMeta = (t) => ({
  product:    { label: t('wishlist.type_products'),    icon: '📦', detailPage: 'ProductDetail' },
  classified: { label: t('wishlist.type_listings'),    icon: '🏷️', detailPage: 'ClassifiedDetail' },
  service:    { label: t('wishlist.type_services'),    icon: '🔧', detailPage: 'ServiceDetail' },
  route:      { label: t('wishlist.type_routes'),      icon: '🚌', detailPage: null },
  moment:     { label: t('wishlist.type_moments'),     icon: '📸', detailPage: null },
});

const getFilters = (t) => [
  { key: 'all',        label: t('wishlist.filter_all') },
  { key: 'product',     label: `📦 ${t('wishlist.type_products')}` },
  { key: 'classified',  label: `🏷️ ${t('wishlist.type_listings')}` },
  { key: 'service',     label: `🔧 ${t('wishlist.type_services')}` },
  { key: 'moment',      label: `📸 ${t('wishlist.type_moments')}` },
  { key: 'route',       label: `🚌 ${t('wishlist.type_routes')}` },
];

const Wishlist = ({ onNavigate, isLoggedIn, currentUser }) => {
  const { t } = useTranslation();
  const TYPE_META = getTypeMeta(t);
  const FILTERS = getFilters(t);
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('all');
  const [removing, setRemoving] = useState(null);

  const fetchSaved = async () => {
    try {
      setLoading(true);
      const res = await api.get('/feed/saved');
      setItems(res.data || []);
    } catch { setItems([]); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    fetchSaved();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRemove = async (item) => {
    const key = `${item.type}-${item.id}`;
    setRemoving(key);
    try {
      if (item.type === 'moment') {
        await api.post(`/feed/${item.id}/engage`, { type: 'save' });
      } else {
        await api.post('/engagements', { entityType: item.type, entityId: item.id, type: 'save' });
      }
      setItems(prev => prev.filter(i => !(i.type === item.type && i.id === item.id)));
    } catch {
      alert(t('wishlist.remove_failed'));
    } finally {
      setRemoving(null);
    }
  };

  const goTo = (item) => {
    if (item.type === 'moment') {
      // A saved Moment opens whatever it's tagged to, same as tapping it in the feed
      if (item.linkedEntityType && item.linkedEntityId) {
        const meta = TYPE_META[item.linkedEntityType];
        if (meta?.detailPage) { onNavigate(`${meta.detailPage}-${item.linkedEntityId}`); return; }
        if (item.linkedEntityType === 'route') {
          if (item.business?.id) onNavigate(`CommerceProfile-${item.business.id}-transport`);
          else onNavigate('SendShipment');
          return;
        }
      }
      onNavigate('Home');
      return;
    }
    const meta = TYPE_META[item.type];
    if (item.type === 'route') {
      if (item.business?.id) onNavigate(`CommerceProfile-${item.business.id}-transport`);
      else onNavigate('SendShipment');
      return;
    }
    if (meta?.detailPage) onNavigate(`${meta.detailPage}-${item.id}`);
  };

  const filtered = filter === 'all' ? items : items.filter(i => i.type === filter);
  const counts = items.reduce((acc, i) => { acc[i.type] = (acc[i.type]||0)+1; return acc; }, {});

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', backgroundColor:'#F8FAFC' }}>

      {/* Header */}
      <div style={{ backgroundColor:WH, borderBottom:'1px solid #F1F5F9', padding:'14px 16px',
        position:'sticky', top:0, zIndex:100 }}>
        <button onClick={() => onNavigate('back')} style={{ background:'none', border:'none', cursor:'pointer',
          display:'flex', alignItems:'center', gap:10 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={DK} strokeWidth="2.5"><polyline points="15,18 9,12 15,6"/></svg>
          <span style={{ fontSize:15, fontWeight:800, color:DK }}>{t('wishlist.saved_title')}</span>
        </button>
      </div>

      {/* Filter tabs */}
      {items.length > 0 && (
        <div style={{ display:'flex', gap:8, padding:'12px 16px', overflowX:'auto',
          backgroundColor:WH, borderBottom:'1px solid #F1F5F9' }}>
          {FILTERS.filter(f => f.key === 'all' || counts[f.key] > 0).map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              style={{ flexShrink:0, padding:'7px 14px', borderRadius:100, cursor:'pointer',
                border: filter===f.key ? `1.5px solid ${B}` : '1.5px solid #E2E8F0',
                backgroundColor: filter===f.key ? '#EFF6FF' : WH,
                color: filter===f.key ? B : GR, fontSize:12, fontWeight:700, whiteSpace:'nowrap' }}>
              {f.label}{f.key !== 'all' && counts[f.key] ? ` (${counts[f.key]})` : ''}
            </button>
          ))}
        </div>
      )}

      <div style={{ flex:1, padding:'16px 16px 100px', maxWidth:900,
        margin:'0 auto', width:'100%', boxSizing:'border-box' }}>

        {loading ? (
          <div style={{ textAlign:'center', padding:60, color:GR }}>
            <div style={{ fontSize:40, marginBottom:12 }}>❤️</div>
            <div>{t('wishlist.loading')}</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:80, backgroundColor:WH,
            borderRadius:20, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize:64, marginBottom:16 }}>🤍</div>
            <div style={{ fontSize:18, fontWeight:900, color:DK, marginBottom:8 }}>
              {items.length === 0 ? t('wishlist.nothing_saved') : t('wishlist.no_saved_type', { type: TYPE_META[filter]?.label.toLowerCase() || '' })}
            </div>
            <div style={{ fontSize:13, color:GR, marginBottom:24 }}>
              {t('wishlist.save_hint')}
            </div>
            <button onClick={() => onNavigate('Stores')}
              style={{ backgroundColor:B, color:WH, border:'none',
                borderRadius:12, padding:'12px 28px', cursor:'pointer',
                fontSize:14, fontWeight:700 }}>
              {t('wishlist.discover_button')}
            </button>
          </div>
        ) : (
          <div style={{ display:'grid',
            gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:14 }}>
            {filtered.map(item => {
              const meta = TYPE_META[item.type] || {};
              const key = `${item.type}-${item.id}`;
              return (
                <div key={key} style={{ backgroundColor:WH, borderRadius:16,
                  boxShadow:'0 2px 8px rgba(0,0,0,0.06)', overflow:'hidden', position:'relative' }}>

                  <button onClick={() => handleRemove(item)} disabled={removing === key}
                    style={{ position:'absolute', top:8, right:8, zIndex:10,
                      backgroundColor:'rgba(0,0,0,0.5)', color:WH, border:'none',
                      borderRadius:'50%', width:26, height:26, cursor:'pointer',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:13 }}>
                    {removing === key ? '⏳' : '✕'}
                  </button>

                  <div onClick={() => goTo(item)}
                    style={{ height:130, backgroundColor:'#F1F5F9', cursor:'pointer',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      overflow:'hidden' }}>
                    {item.image
                      ? <img src={item.image} alt={item.title}
                          style={{ width:'100%', height:'100%', objectFit:'cover' }}
                          onError={e => e.target.style.display='none'} />
                      : <span style={{ fontSize:36 }}>{meta.icon || '📦'}</span>}
                  </div>

                  <div style={{ padding:12 }}>
                    <div style={{ fontSize:9, fontWeight:800, color:GR, textTransform:'uppercase',
                      letterSpacing:0.4, marginBottom:4 }}>
                      {meta.icon} {meta.label}
                    </div>
                    <div onClick={() => goTo(item)} style={{ fontSize:13, fontWeight:700, color:DK,
                      marginBottom:6, overflow:'hidden', textOverflow:'ellipsis',
                      whiteSpace:'nowrap', cursor:'pointer' }}>
                      {item.title}
                    </div>
                    {item.price != null && (
                      <div style={{ fontSize:14, fontWeight:900, color:B, marginBottom:4 }}>
                        TZS {fmt(item.price)}
                      </div>
                    )}
                    {item.business?.name && (
                      <div style={{ fontSize:11, color:GR, overflow:'hidden',
                        textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {item.business.name}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Wishlist;