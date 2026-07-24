import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

const PAYOUT_METHOD_LABELS = {
  mpesa:        '📱 M-Pesa',
  airtel_money: '📱 Airtel Money',
  tigo_pesa:    '📱 Tigo Pesa',
  halotel:      '📱 Halotel',
  bank:         '🏦 Benki',
};

const STATUS_STYLE = {
  pending:   { bg: '#fef9c3', color: '#ca8a04', label: '⏳ Inasubiri' },
  approved:  { bg: '#dcfce7', color: '#16a34a', label: '✅ Imeidhinishwa' },
  released:  { bg: '#dbeafe', color: '#2563eb', label: '💸 Imetolewa' },
  completed: { bg: '#f0fdf4', color: '#15803d', label: '🎉 Imekamilika' },
  rejected:  { bg: '#fee2e2', color: '#dc2626', label: '❌ Imekataliwa' },
};

const Payouts = ({ activePage, onNavigate, onLogout }) => {
  const [payouts, setPayouts]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [filter, setFilter]           = useState('all');
  const [search, setSearch]           = useState('');
  const [selected, setSelected]       = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage]         = useState('');
  const [error, setError]             = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentRef, setPaymentRef]   = useState('');
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [tab, setTab]                 = useState('seller');
  const [agentLedger, setAgentLedger] = useState([]);
  const [localAgents, setLocalAgents]           = useState([]);
  const [localAgentsLoading] = useState(false);
  const [releaseAgent, setReleaseAgent]         = useState(null);
  const [releaseAmount, setReleaseAmount]       = useState('');
  const [releaseNote, setReleaseNote]           = useState('');
  const [releasing, setReleasing]               = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  useEffect(() => { fetchPayouts(); }, []);
  useEffect(() => { if (tab === 'agents') fetchAgentLedger(); }, [tab]);

  const fetchPayouts = async () => {
    try {
      setLoading(true);
      const res = await api.get('/payouts/admin/all');
      setPayouts(res.data || []);
    } catch { setError('Imeshindwa kupakia malipo'); }
    finally { setLoading(false); }
  };

  const fetchAgentLedger = async () => {
    try {
      setLedgerLoading(true);
      const res = await api.get('/super-agents/admin/courier-cost-ledger');
      setAgentLedger(res.data || []);
    } catch { setAgentLedger([]); }
    finally { setLedgerLoading(false); }
  };

  const showMsg = (m) => { setMessage(m); setTimeout(() => setMessage(''), 4000); };
  const showErr = (m) => { setError(m);   setTimeout(() => setError(''),   4000); };

  const handleReleaseAgent = async () => {
    if (!releaseAgent || !releaseAmount) { setError('Weka kiasi cha kutoa'); return; }
    try {
      setReleasing(true); setError(''); setMessage('');
      const res = await api.patch(`/agents/${releaseAgent.id}/release-earnings`, {
        amount: Number(releaseAmount),
        note:   releaseNote.trim() || undefined,
      });
      setMessage(`✅ TZS ${Number(res.data.released).toLocaleString()} imetolewa kwa ${releaseAgent.fullName}`);
      setReleaseAgent(null); setReleaseAmount(''); setReleaseNote('');
      // Refresh
      api.get('/agents/admin/pending-earnings').then(r => setLocalAgents(r.data || []));
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kutoa malipo');
    } finally { setReleasing(false); }
  };

  const handleRelease = async () => {
    if (!paymentMethod.trim()) { showErr('Weka njia ya malipo iliyotumika'); return; }
    try {
      setActionLoading(true);
      await api.patch(`/payouts/admin/${selected.id}/release`, {
        paymentMethod: paymentMethod.trim(),
        paymentReference: paymentRef.trim() || undefined,
      });
      showMsg(`💸 TZS ${Number(selected.sellerAmount).toLocaleString()} imetolewa kwa ${selected.seller?.storeName || selected.seller?.name}`);
      setShowReleaseModal(false);
      setPaymentMethod('');
      setPaymentRef('');
      setSelected(null);
      fetchPayouts();
    } catch (err) { showErr(err?.response?.data?.message || 'Imeshindwa kutoa malipo'); }
    finally { setActionLoading(false); }
  };



  const filtered = payouts.filter(p => {
    const matchStatus = filter === 'all' || p.status === filter;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      p.seller?.storeName?.toLowerCase().includes(q) ||
      p.seller?.name?.toLowerCase().includes(q) ||
      p.seller?.email?.toLowerCase().includes(q) ||
      String(p.id).includes(q);
    return matchStatus && matchSearch;
  });

  const counts = {
    all:       payouts.length,
    pending:   payouts.filter(p => p.status === 'pending').length,
    released:  payouts.filter(p => p.status === 'released').length,
    completed: payouts.filter(p => p.status === 'completed').length,
    rejected:  payouts.filter(p => p.status === 'rejected').length,
  };

  const totalPending = payouts.filter(p => p.status === 'pending')
    .reduce((sum, p) => sum + Number(p.sellerAmount || 0), 0);

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32 }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>💸 Malipo ya Wauzaji</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Toa malipo kwa wauzaji baada ya bidhaa kutolewa</p>
          </div>
          <button onClick={fetchPayouts}
            style={{ backgroundColor: '#6366f1', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            🔄 Onyesha Upya
          </button>
        </div>

        {message && <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>{message}</div>}
        {error   && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>❌ {error}</div>}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[
            { key: 'seller', label: '🏪 Malipo ya Wauzaji' },
            { key: 'agents', label: '🏢 Gharama za Super Agents' },
            { key: 'local_agents', label: '🤝 Malipo ya Wakala' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: '9px 20px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                backgroundColor: tab === t.key ? '#6366f1' : '#fff',
                color: tab === t.key ? '#fff' : '#64748b',
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'seller' && (
          <>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
              {[
                { label: 'Inasubiri Kutolewa', value: `TZS ${totalPending.toLocaleString()}`, count: counts.pending, color: '#ca8a04', bg: '#fef9c3', icon: '⏳' },
                { label: 'Zimetolewa', value: counts.released, color: '#2563eb', bg: '#dbeafe', icon: '💸' },
                { label: 'Zimekamilika', value: counts.completed, color: '#15803d', bg: '#f0fdf4', icon: '✅' },
                { label: 'Jumla', value: counts.all, color: '#6366f1', bg: '#ede9fe', icon: '📊' },
              ].map(card => (
                <div key={card.label} style={{ backgroundColor: card.bg, borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{card.icon}</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: card.color }}>{card.value}</div>
                  <div style={{ fontSize: 11, color: card.color, opacity: 0.8, fontWeight: 600, marginTop: 2 }}>{card.label}</div>
                </div>
              ))}
            </div>

            {/* Pending alert */}
            {counts.pending > 0 && (
              <div style={{ backgroundColor: '#fef9c3', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', marginBottom: 18, fontSize: 13, color: '#92400e', fontWeight: 600 }}>
                ⚠️ Wauzaji <strong>{counts.pending}</strong> wanasubiri malipo yao ya jumla <strong>TZS {totalPending.toLocaleString()}</strong>
              </div>
            )}

            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {['all','pending','released','completed','rejected'].map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  style={{ padding: '6px 14px', borderRadius: 16, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    backgroundColor: filter === f ? '#6366f1' : '#fff', color: filter === f ? '#fff' : '#64748b',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  {f === 'all' ? `Yote (${counts.all})` : `${STATUS_STYLE[f]?.label} (${counts[f] || 0})`}
                </button>
              ))}
            </div>

            {/* Search */}
            <input placeholder="🔍 Tafuta muuzaji..." value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...inputStyle, marginBottom: 16, backgroundColor: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }} />

            {/* Table */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>⏳ Inapakia...</div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>💸</div>
                <div>Hakuna malipo yanayolingana</div>
              </div>
            ) : (
              <div style={{ backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #f1f5f9' }}>
                      {['#', 'Muuzaji', 'Agizo', 'Kiasi (TZS)', 'Njia', 'Hali', 'Tarehe', 'Vitendo'].map(h => (
                        <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((payout, idx) => {
                      const ss = STATUS_STYLE[payout.status] || STATUS_STYLE.pending;
                      return (
                        <tr key={payout.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }}
                          onClick={() => setSelected(payout)}>
                          <td style={{ padding: '12px 14px', fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>#{payout.id}</td>
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{payout.seller?.storeName || payout.seller?.name || '—'}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{payout.seller?.email}</div>
                            {payout.seller?.payoutMethod ? (
                              <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, marginTop: 2 }}>
                                {PAYOUT_METHOD_LABELS[payout.seller.payoutMethod] || payout.seller.payoutMethod}
                                {payout.seller.payoutAccountNumber ? ` — ${payout.seller.payoutAccountNumber}` : ''}
                              </div>
                            ) : (
                              <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600, marginTop: 2 }}>
                                ⚠️ Hajaweka njia ya malipo
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b' }}>#{payout.order?.id}</td>
                          <td style={{ padding: '12px 14px', fontSize: 14, fontWeight: 800, color: '#16a34a' }}>
                            {Number(payout.sellerAmount || 0).toLocaleString()}
                          </td>
                          <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b' }}>{payout.paymentMethod || '—'}</td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, backgroundColor: ss.bg, color: ss.color }}>{ss.label}</span>
                          </td>
                          <td style={{ padding: '12px 14px', fontSize: 12, color: '#94a3b8' }}>
                            {payout.createdAt ? new Date(payout.createdAt).toLocaleDateString('sw-TZ') : '—'}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            {payout.status === 'pending' && (
                              <button onClick={e => {
                                  e.stopPropagation();
                                  setSelected(payout);
                                  // Pre-fill from seller's stated preference so admin doesn't retype it
                                  const methodMap = { mpesa: 'M-Pesa', airtel_money: 'Airtel Money', tigo_pesa: 'Tigo Pesa', halotel: 'M-Pesa', bank: 'Bank Transfer' };
                                  setPaymentMethod(methodMap[payout.seller?.payoutMethod] || '');
                                  setShowReleaseModal(true);
                                }}
                                style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                                💸 Toa
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Agent Ledger tab */}
        {tab === 'agents' && (
          <div style={{ backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>🤝 Gharama za Usafirishaji — Super Agents</h3>
            {ledgerLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>⏳ Inapakia...</div>
            ) : agentLedger.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Hakuna rekodi za gharama</div>
            ) : (
              agentLedger.map((agent, i) => (
                <div key={i} style={{ padding: '14px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{agent.agentName || `Agent #${agent.agentId}`}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{agent.city} · {agent.parcelCount} vifurushi</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#dc2626' }}>TZS {Number(agent.totalOwed || 0).toLocaleString()}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>inahitajika kulipa</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Local Agents Earnings tab */}
        {tab === 'local_agents' && (
          <div style={{ backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>🤝 Kamisheni ya Mawakala (Kukusanya Malipo)</h3>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                Hawa ni mawakala wanaokusanya malipo ya M-Pesa kwa niaba ya wanunuzi.
                KenteXa inawadaiwa kamisheni hii tu — uwasilishaji na ukusanyaji wa vifurushi wanalipwa na Super Agent moja kwa moja nje ya mfumo.
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
              Jumla inayosubiri: <strong style={{ color: '#dc2626' }}>
                TZS {localAgents.reduce((s, a) => s + Number(a.pendingEarnings), 0).toLocaleString()}
              </strong>
            </div>

            {localAgentsLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳ Inapakia...</div>
            ) : localAgents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🎉</div>
                <div>Hakuna malipo yanayosubiri kwa sasa</div>
              </div>
            ) : (
              localAgents.map(agent => (
                <div key={agent.id} style={{ padding: '16px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{agent.fullName}</span>
                        {agent.agentCode && (
                          <span style={{ fontSize: 10, fontFamily: 'monospace', backgroundColor: '#f1f5f9', color: '#64748b', padding: '2px 6px', borderRadius: 4 }}>
                            {agent.agentCode}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        📍 {agent.city || '—'} · 📞 {agent.phone || '—'}
                      </div>
                      {/* Earnings breakdown */}
                      <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                        {[
                          { l: 'Malipo', v: agent.totalEarningsPayments, c: '#7c3aed' },
                          { l: 'Uwasilishaji', v: agent.totalEarningsDeliveries, c: '#1d4ed8' },
                          { l: 'Makusanyo', v: agent.totalEarningsCollections, c: '#16a34a' },
                        ].filter(s => s.v > 0).map(s => (
                          <div key={s.l} style={{ fontSize: 11, color: s.c }}>
                            {s.l}: <strong>TZS {Number(s.v).toLocaleString()}</strong>
                          </div>
                        ))}
                      </div>
                      {/* Payout method if set */}
                      {agent.payoutMethod && (
                        <div style={{ marginTop: 6, fontSize: 11, color: '#475569' }}>
                          💳 {agent.payoutMethod}
                          {agent.payoutAccountNumber && ` — ${agent.payoutAccountNumber}`}
                          {agent.payoutAccountName && ` (${agent.payoutAccountName})`}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color: '#dc2626' }}>
                        TZS {Number(agent.pendingEarnings).toLocaleString()}
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8 }}>inayosubiri</div>
                      <button
                        onClick={() => { setReleaseAgent(agent); setReleaseAmount(String(agent.pendingEarnings)); setReleaseNote(''); }}
                        style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                        💸 Toa Malipo
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

      </main>

      {/* Release modal */}
      {showReleaseModal && selected && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 440 }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', margin: '0 0 6px' }}>💸 Toa Malipo</h3>
            <div style={{ backgroundColor: '#dcfce7', borderRadius: 10, padding: 14, marginBottom: 18 }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>MUUZAJI</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#15803d' }}>
                {selected.seller?.storeName || selected.seller?.name}
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#15803d', marginTop: 6 }}>
                TZS {Number(selected.sellerAmount || 0).toLocaleString()}
              </div>
            </div>

            {/* Seller's stated payout details — exactly where to send the money */}
            {selected.seller?.payoutMethod ? (
              <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: 14, marginBottom: 18 }}>
                <div style={{ fontSize: 11, color: '#1d4ed8', fontWeight: 700, marginBottom: 6 }}>📍 NJIA ALIYOWEKA MUUZAJI</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>
                  {PAYOUT_METHOD_LABELS[selected.seller.payoutMethod] || selected.seller.payoutMethod}
                </div>
                {selected.seller.payoutAccountName && (
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>👤 {selected.seller.payoutAccountName}</div>
                )}
                {selected.seller.payoutAccountNumber && (
                  <div style={{ fontSize: 13, color: '#1d4ed8', fontWeight: 700, marginTop: 2, fontFamily: 'monospace' }}>{selected.seller.payoutAccountNumber}</div>
                )}
                {selected.seller.payoutMethod === 'bank' && selected.seller.payoutBankName && (
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>
                    🏦 {selected.seller.payoutBankName}{selected.seller.payoutBranchName ? ` — ${selected.seller.payoutBranchName}` : ''}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: 14, marginBottom: 18, fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
                ⚠️ Muuzaji hajaweka njia ya malipo bado. Wasiliana naye kabla ya kutoa malipo.
              </div>
            )}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>Njia ya Malipo *</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={inputStyle}>
                <option value="">— Chagua njia —</option>
                <option value="M-Pesa">M-Pesa (Vodacom)</option>
                <option value="Airtel Money">Airtel Money</option>
                <option value="Tigo Pesa">Tigo Pesa</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cash">Cash</option>
              </select>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>Nambari ya Kumbukumbu (optional)</label>
              <input placeholder="e.g. TXN123456789" value={paymentRef} onChange={e => setPaymentRef(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setShowReleaseModal(false); setPaymentMethod(''); setPaymentRef(''); }}
                style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                Ghairi
              </button>
              <button onClick={handleRelease} disabled={actionLoading}
                style={{ flex: 2, background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', padding: 12, borderRadius: 10, cursor: actionLoading ? 'not-allowed' : 'pointer', fontWeight: 800 }}>
                {actionLoading ? '⏳ Inatoa...' : '💸 Toa Malipo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agent earnings release modal */}
      {releaseAgent && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 420 }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', margin: '0 0 16px' }}>💸 Toa Malipo — {releaseAgent.fullName}</h3>

            {/* Agent details */}
            <div style={{ backgroundColor: '#f0fdf4', borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>INAYOSUBIRI</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#15803d' }}>
                TZS {Number(releaseAgent.pendingEarnings).toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                📍 {releaseAgent.city || '—'} · {releaseAgent.agentCode || '—'}
              </div>
            </div>

            {/* Payout method */}
            {releaseAgent.payoutMethod ? (
              <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#1d4ed8', fontWeight: 700, marginBottom: 4 }}>💳 NJIA YA MALIPO</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{releaseAgent.payoutMethod}</div>
                {releaseAgent.payoutAccountNumber && (
                  <div style={{ fontSize: 13, color: '#1d4ed8', fontWeight: 700, marginTop: 3, fontFamily: 'monospace' }}>
                    {releaseAgent.payoutAccountNumber}
                  </div>
                )}
                {releaseAgent.payoutAccountName && (
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>👤 {releaseAgent.payoutAccountName}</div>
                )}
              </div>
            ) : (
              <div style={{ backgroundColor: '#fef9c3', borderRadius: 10, padding: 10, marginBottom: 16, fontSize: 12, color: '#92400e' }}>
                ⚠️ Wakala hajaweka njia ya malipo. Wasiliana naye moja kwa moja: {releaseAgent.phone}
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5 }}>Kiasi cha Kutoa (TZS)</label>
              <input type="number" value={releaseAmount}
                onChange={e => setReleaseAmount(e.target.value)}
                max={releaseAgent.pendingEarnings}
                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 16, fontWeight: 800, boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5 }}>Maelezo (si lazima)</label>
              <input type="text" placeholder="e.g. Malipo ya wiki ya 1-7 Jul"
                value={releaseNote} onChange={e => setReleaseNote(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleReleaseAgent} disabled={releasing || !releaseAmount}
                style={{ flex: 1, background: releasing ? '#64748b' : 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', padding: 14, borderRadius: 10, cursor: releasing ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 800 }}>
                {releasing ? '⏳ Inatoa...' : '💸 Toa Malipo'}
              </button>
              <button onClick={() => setReleaseAgent(null)}
                style={{ padding: '14px 18px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#64748b' }}>
                Ghairi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Payouts;