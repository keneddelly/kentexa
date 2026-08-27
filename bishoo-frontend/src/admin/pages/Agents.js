import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

const STATUS_STYLE = {
  pending:   { bg: '#fef9c3', color: '#ca8a04', label: '⏳ Inasubiri',     dot: '#ca8a04' },
  approved:  { bg: '#dcfce7', color: '#16a34a', label: '✅ Ameidhinishwa', dot: '#16a34a' },
  rejected:  { bg: '#fee2e2', color: '#dc2626', label: '❌ Alikataliwa',   dot: '#dc2626' },
  suspended: { bg: '#f1f5f9', color: '#64748b', label: '🚫 Imesimamishwa', dot: '#64748b' },
};

const TIER_LABEL = { basic: '🥉 Basic', silver: '🥈 Silver', gold: '🥇 Gold' };

const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box',
};

const Agents = ({ onNavigate }) => {
  const [agents, setAgents]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [message, setMessage]       = useState('');
  const [selected, setSelected]     = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [filterStatus, setFilterStatus]   = useState('all');
  const [filterCity, setFilterCity]       = useState('');
  const [search, setSearch]               = useState('');
  const [rejectReason, setRejectReason]   = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showEditModal, setShowEditModal]     = useState(false);
  const [editForm, setEditForm] = useState({
    commissionRate: '', deliveryCommission: '',
    collectionFeeUrban: '', collectionFeeRural: '',
    tier: '', city: '',
  });

  useEffect(() => { fetchAgents(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAgents = async () => {
    try {
      setLoading(true);
      const res = await api.get('/agents/admin/all');
      setAgents(res.data || []);
    } catch { setError('Imeshindwa kupakia mawakala'); }
    finally { setLoading(false); }
  };

  const handleApprove = async (id) => {
    try {
      setActionLoading(true); setError(''); setMessage('');
      await api.patch(`/agents/${id}/approve`);
      setMessage('Wakala ameidhinishwa! SMS imetumwa.');
      setSelected(null);
      fetchAgents();
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kuidhinisha');
    } finally { setActionLoading(false); }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) { setError('Weka sababu ya kukataa'); return; }
    try {
      setActionLoading(true); setError('');
      await api.patch(`/agents/${selected.id}/reject`, { reason: rejectReason });
      setMessage('Ombi limekataliwa. SMS imetumwa kwa wakala.');
      setSelected(null); setShowRejectModal(false); setRejectReason('');
      fetchAgents();
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kukataa');
    } finally { setActionLoading(false); }
  };

  const handleSuspend = async (id) => {
    if (!window.confirm('Simamisha wakala huyu?')) return;
    try {
      setActionLoading(true);
      await api.patch(`/agents/${id}/suspend`);
      setMessage('Wakala amesimamishwa.');
      setSelected(null);
      fetchAgents();
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kusimamisha');
    } finally { setActionLoading(false); }
  };

  const handleReactivate = async (id) => {
    try {
      setActionLoading(true);
      await api.patch(`/agents/${id}/approve`);
      setMessage('Wakala ameanzishwa tena.');
      setSelected(null);
      fetchAgents();
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kuanzisha');
    } finally { setActionLoading(false); }
  };

  const handleSaveEdit = async () => {
    try {
      setActionLoading(true); setError('');
      await api.patch(`/agents/${selected.id}/settings`, {
        commissionRate:      Number(editForm.commissionRate) || undefined,
        deliveryCommission:  Number(editForm.deliveryCommission) || undefined,
        collectionFeeUrban:  Number(editForm.collectionFeeUrban) || undefined,
        collectionFeeRural:  Number(editForm.collectionFeeRural) || undefined,
        tier:                editForm.tier || undefined,
        city:                editForm.city || undefined,
      });
      setMessage('Mipangilio imehifadhiwa.');
      setShowEditModal(false);
      fetchAgents();
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kuhifadhi');
    } finally { setActionLoading(false); }
  };

  const openEdit = (agent) => {
    setEditForm({
      commissionRate:     String(agent.commissionRate || 2.5),
      deliveryCommission: String(agent.deliveryCommission || 500),
      collectionFeeUrban: String(agent.collectionFeeUrban || 1500),
      collectionFeeRural: String(agent.collectionFeeRural || 3000),
      tier:               agent.tier || 'basic',
      city:               agent.city || '',
    });
    setShowEditModal(true);
  };

  // Counts per status
  const counts = agents.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {});

  const cities = [...new Set(agents.map(a => a.city).filter(Boolean))].sort();

  const filtered = agents.filter(a => {
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    if (filterCity && a.city !== filterCity) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!a.fullName?.toLowerCase().includes(q) &&
          !a.phone?.includes(q) &&
          !a.agentCode?.toLowerCase().includes(q) &&
          !a.city?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar onNavigate={onNavigate} activeItem="Agents" />
      {/* marginLeft was missing — the sidebar is position:fixed (no layout
          space of its own), so without this the left 250px of content sat
          directly underneath it, hidden, on every screen size. */}
      <div className="admin-content" style={{ flex: 1, padding: 24, marginLeft: 250, boxSizing: 'border-box' }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', margin: 0 }}>🤝 Mawakala wa KenteXa</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
            Idhinisha, simamia, na weka mipangilio ya mawakala wa mitaa
          </p>
        </div>

        {/* Alerts */}
        {error   && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13 }}>❌ {error}</div>}
        {message && <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, fontWeight: 600 }}>✅ {message}</div>}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Wote',           value: agents.length,           color: '#1d4ed8', bg: '#dbeafe' },
            { label: 'Wanasubiri',     value: counts.pending   || 0,   color: '#ca8a04', bg: '#fef9c3' },
            { label: 'Wanaofanya kazi', value: counts.approved  || 0,  color: '#16a34a', bg: '#dcfce7' },
            { label: 'Waliositamishwa', value: counts.suspended || 0,  color: '#dc2626', bg: '#fee2e2' },
          ].map(s => (
            <div key={s.label} style={{ backgroundColor: s.bg, borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: s.color, fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Pending alert */}
        {(counts.pending || 0) > 0 && (
          <div style={{ backgroundColor: '#fff7ed', border: '2px solid #fed7aa', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#c2410c', fontWeight: 700 }}>
              ⚠️ Kuna maombi {counts.pending} yanayosubiri idhini yako
            </span>
            <button onClick={() => setFilterStatus('pending')}
              style={{ backgroundColor: '#c2410c', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              Angalia Sasa
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 20 }}>
          {/* Agent list */}
          <div style={{ flex: 1 }}>
            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <input placeholder="🔍 Tafuta jina, simu, msimbo, mji..."
                value={search} onChange={e => setSearch(e.target.value)}
                style={{ ...inputStyle, flex: 1, minWidth: 200 }} />
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                style={{ ...inputStyle, width: 160 }}>
                <option value="all">Hali zote</option>
                <option value="pending">Wanasubiri</option>
                <option value="approved">Wameidhinishwa</option>
                <option value="rejected">Walikataliwa</option>
                <option value="suspended">Waliositamishwa</option>
              </select>
              <select value={filterCity} onChange={e => setFilterCity(e.target.value)}
                style={{ ...inputStyle, width: 160 }}>
                <option value="">Miji yote</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center' }}>
                {filtered.length} wakala
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳ Inapakia...</div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🤝</div>
                <div>Hakuna mawakala wanaolingana</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filtered.map(agent => {
                  const st = STATUS_STYLE[agent.status] || STATUS_STYLE.pending;
                  const isSelected = selected?.id === agent.id;
                  return (
                    <div key={agent.id}
                      onClick={() => setSelected(isSelected ? null : agent)}
                      style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, cursor: 'pointer',
                        boxShadow: isSelected ? '0 0 0 2px #1d4ed8' : '0 2px 8px rgba(0,0,0,0.06)',
                        border: isSelected ? '2px solid #1d4ed8' : '2px solid transparent' }}>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{agent.fullName}</span>
                            {agent.agentCode && (
                              <span style={{ fontSize: 10, fontFamily: 'monospace', backgroundColor: '#f1f5f9', color: '#64748b', padding: '2px 6px', borderRadius: 4 }}>
                                {agent.agentCode}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>
                            📞 {agent.phone || '—'} · 📍 {agent.city || agent.district || '—'}
                          </div>
                          {agent.idNumber && (
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                              🪪 {agent.idType || 'ID'}: {agent.idNumber}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, backgroundColor: st.bg, color: st.color }}>
                            {st.label}
                          </span>
                          {agent.tier && (
                            <span style={{ fontSize: 10, color: '#94a3b8' }}>{TIER_LABEL[agent.tier]}</span>
                          )}
                        </div>
                      </div>

                      {/* Mini stats */}
                      {agent.status === 'approved' && (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                            {[
                              { l: 'Zimefishwa', v: agent.totalDeliveriesCompleted || 0, c: '#1d4ed8' },
                              { l: 'Makusanyo',  v: agent.totalCollectionsCompleted || 0, c: '#7c3aed' },
                              { l: 'Rating',     v: agent.rating ? `${Number(agent.rating).toFixed(1)}⭐` : '5.0⭐', c: '#f59e0b' },
                              { l: 'Mapato',     v: `TZS ${Number(agent.totalEarnings || 0).toLocaleString()}`, c: '#16a34a' },
                            ].map(s => (
                              <div key={s.l} style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                                <div style={{ fontSize: 13, fontWeight: 800, color: s.c }}>{s.v}</div>
                                <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600 }}>{s.l}</div>
                              </div>
                            ))}
                          </div>

                          {/* Earnings breakdown */}
                          <div style={{ backgroundColor: '#f0fdf4', borderRadius: 10, padding: 12, marginTop: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', marginBottom: 8 }}>💰 Mgawanyo wa Mapato</div>
                            {[
                              { label: 'Utoaji wa Bidhaa', value: agent.totalEarningsDeliveries || 0, icon: '🏍️' },
                              { label: 'Ukusanyaji wa Malipo', value: agent.totalEarningsPayments || 0, icon: '💳' },
                              { label: 'Ukusanyaji wa Bidhaa', value: agent.totalEarningsCollections || 0, icon: '📦' },
                              { label: 'Inayosubiri Kulipwa', value: agent.pendingEarnings || 0, icon: '⏳' },
                            ].map(e => (
                              <div key={e.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #dcfce7' }}>
                                <span style={{ fontSize: 11, color: '#475569' }}>{e.icon} {e.label}</span>
                                <span style={{ fontSize: 12, fontWeight: 800, color: '#16a34a' }}>TZS {Number(e.value).toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Action panel */}
          {selected && (
            <div style={{ width: 280, flexShrink: 0 }}>
              <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', position: 'sticky', top: 24 }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#1e293b', marginBottom: 4 }}>{selected.fullName}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
                  📍 {selected.city || selected.district || '—'} · {selected.phone}
                </div>

                {/* ID info */}
                {selected.idNumber && (
                  <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>🪪 KITAMBULISHO</div>
                    <div style={{ fontSize: 12, color: '#1e293b' }}>{selected.idType}: {selected.idNumber}</div>
                    {selected.idPhotoUrl && (
                      <a href={selected.idPhotoUrl} target="_blank" rel="noreferrer"
                        style={{ fontSize: 11, color: '#1d4ed8', display: 'block', marginTop: 4 }}>
                        📷 Angalia picha ya ID
                      </a>
                    )}
                  </div>
                )}

                {/* Address */}
                {selected.address && (
                  <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 2 }}>📍 ANWANI</div>
                    <div style={{ fontSize: 12, color: '#1e293b' }}>{selected.address}</div>
                  </div>
                )}

                {/* Settings preview */}
                <div style={{ backgroundColor: '#eff6ff', borderRadius: 10, padding: '10px 12px', marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: '#1d4ed8', fontWeight: 700, marginBottom: 6 }}>⚙️ MIPANGILIO</div>
                  {[
                    ['Kamisheni (Malipo)', `${selected.commissionRate || 2.5}%`],
                    ['Ada ya Uwasilishaji', `TZS ${Number(selected.deliveryCommission || 500).toLocaleString()}`],
                    ['Ukusanyaji Mjini', `TZS ${Number(selected.collectionFeeUrban || 1500).toLocaleString()}`],
                    ['Ukusanyaji Vijijini', `TZS ${Number(selected.collectionFeeRural || 3000).toLocaleString()}`],
                  ].map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: '#64748b' }}>{l}</span>
                      <span style={{ fontWeight: 700, color: '#1d4ed8' }}>{v}</span>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                  {/* Pending — show Approve + Reject */}
                  {selected.status === 'pending' && (
                    <>
                      <button onClick={() => handleApprove(selected.id)} disabled={actionLoading}
                        style={{ width: '100%', background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                        {actionLoading ? '⏳' : '✅ Idhinisha Wakala'}
                      </button>
                      <button onClick={() => { setShowRejectModal(true); setError(''); }} disabled={actionLoading}
                        style={{ width: '100%', backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                        ❌ Kataa Ombi
                      </button>
                    </>
                  )}

                  {/* Approved — show Suspend + Edit */}
                  {selected.status === 'approved' && (
                    <button onClick={() => handleSuspend(selected.id)} disabled={actionLoading}
                      style={{ width: '100%', backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', padding: 12, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                      🚫 Simamisha
                    </button>
                  )}

                  {/* Suspended/Rejected — show Reactivate */}
                  {(selected.status === 'suspended' || selected.status === 'rejected') && (
                    <button onClick={() => handleReactivate(selected.id)} disabled={actionLoading}
                      style={{ width: '100%', background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                      🔄 Anza Tena
                    </button>
                  )}

                  {/* Edit settings — always */}
                  <button onClick={() => openEdit(selected)} disabled={actionLoading}
                    style={{ width: '100%', backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: 12, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                    ⚙️ Badilisha Mipangilio
                  </button>

                  <button onClick={() => setSelected(null)}
                    style={{ width: '100%', backgroundColor: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', padding: 10, borderRadius: 10, cursor: 'pointer', fontSize: 12 }}>
                    Funga
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Reject modal */}
        {showRejectModal && selected && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
            <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 420 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#dc2626', margin: '0 0 6px' }}>❌ Kataa Ombi</h3>
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
                Ombi la <strong>{selected.fullName}</strong> litakataliwa. SMS itumwe nao.
              </p>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>
                Sababu ya Kukataa *
              </label>
              <textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                placeholder="e.g. Picha ya kitambulisho haionekani vizuri. Tuma upya picha iliyo wazi."
                style={{ ...inputStyle, resize: 'vertical', marginBottom: 16 }} />
              {error && <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 10 }}>❌ {error}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={handleReject} disabled={actionLoading}
                  style={{ flex: 1, backgroundColor: '#dc2626', color: '#fff', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                  {actionLoading ? '⏳' : 'Kataa'}
                </button>
                <button onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                  style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#64748b' }}>
                  Ghairi
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit settings modal */}
        {showEditModal && selected && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
            <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 420 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', margin: '0 0 16px' }}>
                ⚙️ Mipangilio — {selected.fullName}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: 'Mji', key: 'city', placeholder: 'e.g. Dar es Salaam', type: 'text' },
                  { label: 'Ngazi', key: 'tier', placeholder: '', type: 'select', options: ['basic','silver','gold'] },
                  { label: 'Kamisheni % (Malipo ya Mteja)', key: 'commissionRate', placeholder: '2.5', type: 'number' },
                  { label: 'Ada ya Uwasilishaji (TZS/kifurushi)', key: 'deliveryCommission', placeholder: '500', type: 'number' },
                  { label: 'Ada Ukusanyaji Mjini (TZS)', key: 'collectionFeeUrban', placeholder: '1500', type: 'number' },
                  { label: 'Ada Ukusanyaji Vijijini (TZS)', key: 'collectionFeeRural', placeholder: '3000', type: 'number' },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>{f.label}</label>
                    {f.type === 'select' ? (
                      <select value={editForm[f.key]} onChange={e => setEditForm(ef => ({ ...ef, [f.key]: e.target.value }))} style={inputStyle}>
                        {f.options.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
                      </select>
                    ) : (
                      <input type={f.type} value={editForm[f.key]} placeholder={f.placeholder}
                        onChange={e => setEditForm(ef => ({ ...ef, [f.key]: e.target.value }))} style={inputStyle} />
                    )}
                  </div>
                ))}
              </div>
              {error && <div style={{ fontSize: 12, color: '#dc2626', margin: '10px 0' }}>❌ {error}</div>}
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button onClick={handleSaveEdit} disabled={actionLoading}
                  style={{ flex: 1, background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                  {actionLoading ? '⏳' : '💾 Hifadhi'}
                </button>
                <button onClick={() => setShowEditModal(false)}
                  style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#64748b' }}>
                  Ghairi
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Agents;