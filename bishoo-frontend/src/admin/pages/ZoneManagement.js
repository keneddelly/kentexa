import React, { useEffect, useState } from 'react';
import api from '../../api/api';

/**
 * Zone Management — Admin page to create and manage Dar es Salaam delivery zones
 * Accessible from Admin Dashboard
 * Route: onNavigate('ZoneManagement')
 */

const SUGGESTED_ZONES = [
  {
    name: 'Mbagala',
    city: 'Dar es Salaam',
    routeOrder: 1,
    etaMinutesFromDeparture: 45,
    addressKeywords: ['Mbagala', 'Mbagala Kuu', 'Mbagala Kizuiani', 'Yombo', 'Tandika', "Chang'ombe"],
  },
  {
    name: 'Mbezi',
    city: 'Dar es Salaam',
    routeOrder: 2,
    etaMinutesFromDeparture: 90,
    addressKeywords: ['Mbezi', 'Mbezi Louis', 'Mbezi Beach', 'Kimara', 'Kibamba', 'Makuburi'],
  },
  {
    name: 'Bunju',
    city: 'Dar es Salaam',
    routeOrder: 3,
    etaMinutesFromDeparture: 120,
    addressKeywords: ['Bunju', 'Bunju A', 'Bunju B', 'Mbweni', 'Boko', 'Tegeta', 'Kunduchi'],
  },
];

const emptyForm = {
  name: '', city: 'Dar es Salaam', routeOrder: '', etaMinutesFromDeparture: '',
  addressKeywords: '', zoneAgentId: '', isActive: true,
};

const ZoneManagement = ({ onNavigate, onLogout }) => {
  const [zones, setZones]           = useState([]);
  const [agents, setAgents]         = useState([]); // Super agents list for dropdown
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editZone, setEditZone]     = useState(null);
  const [form, setForm]             = useState(emptyForm);
  const [saving, setSaving]         = useState(false);
  const [message, setMessage]       = useState('');
  const [error, setError]           = useState('');
  const [seeding, setSeeding]       = useState(false);

  useEffect(() => { fetchZones(); fetchAgents(); }, []);

  const fetchZones = async () => {
    try {
      setLoading(true);
      const res = await api.get('/daily-batches/zones');
      setZones(res.data || []);
    } catch { setZones([]); }
    finally { setLoading(false); }
  };

  const fetchAgents = async () => {
    try {
      const res = await api.get('/super-agents');
      setAgents(res.data || []);
    } catch { setAgents([]); }
  };

  const showMsg  = (m) => { setMessage(m); setTimeout(() => setMessage(''), 4000); };
  const showErr  = (m) => { setError(m);   setTimeout(() => setError(''),   4000); };

  const openCreate = (suggested = null) => {
    setEditZone(null);
    setForm(suggested
      ? { ...emptyForm, ...suggested, addressKeywords: suggested.addressKeywords.join(', ') }
      : emptyForm
    );
    setShowForm(true);
  };

  const openEdit = (zone) => {
    setEditZone(zone);
    setForm({
      name:                    zone.name,
      city:                    zone.city,
      routeOrder:              String(zone.routeOrder),
      etaMinutesFromDeparture: String(zone.etaMinutesFromDeparture),
      addressKeywords:         (zone.addressKeywords || []).join(', '),
      zoneAgentId:             zone.zoneAgent?.id ? String(zone.zoneAgent.id) : '',
      isActive:                zone.isActive,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.routeOrder || !form.etaMinutesFromDeparture) {
      showErr('Jaza sehemu zote zinazohitajika'); return;
    }
    try {
      setSaving(true);
      const keywords = form.addressKeywords
        .split(',').map(k => k.trim()).filter(Boolean);

      const payload = {
        name:                    form.name.trim(),
        city:                    form.city.trim(),
        routeOrder:              Number(form.routeOrder),
        etaMinutesFromDeparture: Number(form.etaMinutesFromDeparture),
        addressKeywords:         keywords,
        isActive:                form.isActive,
        ...(form.zoneAgentId ? { zoneAgentId: Number(form.zoneAgentId) } : {}),
      };

      if (editZone) {
        await api.patch(`/daily-batches/zones/${editZone.id}`, payload);
        showMsg(`✅ Eneo "${form.name}" limesasishwa`);
      } else {
        await api.post('/daily-batches/zones', payload);
        showMsg(`✅ Eneo "${form.name}" limeundwa`);
      }
      setShowForm(false);
      setEditZone(null);
      setForm(emptyForm);
      fetchZones();
    } catch (err) {
      showErr(err?.response?.data?.message || 'Imeshindwa kuhifadhi eneo');
    } finally {
      setSaving(false);
    }
  };

  // Seed all 3 default zones at once
  const handleSeedAll = async () => {
    setSeeding(true);
    let created = 0;
    for (const zone of SUGGESTED_ZONES) {
      try {
        await api.post('/daily-batches/zones', {
          ...zone,
          addressKeywords: zone.addressKeywords,
        });
        created++;
      } catch (err) {
        // Zone might already exist — skip
        console.warn(`Zone ${zone.name}:`, err?.response?.data?.message);
      }
    }
    showMsg(`✅ Maeneo ${created} yameundwa: Mbagala → Mbezi → Bunju`);
    setSeeding(false);
    fetchZones();
  };

  const inputStyle = {
    width: '100%', padding: '11px 14px', borderRadius: 10,
    border: '2px solid #e2e8f0', fontSize: 14,
    boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
  };
  const labelStyle = { display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4 };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>

      {/* Header */}
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => onNavigate('Dashboard')}
          style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#64748b' }}>←</button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>🗺️ Maeneo ya Utoaji — Dar es Salaam</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Simamia maeneo ya batch delivery van</div>
        </div>
      </div>

      {/* Flash messages */}
      {message && (
        <div style={{ backgroundColor: '#dcfce7', color: '#15803d', padding: '12px 16px', fontSize: 13, fontWeight: 700, textAlign: 'center' }}>
          {message}
        </div>
      )}
      {error && (
        <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 16px', fontSize: 13, fontWeight: 700, textAlign: 'center' }}>
          ❌ {error}
        </div>
      )}

      <div style={{ padding: 16, maxWidth: 700, margin: '0 auto', boxSizing: 'border-box' }}>

        {/* Route overview */}
        {zones.length > 0 && (
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 10 }}>🚐 Route ya Van</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', backgroundColor: '#1d4ed8', color: '#fff', borderRadius: 20 }}>
                🏢 Kariakoo (Hub)
              </span>
              {[...zones].sort((a,b) => a.routeOrder - b.routeOrder).map(zone => (
                <React.Fragment key={zone.id}>
                  <span style={{ color: '#94a3b8' }}>→</span>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', backgroundColor: zone.isActive ? '#ede9fe' : '#f1f5f9', color: zone.isActive ? '#7c3aed' : '#94a3b8', borderRadius: 20 }}>
                    📍 {zone.name} (+{zone.etaMinutesFromDeparture}min)
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={() => openCreate()}
            style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
            ➕ Ongeza Eneo
          </button>
          {zones.length === 0 && (
            <button onClick={handleSeedAll} disabled={seeding}
              style={{ background: seeding ? '#e2e8f0' : 'linear-gradient(135deg,#16a34a,#15803d)', color: seeding ? '#94a3b8' : '#fff', border: 'none', padding: '10px 18px', borderRadius: 10, cursor: seeding ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13 }}>
              {seeding ? '⏳ Inaunda...' : '🚀 Unda Maeneo 3 Yote (Mbagala → Mbezi → Bunju)'}
            </button>
          )}
          <button onClick={fetchZones}
            style={{ backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: '10px 18px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
            🔄 Onyesha Upya
          </button>
        </div>

        {/* Suggested zones (when no zones exist) */}
        {zones.length === 0 && !loading && (
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '2px dashed #e2e8f0' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>
              💡 Maeneo Yanayopendekezwa — Kariakoo → Mbagala → Mbezi → Bunju
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SUGGESTED_ZONES.map(zone => (
                <div key={zone.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: '#f8fafc', borderRadius: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>📍 {zone.name}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      Route #{zone.routeOrder} · ETA +{zone.etaMinutesFromDeparture} dakika · {zone.addressKeywords.join(', ')}
                    </div>
                  </div>
                  <button onClick={() => openCreate(zone)}
                    style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                    ➕ Unda
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Zones list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>⏳ Inapakia maeneo...</div>
        ) : zones.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗺️</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>Hakuna maeneo bado</div>
            <div style={{ fontSize: 13 }}>Bonyeza "Unda Maeneo 3 Yote" kuanza mara moja au unda moja kwa moja.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[...zones].sort((a,b) => a.routeOrder - b.routeOrder).map(zone => (
              <div key={zone.id} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: zone.isActive ? '1px solid #e2e8f0' : '1px dashed #e2e8f0', opacity: zone.isActive ? 1 : 0.6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 20, fontWeight: 900, color: '#7c3aed' }}>#{zone.routeOrder}</span>
                      <span style={{ fontSize: 16, fontWeight: 900, color: '#1e293b' }}>📍 {zone.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, backgroundColor: zone.isActive ? '#dcfce7' : '#fee2e2', color: zone.isActive ? '#16a34a' : '#dc2626' }}>
                        {zone.isActive ? 'Hai' : 'Imezimwa'}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>🏙️ {zone.city}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>⏱️ ETA: +{zone.etaMinutesFromDeparture} dakika baada ya kuondoka</div>
                    {zone.zoneAgent && (
                      <div style={{ fontSize: 12, color: '#2563eb', fontWeight: 600, marginTop: 2 }}>
                        👤 Agent: {zone.zoneAgent.businessName || zone.zoneAgent.user?.name || '—'}
                      </div>
                    )}
                    {!zone.zoneAgent && (
                      <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600, marginTop: 2 }}>
                        ⚠️ Hakuna agent aliyepangiwa — hariri na weka agent
                      </div>
                    )}
                  </div>
                  <button onClick={() => openEdit(zone)}
                    style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                    ✏️ Hariri
                  </button>
                </div>

                {/* Keywords */}
                {zone.addressKeywords?.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                    <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, alignSelf: 'center' }}>Maneno:</span>
                    {zone.addressKeywords.map(kw => (
                      <span key={kw} style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', backgroundColor: '#f1f5f9', color: '#475569', borderRadius: 20 }}>
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9998, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: 24, width: '100%', boxSizing: 'border-box', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ width: 40, height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, margin: '0 auto 18px' }} />
            <h2 style={{ fontSize: 17, fontWeight: 900, color: '#1e293b', margin: '0 0 18px' }}>
              {editZone ? `✏️ Hariri — ${editZone.name}` : '➕ Eneo Jipya'}
            </h2>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Jina la Eneo *</label>
              <input placeholder="e.g. Mbagala" value={form.name}
                onChange={e => setForm({...form, name: e.target.value})} style={inputStyle} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Nambari ya Route *</label>
                <input type="number" placeholder="1" value={form.routeOrder}
                  onChange={e => setForm({...form, routeOrder: e.target.value})} style={inputStyle} />
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>Mbagala=1, Mbezi=2, Bunju=3</div>
              </div>
              <div>
                <label style={labelStyle}>ETA (dakika) *</label>
                <input type="number" placeholder="45" value={form.etaMinutesFromDeparture}
                  onChange={e => setForm({...form, etaMinutesFromDeparture: e.target.value})} style={inputStyle} />
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>Baada ya kuondoka Kariakoo</div>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Mji</label>
              <input placeholder="Dar es Salaam" value={form.city}
                onChange={e => setForm({...form, city: e.target.value})} style={inputStyle} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Maneno ya Kutambua Anwani (tenganisha kwa koma)</label>
              <textarea
                placeholder="e.g. Mbagala, Mbagala Kuu, Yombo, Tandika"
                value={form.addressKeywords}
                onChange={e => setForm({...form, addressKeywords: e.target.value})}
                rows={3}
                style={{ ...inputStyle, resize: 'none' }}
              />
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>
                Mfumo utatumia maneno haya kutambua anwani za wanunuzi wanaopaswa kupelekwa eneo hili
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Super Agent wa Eneo hili</label>
              <select value={form.zoneAgentId}
                onChange={e => setForm({...form, zoneAgentId: e.target.value})} style={inputStyle}>
                <option value="">— Chagua Super Agent —</option>
                {agents.map(agent => (
                  <option key={agent.id} value={agent.id}>
                    {agent.businessName || agent.user?.name || `Agent #${agent.id}`} — {agent.city || agent.region || ''}
                  </option>
                ))}
              </select>
              {agents.length === 0 && (
                <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>
                  ⚠️ Hakuna Super Agents waliosajiliwa bado. Unaweza kuongeza agent baadaye.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, padding: '10px 14px', backgroundColor: '#f8fafc', borderRadius: 10 }}>
              <input type="checkbox" id="isActive" checked={form.isActive}
                onChange={e => setForm({...form, isActive: e.target.checked})}
                style={{ width: 18, height: 18, cursor: 'pointer' }} />
              <label htmlFor="isActive" style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', cursor: 'pointer' }}>
                Eneo hili liko hai (linatumika kwa batch delivery)
              </label>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setShowForm(false); setEditZone(null); setForm(emptyForm); }}
                style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 13, borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                Ghairi
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ flex: 2, background: saving ? '#93c5fd' : 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 13, borderRadius: 10, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 14 }}>
                {saving ? '⏳ Inahifadhi...' : editZone ? '✅ Hifadhi Mabadiliko' : '➕ Unda Eneo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ZoneManagement;