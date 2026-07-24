/**
 * PickupPoints.js — Browse pickup points + Agent manages their spots
 * Place at: src/public/pages/PickupPoints.js
 */
import React, { useState, useEffect } from 'react';
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

const STATUS_COLORS = {
  active:   { bg:'#DCFCE7', color:'#16A34A', label:'🟢 Wazi'   },
  inactive: { bg:'#F1F5F9', color:GR,         label:'⚫ Imefungwa'},
  busy:     { bg:'#FEF3C7', color:'#D97706',  label:'🟡 Busy'   },
};

const PickupPoints = ({ onNavigate, isLoggedIn, onLogout, userRole, currentUser }) => {
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
      alert('Jaza sehemu zote za lazima'); return;
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
      alert(e.response?.data?.message || 'Imeshindwa');
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
    if (!window.confirm('Futa mahali hapa pa kupokelea?')) return;
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
      <BackBar onBack={() => onNavigate('back')} title="📍 Maeneo ya Kupokelea" />

      {/* Tabs */}
      <div style={{ backgroundColor:WH, borderBottom:'1px solid #F1F5F9',
        display:'flex', padding:'0 8px' }}>
        <button onClick={() => setTab('browse')}
          style={{ flex:1, padding:'12px 0', border:'none', background:'none',
            cursor:'pointer', fontSize:13, fontWeight:700,
            color: tab==='browse' ? B : GR,
            borderBottom:`2px solid ${tab==='browse' ? B : 'transparent'}` }}>
          🔍 Tafuta Karibu Nawe
        </button>
        {isAgent && (
          <button onClick={() => setTab('mine')}
            style={{ flex:1, padding:'12px 0', border:'none', background:'none',
              cursor:'pointer', fontSize:13, fontWeight:700,
              color: tab==='mine' ? B : GR,
              borderBottom:`2px solid ${tab==='mine' ? B : 'transparent'}` }}>
            📍 Maeneo Yangu
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
                placeholder="Tafuta mji — e.g. Dar es Salaam"
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
                Tafuta
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign:'center', padding:60, color:GR }}>
                <div style={{ fontSize:32, marginBottom:8 }}>📍</div>
                <div>Inatafuta...</div>
              </div>
            ) : points.length === 0 ? (
              <div style={{ textAlign:'center', padding:60 }}>
                <div style={{ fontSize:48, marginBottom:12 }}>📍</div>
                <div style={{ fontSize:15, fontWeight:800, color:DK, marginBottom:8 }}>
                  Hakuna maeneo ya kupokelea{city ? ` huko ${city}` : ''}
                </div>
                <div style={{ fontSize:13, color:GR, marginBottom:20 }}>
                  Wewe au agent wa eneo lako waweza kusajili mahali pa kupokelea
                </div>
                {isAgent && (
                  <button onClick={() => { setTab('mine'); setShowForm(true); }}
                    style={{ backgroundColor:B, color:WH, border:'none', borderRadius:12,
                      padding:'12px 24px', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                    + Sajili Mahali Pako
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <div style={{ fontSize:13, fontWeight:700, color:DK, marginBottom:4 }}>
                  📍 {points.length} maeneo yanayopatikana
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
                              🏁 Karibu na: {pt.landmark}
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
                            ✅ {pt.totalPickups} zilizopokelebwa
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
                            📞 Piga Simu
                          </a>
                        )}
                        <button onClick={() => onNavigate('SellerShipment')}
                          style={{ flex:1, backgroundColor:B, color:WH, border:'none',
                            borderRadius:10, padding:'9px 0', cursor:'pointer',
                            fontSize:12, fontWeight:700 }}>
                          📦 Tuma Hapa
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
                <div style={{ fontSize:15, fontWeight:800, color:DK }}>Maeneo Yangu</div>
                <div style={{ fontSize:11, color:GR, marginTop:2 }}>
                  Wanunuzi watakupata kwa maeneo haya
                </div>
              </div>
              <button onClick={() => { setShowForm(true); setEditId(null);
                setForm({ name:'', address:'', city:'', landmark:'',
                  phone:'', openHours:'', latitude:'', longitude:'' }); }}
                style={{ backgroundColor:B, color:WH, border:'none', borderRadius:10,
                  padding:'9px 16px', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                + Ongeza
              </button>
            </div>

            {/* Add / Edit form */}
            {showForm && (
              <div style={{ backgroundColor:WH, borderRadius:16, padding:20,
                marginBottom:14, boxShadow:'0 4px 20px rgba(0,0,0,0.08)' }}>
                <div style={{ fontSize:14, fontWeight:800, color:DK, marginBottom:14 }}>
                  {editId ? '✏️ Hariri Mahali' : '+ Mahali Jipya pa Kupokelea'}
                </div>
                {[
                  { key:'name',      label:'Jina la Mahali *',      ph:'e.g. KenteXa Pickup — Kariakoo' },
                  { key:'address',   label:'Anwani Kamili *',       ph:'e.g. Lindi St, karibu na stendi' },
                  { key:'city',      label:'Mji *',                 ph:'e.g. Dar es Salaam'              },
                  { key:'landmark',  label:'Alama ya Jirani',       ph:'e.g. Karibu na Total petrol'     },
                  { key:'phone',     label:'Nambari ya Simu',       ph:'e.g. 0712345678'                 },
                  { key:'openHours', label:'Masaa ya Kufungua',     ph:'e.g. Jumatatu-Ijumaa 8am-6pm'   },
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
                      fontSize:13, fontWeight:700 }}>Funga</button>
                  <button onClick={handleSave} disabled={saving}
                    style={{ flex:2, background:`linear-gradient(135deg,${B},#7C3AED)`,
                      color:WH, border:'none', borderRadius:10, padding:'12px 0',
                      cursor:saving?'not-allowed':'pointer', fontSize:13, fontWeight:800 }}>
                    {saving ? '⏳...' : editId ? '💾 Hifadhi' : '✅ Sajili'}
                  </button>
                </div>
              </div>
            )}

            {myPoints.length === 0 && !showForm ? (
              <div style={{ textAlign:'center', padding:'40px 0' }}>
                <div style={{ fontSize:40, marginBottom:12 }}>📍</div>
                <div style={{ fontSize:14, fontWeight:700, color:DK, marginBottom:6 }}>
                  Bado huna maeneo ya kupokelea
                </div>
                <div style={{ fontSize:12, color:GR }}>
                  Ongeza mahali pako ili wanunuzi wakupate
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
                        ✅ Nimepokea vifurushi {pt.totalPickups}
                      </div>
                      <div style={{ display:'flex', gap:8 }}>
                        <button onClick={() => handleStatusToggle(pt)}
                          style={{ flex:1, backgroundColor:sc.bg, color:sc.color,
                            border:'none', borderRadius:8, padding:'8px 0',
                            cursor:'pointer', fontSize:12, fontWeight:700 }}>
                          {pt.status==='active' ? '⏸ Funga' : '▶ Fungua'}
                        </button>
                        <button onClick={() => startEdit(pt)}
                          style={{ flex:1, backgroundColor:'#EFF6FF', color:B,
                            border:'none', borderRadius:8, padding:'8px 0',
                            cursor:'pointer', fontSize:12, fontWeight:700 }}>
                          ✏️ Hariri
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