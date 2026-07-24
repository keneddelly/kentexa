/**
 * SellerTeam.js — Seller invites and manages staff
 * Place at: src/public/pages/SellerTeam.js
 *
 * Roles: Sales · Customer Support · Inventory · Delivery
 * Each role has preset permissions the seller can customise
 */
import React, { useState, useEffect } from 'react';
import Navbar   from '../components/Navbar';
import BackBar  from '../components/BackBar';
import Footer   from '../components/Footer';
import api      from '../../api/api';

const ROLES = [
  { value: 'sales',            label: '🛒 Mauzo',          desc: 'Inaweza kuona na kuunda maagizo' },
  { value: 'customer_support', label: '💬 Msaada wa Wateja', desc: 'Inaweza kuwasiliana na wateja' },
  { value: 'inventory',        label: '📦 Ghala',           desc: 'Inaweza kusimamia bidhaa' },
  { value: 'delivery',         label: '🏍️ Utoaji',         desc: 'Inaweza kutoa na kuthibitisha' },
];

const PERMS = [
  { key: 'canViewOrders',     label: 'Ona Maagizo'         },
  { key: 'canCreateOrders',   label: 'Unda Maagizo'        },
  { key: 'canViewCustomers',  label: 'Ona Wateja'          },
  { key: 'canSendMessages',   label: 'Tuma Ujumbe'         },
  { key: 'canViewRevenue',    label: 'Ona Mapato'          },
  { key: 'canManageProducts', label: 'Simamia Bidhaa'      },
  { key: 'canManageTeam',     label: 'Simamia Timu'        },
];

const ROLE_DEFAULTS = {
  sales:            { canViewOrders:true, canCreateOrders:true, canViewCustomers:true, canSendMessages:true },
  customer_support: { canViewOrders:true, canViewCustomers:true, canSendMessages:true },
  inventory:        { canViewOrders:true, canManageProducts:true },
  delivery:         { canViewOrders:true, canViewCustomers:true },
};

const inp = {
  width:'100%', padding:'11px 14px', borderRadius:10,
  border:'1.5px solid #e2e8f0', fontSize:14,
  boxSizing:'border-box', outline:'none', fontFamily:'inherit',
};

const SellerTeam = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const [members,    setMembers]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  const [editId,     setEditId]     = useState(null);

  const [form, setForm] = useState({
    phone: '', role: 'sales', permissions: { ...ROLE_DEFAULTS.sales },
  });

  const fetchMembers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/seller/team');
      setMembers(res.data || []);
    } catch { setMembers([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchMembers(); }, []);

  const setRole = (role) => {
    setForm(f => ({ ...f, role, permissions: { ...(ROLE_DEFAULTS[role] || {}) } }));
  };

  const togglePerm = (key) => {
    setForm(f => ({ ...f, permissions: { ...f.permissions, [key]: !f.permissions[key] } }));
  };

  const handleInvite = async () => {
    if (!form.phone.trim()) return setError('Weka nambari ya simu');
    try {
      setSaving(true); setError('');
      await api.post('/seller/team/invite', form);
      setShowInvite(false);
      setForm({ phone: '', role: 'sales', permissions: { ...ROLE_DEFAULTS.sales } });
      fetchMembers();
    } catch (e) {
      setError(e.response?.data?.message || 'Imeshindwa. Jaribu tena.');
    } finally { setSaving(false); }
  };

  const handleRemove = async (id, name) => {
    if (!window.confirm(`Ondoa ${name} kwenye timu?`)) return;
    try {
      await api.delete(`/seller/team/${id}`);
      fetchMembers();
    } catch { alert('Imeshindwa'); }
  };

  const handleToggleActive = async (id, current) => {
    try {
      await api.patch(`/seller/team/${id}`, { isActive: !current });
      fetchMembers();
    } catch { alert('Imeshindwa'); }
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', backgroundColor:'#f1f5f9' }}>
      <Navbar currentPage="SellerTeam" onNavigate={onNavigate}
        isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => onNavigate('SellerDashboard')} title="👥 Timu Yangu" />

      <div style={{ flex:1, padding:'16px 16px 40px', maxWidth:720,
        margin:'0 auto', width:'100%', boxSizing:'border-box' }}>

        {/* Hero card */}
        <div style={{ background:'linear-gradient(135deg,#1e1b4b,#1d4ed8)',
          borderRadius:20, padding:'24px 28px', marginBottom:20, color:'#fff' }}>
          <div style={{ fontSize:18, fontWeight:900, marginBottom:6 }}>
            👥 Timu ya Biashara
          </div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)', marginBottom:20, lineHeight:1.6 }}>
            Ongeza wafanyakazi, weka majukumu na ruhusa.
            Kila mwanachama ataona tu sehemu unayomruhusu.
          </div>
          <button onClick={() => setShowInvite(true)}
            style={{ backgroundColor:'#fff', color:'#1d4ed8', border:'none',
              borderRadius:10, padding:'10px 22px', cursor:'pointer',
              fontSize:14, fontWeight:800 }}>
            + Ongeza Mwanachama
          </button>
        </div>

        {/* Invite form */}
        {showInvite && (
          <div style={{ backgroundColor:'#fff', borderRadius:16, padding:24,
            marginBottom:20, boxShadow:'0 4px 20px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize:16, fontWeight:900, color:'#1e293b', marginBottom:16 }}>
              ➕ Ongeza Mwanachama Mpya
            </div>

            {error && (
              <div style={{ backgroundColor:'#fee2e2', color:'#dc2626',
                borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:13 }}>
                {error}
              </div>
            )}

            {/* Phone */}
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block', fontSize:13, fontWeight:700,
                color:'#64748b', marginBottom:6 }}>
                Nambari ya Simu *
              </label>
              <input style={inp} type="tel" value={form.phone}
                placeholder="0788 000 000 — lazima awe na akaunti ya KenteXa"
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>

            {/* Role selection */}
            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block', fontSize:13, fontWeight:700,
                color:'#64748b', marginBottom:8 }}>
                Jukumu
              </label>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8 }}>
                {ROLES.map(r => (
                  <label key={r.value}
                    style={{ display:'flex', alignItems:'flex-start', gap:10,
                      padding:'12px 14px', borderRadius:10, cursor:'pointer',
                      border:`2px solid ${form.role === r.value ? '#1d4ed8' : '#e2e8f0'}`,
                      backgroundColor: form.role === r.value ? '#eff6ff' : '#fff' }}>
                    <input type="radio" name="role" value={r.value}
                      checked={form.role === r.value}
                      onChange={() => setRole(r.value)}
                      style={{ marginTop:2, flexShrink:0 }} />
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:'#1e293b' }}>{r.label}</div>
                      <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>{r.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Permissions */}
            <div style={{ marginBottom:20 }}>
              <label style={{ display:'block', fontSize:13, fontWeight:700,
                color:'#64748b', marginBottom:8 }}>
                Ruhusa
              </label>
              <div style={{ backgroundColor:'#f8fafc', borderRadius:12, padding:14 }}>
                {PERMS.map(p => (
                  <label key={p.key}
                    style={{ display:'flex', alignItems:'center', gap:10,
                      padding:'8px 0', cursor:'pointer',
                      borderBottom:'1px solid #f1f5f9' }}>
                    <input type="checkbox"
                      checked={!!form.permissions[p.key]}
                      onChange={() => togglePerm(p.key)}
                      style={{ width:16, height:16, flexShrink:0 }} />
                    <span style={{ fontSize:13, color:'#1e293b' }}>{p.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => { setShowInvite(false); setError(''); }}
                style={{ flex:1, backgroundColor:'#f1f5f9', color:'#64748b',
                  border:'none', borderRadius:10, padding:'12px 0',
                  cursor:'pointer', fontSize:14, fontWeight:700 }}>
                Funga
              </button>
              <button onClick={handleInvite} disabled={saving}
                style={{ flex:2, background:'linear-gradient(135deg,#1d4ed8,#7c3aed)',
                  color:'#fff', border:'none', borderRadius:10, padding:'12px 0',
                  cursor:saving?'not-allowed':'pointer', fontSize:14, fontWeight:800 }}>
                {saving ? '⏳ Inatuma...' : '✅ Ongeza Mwanachama'}
              </button>
            </div>
          </div>
        )}

        {/* Members list */}
        {loading ? (
          <div style={{ textAlign:'center', padding:40, color:'#94a3b8' }}>Inapakia timu...</div>
        ) : members.length === 0 ? (
          <div style={{ textAlign:'center', padding:60, backgroundColor:'#fff',
            borderRadius:16, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>👥</div>
            <div style={{ fontSize:16, fontWeight:800, color:'#1e293b', marginBottom:6 }}>
              Timu yako iko tupu
            </div>
            <div style={{ fontSize:13, color:'#64748b', marginBottom:20 }}>
              Ongeza wafanyakazi wa biashara yako
            </div>
            <button onClick={() => setShowInvite(true)}
              style={{ backgroundColor:'#1d4ed8', color:'#fff', border:'none',
                borderRadius:10, padding:'11px 24px', cursor:'pointer',
                fontSize:14, fontWeight:700 }}>
              + Ongeza Wa Kwanza
            </button>
          </div>
        ) : members.map(m => {
          const role = ROLES.find(r => r.value === m.role);
          const activePerm = Object.entries(m.permissions || {})
            .filter(([,v]) => v).map(([k]) => PERMS.find(p => p.key === k)?.label).filter(Boolean);
          return (
            <div key={m.id} style={{ backgroundColor:'#fff', borderRadius:14,
              padding:20, marginBottom:12,
              boxShadow:'0 2px 8px rgba(0,0,0,0.06)',
              opacity: m.isActive ? 1 : 0.6 }}>
              <div style={{ display:'flex', justifyContent:'space-between',
                alignItems:'flex-start', marginBottom:12 }}>
                <div style={{ display:'flex', gap:14, alignItems:'center' }}>
                  <div style={{ width:48, height:48, borderRadius:12, flexShrink:0,
                    background:'linear-gradient(135deg,#1d4ed8,#7c3aed)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:20, color:'#fff' }}>
                    {m.user?.name?.charAt(0)?.toUpperCase() || '👤'}
                  </div>
                  <div>
                    <div style={{ fontSize:15, fontWeight:800, color:'#1e293b' }}>
                      {m.user?.name || m.user?.phone || 'Mwanachama'}
                    </div>
                    <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>
                      {m.user?.phone} · {role?.label || m.role}
                    </div>
                    {!m.isActive && (
                      <span style={{ fontSize:10, fontWeight:700, color:'#dc2626',
                        backgroundColor:'#fee2e2', padding:'2px 8px', borderRadius:100 }}>
                        Imesimamishwa
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => handleToggleActive(m.id, m.isActive)}
                    style={{ backgroundColor: m.isActive ? '#fef3c7' : '#dcfce7',
                      color: m.isActive ? '#d97706' : '#16a34a',
                      border:'none', borderRadius:8, padding:'6px 12px',
                      cursor:'pointer', fontSize:12, fontWeight:700 }}>
                    {m.isActive ? '⏸ Simamisha' : '▶ Rudisha'}
                  </button>
                  <button onClick={() => handleRemove(m.id, m.user?.name || 'mwanachama')}
                    style={{ backgroundColor:'#fee2e2', color:'#dc2626',
                      border:'none', borderRadius:8, padding:'6px 12px',
                      cursor:'pointer', fontSize:12, fontWeight:700 }}>
                    Ondoa
                  </button>
                </div>
              </div>

              {/* Permissions chips */}
              {activePerm.length > 0 && (
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {activePerm.map(p => (
                    <span key={p} style={{ fontSize:11, fontWeight:700,
                      backgroundColor:'#eff6ff', color:'#1d4ed8',
                      padding:'3px 10px', borderRadius:100 }}>
                      ✓ {p}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Role guide */}
        <div style={{ backgroundColor:'#fff', borderRadius:14, padding:20, marginTop:8,
          boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize:13, fontWeight:800, color:'#1e293b', marginBottom:14 }}>
            📋 Mwongozo wa Majukumu
          </div>
          {ROLES.map(r => (
            <div key={r.value} style={{ display:'flex', gap:12, padding:'8px 0',
              borderBottom:'1px solid #f1f5f9' }}>
              <span style={{ fontSize:20, flexShrink:0 }}>{r.label.split(' ')[0]}</span>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:'#1e293b' }}>
                  {r.label.split(' ').slice(1).join(' ')}
                </div>
                <div style={{ fontSize:12, color:'#64748b' }}>{r.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default SellerTeam;