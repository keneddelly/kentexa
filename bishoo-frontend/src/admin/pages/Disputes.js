/**
 * Disputes.js — Admin Dispute Resolution Center
 * Place at: src/admin/pages/Disputes.js
 */
import React, { useState, useEffect } from 'react';
import api from '../../api/api';

const fmt   = n => Number(n || 0).toLocaleString();
const fmtDt = d => d ? new Date(d).toLocaleDateString('sw-TZ', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';

const STATUS_COLOR = {
  open:      { bg: '#fee2e2', text: '#dc2626', label: 'Wazi' },
  reviewing: { bg: '#fef3c7', text: '#d97706', label: 'Inakaguliwa' },
  resolved:  { bg: '#dcfce7', text: '#16a34a', label: 'Imesuluhiwa' },
  closed:    { bg: '#f1f5f9', text: '#64748b', label: 'Imefungwa' },
};

const RESOLUTION_OPTIONS = [
  { value: 'favour_buyer',  label: '👤 Uamuzi kwa Mnunuzi',  desc: 'Mrejesho — mnunuzi anapata pesa, muuzaji anapoteza escrow' },
  { value: 'favour_seller', label: '🏪 Uamuzi kwa Muuzaji',  desc: 'Malipo yatolewa — dai la mnunuzi limekataliwa' },
  { value: 'split',         label: '⚖️ Mgawanyo',             desc: 'Mrejesho wa sehemu — wote wawili wanakubaliana' },
  { value: 'withdrawn',     label: '🔙 Imeondolewa',          desc: 'Mnunuzi ameondoa dai' },
];

const Disputes = ({ onNavigate, activePage }) => {
  const [disputes,  setDisputes]  = useState([]);
  const [selected,  setSelected]  = useState(null);
  const [detail,    setDetail]    = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [detailLoad,setDetailLoad]= useState(false);
  const [filter,    setFilter]    = useState('open');
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState({ resolution: '', resolutionNote: '', refundAmount: '' });

  const fetchDisputes = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/disputes/admin/all?status=${filter}`);
      setDisputes(res.data.disputes || res.data || []);
    } catch { setDisputes([]); }
    finally { setLoading(false); }
  };

  const fetchDetail = async (id) => {
    try {
      setDetailLoad(true);
      const res = await api.get(`/disputes/admin/${id}`);
      setDetail(res.data);
    } catch { setDetail(null); }
    finally { setDetailLoad(false); }
  };

  useEffect(() => { fetchDisputes(); }, [filter]); // eslint-disable-line

  const handleSelect = (d) => {
    setSelected(d);
    setDetail(null);
    setResolution({ resolution: '', resolutionNote: '', refundAmount: '' });
    fetchDetail(d.id);
  };

  const handleResolve = async () => {
    if (!resolution.resolution) return alert('Chagua uamuzi kwanza');
    if (!resolution.resolutionNote.trim()) return alert('Andika maelezo ya uamuzi');
    try {
      setResolving(true);
      await api.patch(`/disputes/${selected.id}/resolve`, {
        resolution:     resolution.resolution,
        resolutionNote: resolution.resolutionNote,
        refundAmount:   resolution.refundAmount ? Number(resolution.refundAmount) : undefined,
      });
      alert('✅ Uamuzi umehifadhiwa');
      setSelected(null);
      setDetail(null);
      fetchDisputes();
    } catch (e) {
      alert('Imeshindwa: ' + (e.response?.data?.message || 'Jaribu tena'));
    } finally { setResolving(false); }
  };

  const handleAssign = async () => {
    try {
      await api.patch(`/disputes/${selected.id}/assign-arbitrator`);
      fetchDetail(selected.id);
    } catch { alert('Imeshindwa'); }
  };

  const inp = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => onNavigate('Dashboard')} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#64748b' }}>←</button>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>Disputes</div>
      </div>
      <div style={{ padding: 24, overflow: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#1e293b' }}>⚖️ Mashauri ya Migogoro</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Simamia na usuluhishe migogoro kati ya wanunuzi na wauzaji</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['open','reviewing','resolved','closed'].map(s => (
              <button key={s} onClick={() => { setFilter(s); setSelected(null); }}
                style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 700,
                  backgroundColor: filter === s ? '#1d4ed8' : '#fff',
                  color: filter === s ? '#fff' : '#64748b',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                {STATUS_COLOR[s]?.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

          {/* Disputes list */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Inapakia...</div>
            ) : disputes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, backgroundColor: '#fff', borderRadius: 16 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>⚖️</div>
                <div style={{ color: '#64748b' }}>Hakuna migogoro ya "{STATUS_COLOR[filter]?.label}"</div>
              </div>
            ) : disputes.map(d => {
              const sc = STATUS_COLOR[d.status] || STATUS_COLOR.open;
              const isSelected = selected?.id === d.id;
              return (
                <div key={d.id} onClick={() => handleSelect(d)}
                  style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10,
                    cursor: 'pointer', border: isSelected ? '2px solid #1d4ed8' : '2px solid transparent',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)', transition: 'border 0.15s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 100,
                          backgroundColor: sc.bg, color: sc.text }}>
                          {sc.label}
                        </span>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>#{d.id} · {fmtDt(d.createdAt)}</span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>
                        {d.order?.product?.name || d.order?.manualProductName || `Agizo #${d.orderId}`}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                        👤 {d.order?.buyer?.name || 'Mnunuzi'} → 🏪 {d.order?.seller?.storeName || 'Muuzaji'}
                      </div>
                      <div style={{ fontSize: 12, color: '#dc2626', backgroundColor: '#fee2e2',
                        borderRadius: 6, padding: '4px 8px', display: 'inline-block' }}>
                        {d.reason || d.buyerReason || 'Sababu haijatajwa'}
                      </div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: '#1e293b', textAlign: 'right' }}>
                      TZS {fmt(d.order?.totalAmount)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detail panel */}
          {selected && (
            <div style={{ width: 380, flexShrink: 0, backgroundColor: '#fff', borderRadius: 16,
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)', overflow: 'hidden' }}>

              {/* Header */}
              <div style={{ background: 'linear-gradient(135deg,#1e1b4b,#1d4ed8)', padding: '16px 20px', color: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 900 }}>⚖️ Shauri #{selected.id}</div>
                  <button onClick={() => setSelected(null)}
                    style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
                      borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 13 }}>✕</button>
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
                  {fmtDt(selected.createdAt)}
                </div>
              </div>

              <div style={{ padding: 20, maxHeight: '75vh', overflowY: 'auto' }}>
                {detailLoad ? (
                  <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Inapakia...</div>
                ) : detail ? (<>

                  {/* Order info */}
                  <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', marginBottom: 8 }}>📦 MAELEZO YA AGIZO</div>
                    {[
                      ['Bidhaa',   detail.order?.product?.name || detail.order?.manualProductName || '—'],
                      ['Kiasi',    `TZS ${fmt(detail.order?.totalAmount)}`],
                      ['Nambari',  detail.order?.trackingNumber || `#${detail.orderId}`],
                      ['Hali',     detail.order?.status || '—'],
                    ].map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0',
                        borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                        <span style={{ color: '#64748b' }}>{k}</span>
                        <span style={{ fontWeight: 700, color: '#1e293b' }}>{v}</span>
                      </div>
                    ))}
                  </div>

                  {/* Buyer claim */}
                  <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 12, marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#dc2626', marginBottom: 6 }}>
                      👤 DAI LA MNUNUZI — {detail.order?.buyer?.name || '—'} ({detail.order?.buyer?.phone || '—'})
                    </div>
                    <div style={{ fontSize: 12, color: '#1e293b', marginBottom: 6 }}>
                      {detail.reason || detail.buyerReason || 'Sababu haijatajwa'}
                    </div>
                    {detail.buyerEvidence && (
                      <img src={detail.buyerEvidence} alt="Ushahidi wa mnunuzi"
                        style={{ width: '100%', borderRadius: 8, marginTop: 6 }} />
                    )}
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                      Iliwasilishwa: {fmtDt(detail.createdAt)}
                    </div>
                  </div>

                  {/* Seller response */}
                  <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: 12, marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', marginBottom: 6 }}>
                      🏪 JIBU LA MUUZAJI — {detail.order?.seller?.storeName || detail.order?.seller?.name || '—'}
                    </div>
                    {detail.sellerResponse ? (
                      <>
                        <div style={{ fontSize: 12, color: '#1e293b', marginBottom: 6 }}>{detail.sellerResponse}</div>
                        {detail.sellerEvidence && (
                          <img src={detail.sellerEvidence} alt="Ushahidi wa muuzaji"
                            style={{ width: '100%', borderRadius: 8, marginTop: 6 }} />
                        )}
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                          Ilijibiwa: {fmtDt(detail.sellerRespondedAt)}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
                        Muuzaji hajajibu bado...
                      </div>
                    )}
                  </div>

                  {/* Previous resolution */}
                  {detail.status === 'resolved' && (
                    <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: 12, marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#1d4ed8', marginBottom: 6 }}>✅ UAMUZI ULIOTOLEWA</div>
                      <div style={{ fontSize: 12, color: '#1e293b', marginBottom: 4 }}>
                        {RESOLUTION_OPTIONS.find(r => r.value === detail.resolution)?.label || detail.resolution}
                      </div>
                      <div style={{ fontSize: 12, color: '#475569' }}>{detail.resolutionNote}</div>
                      {detail.refundAmount > 0 && (
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#1d4ed8', marginTop: 4 }}>
                          Kiasi cha mrejesho: TZS {fmt(detail.refundAmount)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Assign self */}
                  {detail.status === 'open' && !detail.arbitratorId && (
                    <button onClick={handleAssign}
                      style={{ width: '100%', backgroundColor: '#f0fdf4', color: '#16a34a',
                        border: '1px solid #86efac', borderRadius: 10, padding: '10px 0',
                        cursor: 'pointer', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                      🙋 Jibu Huu Mimi — Nishughulikiwe
                    </button>
                  )}

                  {/* Resolution form */}
                  {detail.status !== 'resolved' && detail.status !== 'closed' && (
                    <div style={{ borderTop: '2px solid #f1f5f9', paddingTop: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>
                        ⚖️ Toa Uamuzi
                      </div>

                      {/* Resolution choice */}
                      <div style={{ marginBottom: 12 }}>
                        {RESOLUTION_OPTIONS.map(r => (
                          <label key={r.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 10,
                            padding: '10px 12px', borderRadius: 10, cursor: 'pointer', marginBottom: 6,
                            border: `2px solid ${resolution.resolution === r.value ? '#1d4ed8' : '#e2e8f0'}`,
                            backgroundColor: resolution.resolution === r.value ? '#eff6ff' : '#fff' }}>
                            <input type="radio" name="resolution" value={r.value}
                              checked={resolution.resolution === r.value}
                              onChange={e => setResolution(prev => ({ ...prev, resolution: e.target.value }))}
                              style={{ marginTop: 2 }} />
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{r.label}</div>
                              <div style={{ fontSize: 11, color: '#64748b' }}>{r.desc}</div>
                            </div>
                          </label>
                        ))}
                      </div>

                      {/* Refund amount for split */}
                      {resolution.resolution === 'split' && (
                        <div style={{ marginBottom: 10 }}>
                          <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>
                            Kiasi cha Mrejesho (TZS)
                          </label>
                          <input type="number" style={inp}
                            placeholder={`Max: TZS ${fmt(detail.order?.totalAmount)}`}
                            value={resolution.refundAmount}
                            onChange={e => setResolution(prev => ({ ...prev, refundAmount: e.target.value }))} />
                        </div>
                      )}

                      {/* Note */}
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>
                          Maelezo ya Uamuzi *
                        </label>
                        <textarea rows={3} style={{ ...inp, resize: 'none' }}
                          placeholder="Eleza sababu ya uamuzi wako kwa muuzaji na mnunuzi..."
                          value={resolution.resolutionNote}
                          onChange={e => setResolution(prev => ({ ...prev, resolutionNote: e.target.value }))} />
                      </div>

                      <button onClick={handleResolve} disabled={resolving}
                        style={{ width: '100%', background: 'linear-gradient(135deg,#1d4ed8,#7c3aed)',
                          color: '#fff', border: 'none', borderRadius: 10, padding: '12px 0',
                          cursor: resolving ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 800 }}>
                        {resolving ? '⏳ Inahifadhi...' : '✅ Hifadhi Uamuzi'}
                      </button>
                    </div>
                  )}
                </>) : (
                  <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                    Imeshindwa kupakia maelezo
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Disputes;