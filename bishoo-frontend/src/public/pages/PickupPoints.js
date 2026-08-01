/**
 * PickupPoints.js — Browse pickup points + Agent manages their spots
 * Place at: src/public/pages/PickupPoints.js
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Navbar  from '../components/Navbar';
import BackBar from '../components/BackBar';
import Footer  from '../components/Footer';
import api     from '../../api/api';

const B  = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';

const inp = {
  width:'100%', padding:'11px 14px', borderRadius:10,
  border:'1.5px solid #E2E8F0', fontSize:13, outline:'none',
  boxSizing:'border-box', fontFamily:'inherit', color:DK, marginBottom:10,
};

const getStatusColors = (t) => ({
  active:   { bg:'#DCFCE7', color:'#16A34A', label:t('pickup_points.status_active')   },
  inactive: { bg:'#F1F5F9', color:GR,         label:t('pickup_points.status_inactive')},
  busy:     { bg:'#FEF3C7', color:'#D97706',  label:t('pickup_points.status_busy')   },
});

const PickupPoints = ({ onNavigate, isLoggedIn, onLogout, userRole, currentUser }) => {
  const { t } = useTranslation();
  const STATUS_COLORS = getStatusColors(t);
  const isAgent = ['agent','super_agent','admin'].includes(userRole);

  const [tab,        setTab]        = useState(isAgent ? 'mine' : 'browse');
  const [points,     setPoints]     = useState([]);
  const [myPoints,   setMyPoints]   = useState([]);
  const [city,       setCity]       = useState('');
  const [loading,    setLoading]    = useState(false);
  const [showForm,   setShowForm]   = useState(false);
  const [editId,     setEditId]     = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [form, setForm] = useState({
    name:'', address:'', city:'', landmark:'',
    phone:'', openHours:'', latitude:'', longitude:'',
  });

  useEffect(() => {
    if (tab === 'browse') {
      setLoading(true);
      api.get(`/pickup-points${city ? `?city=${encodeURIComponent(city)}` : ''}`)
        .then(r => setPoints(r.data || []))
        .catch(() => setPoints([]))
        .finally(() => setLoading(false));
    }
    if (tab === 'mine' && isLoggedIn) {
      api.get('/pickup-points/mine')
        .then(r => setMyPoints(r.data || []))
        .catch(() => setMyPoints([]));
    }
  }, [tab, city, isLoggedIn]); // eslint-disable-line

  const handleSave = async () => {
    if (!form.name || !form.address || !form.city) {
      alert(t('pickup_points.fill_required_fields')); return;
    }
    setSaving(true);
    try {
      if (editId) {
        await api.patch(`/pickup-points/${editId}`, form);
      } else {
        await api.post('/pickup-points', form);
      }
      setShowForm(false);
      setEditId(null);
      setForm({ name:'', address:'', city:'', landmark:'', phone:'', openHours:'', latitude:'', longitude:'' });
      api.get('/pickup-points/mine').then(r => setMyPoints(r.data || []));
    } catch (e) {
      alert(e.response?.data?.message || t('pickup_points.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const handleStatusToggle = async (pt) => {
    const next = pt.status === 'active' ? 'inactive' : 'active';
    try {
      await api.patch(`/pickup-points/${pt.id}/status`, { status: next });
      setMyPoints(prev => prev.map(p => p.id === pt.id ? { ...p, status: next } : p));
    } catch {}
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('pickup_points.delete_confirm'))) return;
    try {
      await api.delete(`/pickup-points/${id}`);
      setMyPoints(prev => prev.filter(p => p.id !== id));
    } catch {}
  };

  const startEdit = (pt) => {
    setForm({
      name:      pt.name      || '',
      address:   pt.address   || '',
      city:      pt.city      || '',
      landmark:  pt.landmark  || '',
      phone:     pt.phone     || '',
      openHours: pt.openHours || '',
      latitude:  pt.latitude  || '',
      longitude: pt.longitude || '',
    });
    setEditId(pt.id);
    setShowForm(true);
  };

  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#F8FAFC',
      fontFamily:'Manrope,Inter,-apple-system,sans-serif' }}>
      <Navbar currentPage="PickupPoints" onNavigate={onNavigate}
        isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => onNavigate('back')} title={t('pickup_points.page_title')} />

      {/* Tabs */}
      <div style={{ backgroundColor:WH, borderBottom:'1px solid #F1F5F9',
        display:'flex', padding:'0 8px' }}>
        <button onClick={() => setTab('browse')}
          style={{ flex:1, padding:'12px 0', border:'none', background:'none',
            cursor:'pointer', fontSize:13, fontWeight:700,
            color: tab==='browse' ? B : GR,
            borderBottom:`2px solid ${tab==='browse' ? B : 'transparent'}` }}>
          {t('pickup_points.tab_browse')}
        </button>
        {isAgent && (
          <button onClick={() => setTab('mine')}
            style={{ flex:1, padding:'12px 0', border:'none', background:'none',
              cursor:'pointer', fontSize:13, fontWeight:700,
              color: tab==='mine' ? B : GR,
              borderBottom:`2px solid ${tab==='mine' ? B : 'transparent'}` }}>
            {t('pickup_points.tab_mine')}
          </button>
        )}
      </div>

      <div style={{ padding:'14px', maxWidth:760, margin:'0 auto',
        width:'100%', boxSizing:'border-box', paddingBottom:80 }}>

        {/* ── BROWSE TAB ── */}
        {tab === 'browse' && (
          <>
            {/* City search */}
            <div style={{ display:'flex', gap:8, marginBottom:14 }}>
              <input style={{ ...inp, margin:0, flex:1 }}
                placeholder={t('pickup_points.city_search_placeholder')}
                value={city}
                onChange={e => setCity(e.target.value)} />
              <button onClick={() => {
                setLoading(true);
                api.get(`/pickup-points${city ? `?city=${encodeURIComponent(city)}` : ''}`)
                  .then(r => setPoints(r.data || []))
                  .catch(() => setPoints([]))
                  .finally(() => setLoading(false));
              }}
                style={{ backgroundColor:B, color:WH, border:'none', borderRadius:10,
                  padding:'11px 16px', cursor:'pointer', fontSize:13, fontWeight:700,
                  flexShrink:0 }}>
                {t('pickup_points.search_button')}
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign:'center', padding:60, color:GR }}>
                <div style={{ fontSize:32, marginBottom:8 }}>📍</div>
                <div>{t('pickup_points.searching')}</div>
              </div>
            ) : points.length === 0 ? (
              <div style={{ textAlign:'center', padding:60 }}>
                <div style={{ fontSize:48, marginBottom:12 }}>📍</div>
                <div style={{ fontSize:15, fontWeight:800, color:DK, marginBottom:8 }}>
                  {t('pickup_points.no_points_title', { city: city ? ` huko ${city}` : '' })}
                </div>
                <div style={{ fontSize:13, color:GR, marginBottom:20 }}>
                  {t('pickup_points.no_points_desc')}
                </div>
                {isAgent && (
                  <button onClick={() => { setTab('mine'); setShowForm(true); }}
                    style={{ backgroundColor:B, color:WH, border:'none', borderRadius:12,
                      padding:'12px 24px', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                    {t('pickup_points.register_yours_button')}
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <div style={{ fontSize:13, fontWeight:700, color:DK, marginBottom:4 }}>
                  {t('pickup_points.points_available', { count: points.length })}
                </div>
                {points.map(pt => {
                  const sc = STATUS_COLORS[pt.status] || STATUS_COLORS.active;
                  return (
                    <div key={pt.id}
                      style={{ backgroundColor:WH, borderRadius:16, padding:18,
                        boxShadow:'0 2px 8px rgba(0,0,0,0.06)',
                        border:'1px solid #F1F5F9' }}>
                      <div style={{ display:'flex', justifyContent:'space-between',
                        alignItems:'flex-start', marginBottom:10 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:15, fontWeight:800, color:DK, marginBottom:3 }}>
                            {pt.name}
                          </div>
                          <div style={{ fontSize:12, color:GR }}>
                            📍 {pt.address}
                            {pt.city && `, ${pt.city}`}
                          </div>
                          {pt.landmark && (
                            <div style={{ fontSize:11, color:GR, marginTop:2 }}>
                              {t('pickup_points.near_landmark', { landmark: pt.landmark })}
                            </div>
                          )}
                        </div>
                        <span style={{ fontSize:11, fontWeight:700, padding:'4px 10px',
                          borderRadius:100, backgroundColor:sc.bg, color:sc.color,
                          flexShrink:0, marginLeft:10 }}>
                          {sc.label}
                        </span>
                      </div>

                      <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:10 }}>
                        {pt.phone && (
                          <div style={{ fontSize:11, color:GR }}>📱 {pt.phone}</div>
                        )}
                        {pt.openHours && (
                          <div style={{ fontSize:11, color:GR }}>⏰ {pt.openHours}</div>
                        )}
                        {pt.totalPickups > 0 && (
                          <div style={{ fontSize:11, color:GR }}>
                            {t('pickup_points.pickups_completed', { count: pt.totalPickups })}
                          </div>
                        )}
                        {pt.rating > 0 && (
                          <div style={{ fontSize:11, color:GR }}>⭐ {pt.rating}</div>
                        )}
                      </div>

                      <div style={{ display:'flex', gap:8 }}>
                        {pt.phone && (
                          <a href={`tel:${pt.phone}`}
                            style={{ flex:1, display:'flex', alignItems:'center',
                              justifyContent:'center', gap:6, padding:'9px 0',
                              backgroundColor:'#F0FDF4', color:'#16A34A',
                              borderRadius:10, textDecoration:'none',
                              fontSize:12, fontWeight:700 }}>
                            {t('pickup_points.call_button')}
                          </a>
                        )}
                        <button onClick={() => onNavigate('SellerShipment')}
                          style={{ flex:1, backgroundColor:B, color:WH, border:'none',
                            borderRadius:10, padding:'9px 0', cursor:'pointer',
                            fontSize:12, fontWeight:700 }}>
                          {t('pickup_points.send_here_button')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── MY PICKUP POINTS TAB (agents) ── */}
        {tab === 'mine' && isAgent && (
          <>
            <div style={{ display:'flex', justifyContent:'space-between',
              alignItems:'center', marginBottom:14 }}>
              <div>
                <div style={{ fontSize:15, fontWeight:800, color:DK }}>{t('pickup_points.my_points_title')}</div>
                <div style={{ fontSize:11, color:GR, marginTop:2 }}>
                  {t('pickup_points.my_points_desc')}
                </div>
              </div>
              <button onClick={() => { setShowForm(true); setEditId(null);
                setForm({ name:'', address:'', city:'', landmark:'',
                  phone:'', openHours:'', latitude:'', longitude:'' }); }}
                style={{ backgroundColor:B, color:WH, border:'none', borderRadius:10,
                  padding:'9px 16px', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                {t('pickup_points.add_button')}
              </button>
            </div>

            {/* Add / Edit form */}
            {showForm && (
              <div style={{ backgroundColor:WH, borderRadius:16, padding:20,
                marginBottom:14, boxShadow:'0 4px 20px rgba(0,0,0,0.08)' }}>
                <div style={{ fontSize:14, fontWeight:800, color:DK, marginBottom:14 }}>
                  {editId ? t('pickup_points.edit_place_title') : t('pickup_points.new_place_title')}
                </div>
                {[
                  { key:'name',      label:t('pickup_points.field_name_label'),      ph:t('pickup_points.field_name_placeholder') },
                  { key:'address',   label:t('pickup_points.field_address_label'),       ph:t('pickup_points.field_address_placeholder') },
                  { key:'city',      label:t('pickup_points.field_city_label'),                 ph:t('pickup_points.field_city_placeholder')              },
                  { key:'landmark',  label:t('pickup_points.field_landmark_label'),       ph:t('pickup_points.field_landmark_placeholder')     },
                  { key:'phone',     label:t('pickup_points.field_phone_label'),       ph:t('pickup_points.field_phone_placeholder')                 },
                  { key:'openHours', label:t('pickup_points.field_hours_label'),     ph:t('pickup_points.field_hours_placeholder')   },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize:12, fontWeight:700, color:GR,
                      display:'block', marginBottom:4 }}>{f.label}</label>
                    <input style={inp} placeholder={f.ph}
                      value={form[f.key]}
                      onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
                  </div>
                ))}
                <div style={{ display:'flex', gap:10, marginTop:4 }}>
                  <button onClick={() => { setShowForm(false); setEditId(null); }}
                    style={{ flex:1, backgroundColor:'#F1F5F9', color:GR, border:'none',
                      borderRadius:10, padding:'12px 0', cursor:'pointer',
                      fontSize:13, fontWeight:700 }}>{t('pickup_points.close_button')}</button>
                  <button onClick={handleSave} disabled={saving}
                    style={{ flex:2, background:`linear-gradient(135deg,${B},#7C3AED)`,
                      color:WH, border:'none', borderRadius:10, padding:'12px 0',
                      cursor:saving?'not-allowed':'pointer', fontSize:13, fontWeight:800 }}>
                    {saving ? t('pickup_points.saving_button') : editId ? t('pickup_points.save_button') : t('pickup_points.register_button')}
                  </button>
                </div>
              </div>
            )}

            {myPoints.length === 0 && !showForm ? (
              <div style={{ textAlign:'center', padding:'40px 0' }}>
                <div style={{ fontSize:40, marginBottom:12 }}>📍</div>
                <div style={{ fontSize:14, fontWeight:700, color:DK, marginBottom:6 }}>
                  {t('pickup_points.no_my_points_title')}
                </div>
                <div style={{ fontSize:12, color:GR }}>
                  {t('pickup_points.no_my_points_desc')}
                </div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {myPoints.map(pt => {
                  const sc = STATUS_COLORS[pt.status] || STATUS_COLORS.active;
                  return (
                    <div key={pt.id}
                      style={{ backgroundColor:WH, borderRadius:14, padding:16,
                        boxShadow:'0 2px 8px rgba(0,0,0,0.05)',
                        border:`1px solid ${pt.status==='active'?'#DCFCE7':'#F1F5F9'}` }}>
                      <div style={{ display:'flex', justifyContent:'space-between',
                        alignItems:'flex-start', marginBottom:8 }}>
                        <div>
                          <div style={{ fontSize:14, fontWeight:800, color:DK }}>
                            {pt.name}
                          </div>
                          <div style={{ fontSize:11, color:GR, marginTop:2 }}>
                            📍 {pt.address}, {pt.city}
                          </div>
                        </div>
                        <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px',
                          borderRadius:100, backgroundColor:sc.bg, color:sc.color }}>
                          {sc.label}
                        </span>
                      </div>
                      {pt.openHours && (
                        <div style={{ fontSize:11, color:GR, marginBottom:8 }}>
                          ⏰ {pt.openHours}
                        </div>
                      )}
                      <div style={{ fontSize:11, color:GR, marginBottom:12 }}>
                        {t('pickup_points.received_parcels', { count: pt.totalPickups })}
                      </div>
                      <div style={{ display:'flex', gap:8 }}>
                        <button onClick={() => handleStatusToggle(pt)}
                          style={{ flex:1, backgroundColor:sc.bg, color:sc.color,
                            border:'none', borderRadius:8, padding:'8px 0',
                            cursor:'pointer', fontSize:12, fontWeight:700 }}>
                          {pt.status==='active' ? t('pickup_points.close_action') : t('pickup_points.open_action')}
                        </button>
                        <button onClick={() => startEdit(pt)}
                          style={{ flex:1, backgroundColor:'#EFF6FF', color:B,
                            border:'none', borderRadius:8, padding:'8px 0',
                            cursor:'pointer', fontSize:12, fontWeight:700 }}>
                          {t('pickup_points.edit_action')}
                        </button>
                        <button onClick={() => handleDelete(pt.id)}
                          style={{ backgroundColor:'#FEF2F2', color:'#DC2626',
                            border:'none', borderRadius:8, padding:'8px 12px',
                            cursor:'pointer', fontSize:12 }}>
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default PickupPoints;