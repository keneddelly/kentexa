/**
 * HubAdmin.js — Admin assigns super agents to hubs/cities
 * Place at: src/admin/pages/HubAdmin.js
 */
import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import api     from '../../api/api';

const STATUS = {
  approved: { bg:'#dcfce7', text:'#16a34a', label:'✅ Imeidhinishwa' },
  pending:  { bg:'#fef3c7', text:'#d97706', label:'⏳ Inasubiri'     },
  rejected: { bg:'#fee2e2', text:'#dc2626', label:'❌ Imekataliwa'   },
};

const TZ_CITIES = [
  'Dar es Salaam','Mwanza','Arusha','Mbeya','Dodoma','Tanga',
  'Morogoro','Zanzibar','Kigoma','Shinyanga','Singida','Tabora',
  'Iringa','Mtwara','Lindi','Musoma','Bukoba','Sumbawanga',
  'Songea','Kahama','Moshi','Mara','Geita','Simiyu',
];

const inp = {
  width:'100%', padding:'9px 12px', borderRadius:8,
  border:'1px solid #e2e8f0', fontSize:13,
  boxSizing:'border-box', outline:'none', fontFamily:'inherit',
};

const HubAdmin = ({ onNavigate, activePage }) => {
  const [superAgents, setSuperAgents]   = useState([]);
  const [hubSummary,  setHubSummary]    = useState([]);
  const [selected,    setSelected]      = useState(null);
  const [loading,     setLoading]       = useState(true);
  const [saving,      setSaving]        = useState(false);
  const [filter,      setFilter]        = useState('approved');
  const [view,        setView]          = useState('map'); // 'map' | 'list'
  const [hubForm,     setHubForm]       = useState({
    hubCity: '', hubName: '', hubAddress: '', coverageZones: '',
  });

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [agRes, sumRes] = await Promise.all([
        api.get(`/super-agents/admin/super-agents?status=${filter}`),
        api.get('/super-agents/admin/hub-summary'),
      ]);
      setSuperAgents(agRes.data || []);
      setHubSummary(sumRes.data  || []);
    } catch { setSuperAgents([]); setHubSummary([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); setSelected(null); }, [filter]); // eslint-disable-line

  const handleSelect = (sa) => {
    setSelected(sa);
    setHubForm({
      hubCity:       sa.hubCity      || sa.city || '',
      hubName:       sa.hubName      || '',
      hubAddress:    sa.hubAddress   || '',
      coverageZones: (sa.coverageZones || []).join(', '),
    });
  };

  const handleAssign = async () => {
    if (!hubForm.hubCity) return alert('Chagua mji wa kituo');
    if (!hubForm.hubName) return alert('Weka jina la kituo');
    try {
      setSaving(true);
      await api.patch(`/super-agents/admin/super-agents/${selected.id}/assign-hub`, {
        hubCity:       hubForm.hubCity,
        hubName:       hubForm.hubName,
        hubAddress:    hubForm.hubAddress || undefined,
        coverageZones: hubForm.coverageZones
          ? hubForm.coverageZones.split(',').map(s => s.trim()).filter(Boolean)
          : [],
      });
      alert('✅ Kituo kimepewa!');
      setSelected(null);
      fetchAll();
    } catch (e) {
      alert('Imeshindwa: ' + (e.response?.data?.message || 'Jaribu tena'));
    } finally { setSaving(false); }
  };

  return (
    <div style={{ display:'flex', minHeight:'100vh', backgroundColor:'#f1f5f9' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} />
      <div style={{ flex:1, padding:24, overflow:'auto' }}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between',
          alignItems:'center', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:20, fontWeight:900, color:'#1e293b' }}>
              🏢 Usimamizi wa Vituo
            </div>
            <div style={{ fontSize:12, color:'#64748b' }}>
              Panga Super Agents katika miji na vituo maalum
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setView('map')}
              style={{ padding:'7px 14px', borderRadius:8, border:'none',
                cursor:'pointer', fontSize:12, fontWeight:700,
                backgroundColor: view==='map' ? '#1d4ed8' : '#fff',
                color: view==='map' ? '#fff' : '#64748b',
                boxShadow:'0 1px 4px rgba(0,0,0,0.08)' }}>
              🗺️ Ramani ya Miji
            </button>
            <button onClick={() => setView('list')}
              style={{ padding:'7px 14px', borderRadius:8, border:'none',
                cursor:'pointer', fontSize:12, fontWeight:700,
                backgroundColor: view==='list' ? '#1d4ed8' : '#fff',
                color: view==='list' ? '#fff' : '#64748b',
                boxShadow:'0 1px 4px rgba(0,0,0,0.08)' }}>
              📋 Orodha
            </button>
          </div>
        </div>

        {/* Hub summary cards */}
        {view === 'map' && (
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:14, fontWeight:800, color:'#1e293b', marginBottom:12 }}>
              📍 Vituo vilivyopewa
            </div>
            <div style={{ display:'grid',
              gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
              {hubSummary.length === 0 ? (
                <div style={{ gridColumn:'1/-1', textAlign:'center', padding:40,
                  backgroundColor:'#fff', borderRadius:14, color:'#94a3b8' }}>
                  <div style={{ fontSize:40, marginBottom:8 }}>🏢</div>
                  <div>Bado hakuna vituo vilivyopewa</div>
                </div>
              ) : hubSummary.map(h => (
                <div key={h.city} style={{ backgroundColor:'#fff', borderRadius:14,
                  padding:16, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize:13, fontWeight:800, color:'#1e293b', marginBottom:4 }}>
                    📍 {h.city}
                  </div>
                  <div style={{ fontSize:22, fontWeight:900, color:'#1d4ed8',
                    marginBottom:8 }}>{h.count}</div>
                  <div style={{ fontSize:11, color:'#64748b' }}>Super Agent{h.count!==1?'s':''}</div>
                  {h.agents.slice(0,2).map(a => (
                    <div key={a.id} style={{ fontSize:11, color:'#475569',
                      marginTop:4, padding:'3px 0',
                      borderTop:'1px solid #f1f5f9' }}>
                      {a.name} — {a.hubName}
                    </div>
                  ))}
                </div>
              ))}

              {/* Cities without super agents */}
              {TZ_CITIES.filter(c => !hubSummary.find(h => h.city === c)).map(c => (
                <div key={c} style={{ backgroundColor:'#f8fafc', borderRadius:14,
                  padding:16, border:'1.5px dashed #e2e8f0' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#94a3b8', marginBottom:4 }}>
                    📍 {c}
                  </div>
                  <div style={{ fontSize:11, color:'#cbd5e1' }}>Hakuna Super Agent</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* List view */}
        {view === 'list' && (
          <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>

            {/* Super agents list */}
            <div style={{ flex:1, minWidth:0 }}>
              {/* Filter tabs */}
              <div style={{ display:'flex', gap:8, marginBottom:14 }}>
                {Object.entries(STATUS).map(([k, s]) => (
                  <button key={k} onClick={() => setFilter(k)}
                    style={{ padding:'6px 12px', borderRadius:8, border:'none',
                      cursor:'pointer', fontSize:12, fontWeight:700,
                      backgroundColor: filter===k ? '#1d4ed8' : '#fff',
                      color: filter===k ? '#fff' : '#64748b' }}>
                    {s.label}
                  </button>
                ))}
              </div>

              {loading ? (
                <div style={{ textAlign:'center', padding:40, color:'#94a3b8' }}>Inapakia...</div>
              ) : superAgents.length === 0 ? (
                <div style={{ textAlign:'center', padding:60, backgroundColor:'#fff',
                  borderRadius:16, color:'#94a3b8' }}>
                  <div style={{ fontSize:40, marginBottom:8 }}>👤</div>
                  <div>Hakuna Super Agents</div>
                </div>
              ) : superAgents.map(sa => {
                const sc = STATUS[sa.status] || STATUS.pending;
                const hasHub = !!(sa.hubCity);
                return (
                  <div key={sa.id} onClick={() => handleSelect(sa)}
                    style={{ backgroundColor:'#fff', borderRadius:14, padding:16,
                      marginBottom:10, cursor:'pointer',
                      border: selected?.id===sa.id ? '2px solid #1d4ed8' : '2px solid transparent',
                      boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between',
                      alignItems:'flex-start' }}>
                      <div>
                        <div style={{ fontSize:14, fontWeight:800, color:'#1e293b' }}>
                          {sa.businessName || sa.user?.name || '—'}
                        </div>
                        <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>
                          📍 {sa.city} · {sa.user?.phone}
                        </div>
                        {hasHub ? (
                          <div style={{ fontSize:11, marginTop:4, color:'#16a34a', fontWeight:700 }}>
                            🏢 {sa.hubName} — {sa.hubCity}
                          </div>
                        ) : (
                          <div style={{ fontSize:11, marginTop:4, color:'#d97706' }}>
                            ⚠️ Kituo hakijapewa
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px',
                        borderRadius:100, backgroundColor:sc.bg, color:sc.text }}>
                        {sc.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Assignment panel */}
            {selected && (
              <div style={{ width:340, flexShrink:0, backgroundColor:'#fff',
                borderRadius:16, boxShadow:'0 4px 20px rgba(0,0,0,0.08)',
                overflow:'hidden' }}>
                <div style={{ background:'linear-gradient(135deg,#1e1b4b,#1d4ed8)',
                  padding:'16px 20px', color:'#fff' }}>
                  <div style={{ display:'flex', justifyContent:'space-between' }}>
                    <div style={{ fontSize:15, fontWeight:900 }}>🏢 Pewa Kituo</div>
                    <button onClick={() => setSelected(null)}
                      style={{ background:'rgba(255,255,255,0.2)', border:'none',
                        color:'#fff', borderRadius:6, padding:'4px 10px',
                        cursor:'pointer' }}>✕</button>
                  </div>
                  <div style={{ fontSize:13, color:'rgba(255,255,255,0.7)', marginTop:4 }}>
                    {selected.businessName || selected.user?.name}
                  </div>
                </div>

                <div style={{ padding:20 }}>
                  {/* Hub city */}
                  <div style={{ marginBottom:12 }}>
                    <label style={{ fontSize:12, fontWeight:700, color:'#64748b',
                      display:'block', marginBottom:6 }}>Mji wa Kituo *</label>
                    <select value={hubForm.hubCity}
                      onChange={e => setHubForm(f => ({ ...f, hubCity: e.target.value }))}
                      style={inp}>
                      <option value="">-- Chagua Mji --</option>
                      {TZ_CITIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  {/* Hub name */}
                  <div style={{ marginBottom:12 }}>
                    <label style={{ fontSize:12, fontWeight:700, color:'#64748b',
                      display:'block', marginBottom:6 }}>Jina la Kituo *</label>
                    <input style={inp} value={hubForm.hubName}
                      placeholder="e.g. KenteXa Hub Kariakoo"
                      onChange={e => setHubForm(f => ({ ...f, hubName: e.target.value }))} />
                  </div>

                  {/* Hub address */}
                  <div style={{ marginBottom:12 }}>
                    <label style={{ fontSize:12, fontWeight:700, color:'#64748b',
                      display:'block', marginBottom:6 }}>Anwani</label>
                    <input style={inp} value={hubForm.hubAddress}
                      placeholder="e.g. Kariakoo, Barabara ya Msimbazi"
                      onChange={e => setHubForm(f => ({ ...f, hubAddress: e.target.value }))} />
                  </div>

                  {/* Coverage zones */}
                  <div style={{ marginBottom:20 }}>
                    <label style={{ fontSize:12, fontWeight:700, color:'#64748b',
                      display:'block', marginBottom:6 }}>
                      Maeneo Yanayofunikwa (tenganisha kwa koma)
                    </label>
                    <input style={inp} value={hubForm.coverageZones}
                      placeholder="e.g. Kariakoo, Gerezani, Kisutu"
                      onChange={e => setHubForm(f => ({ ...f, coverageZones: e.target.value }))} />
                  </div>

                  <button onClick={handleAssign} disabled={saving}
                    style={{ width:'100%',
                      background:'linear-gradient(135deg,#1d4ed8,#7c3aed)',
                      color:'#fff', border:'none', borderRadius:10, padding:'12px 0',
                      cursor:saving?'not-allowed':'pointer',
                      fontSize:14, fontWeight:800 }}>
                    {saving ? '⏳ Inahifadhi...' : '✅ Hifadhi Kituo'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default HubAdmin;