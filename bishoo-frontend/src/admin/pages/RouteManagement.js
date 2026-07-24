import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

const CITIES = [
  'Dar es Salaam','Mwanza','Arusha','Moshi','Dodoma','Mbeya','Tanga','Morogoro',
  'Kigoma','Tabora','Songea','Iringa','Zanzibar','Lindi','Mtwara','Shinyanga',
  'Singida','Musoma','Bukoba','Sumbawanga','Babati','Kibaha','Njombe','Kasulu',
  'Mpanda','Masasi','Korogwe',
];

const TRANSPORT_LABELS = {
  bus:       '🚌 Basi',
  agent_van: '🚐 Van ya Agent',
  courier:   '📦 Courier',
  flight:    '✈️ Ndege',
};

const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0',
  fontSize: 13, boxSizing: 'border-box', outline: 'none',
};

const RouteManagement = ({ onNavigate }) => {
  const [routes, setRoutes]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [seeding, setSeeding]     = useState(false);
  const [seedResult, setSeedResult] = useState(null);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const [filterOrigin, setFilterOrigin] = useState('');

  const [form, setForm] = useState({
    originCity: '', destinationCity: '',
    estimatedDays: '2', baseShippingFee: '5000',
    perKgFee: '1000', primaryTransport: 'bus',
    notes: '', isActive: true,
    transitCity: null, leg1Days: 1, leg2Days: 1,
  });

  const fetchRoutes = async () => {
    try {
      setLoading(true);
      const res = await api.get('/super-agents/admin/routes');
      setRoutes(res.data || []);
    } catch { setError('Imeshindwa kupakia routes'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchRoutes(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSeedLocations = async () => {
    if (!window.confirm('Jaza maeneo yote ya Tanzania? (Mikoa 31, Wilaya ~185, Kata za Dar na miji mingine)')) return;
    try {
      setSeeding(true); setError(''); setSuccess('');
      const res = await api.post('/locations/seed');
      setSuccess(`✅ Maeneo yamejazwa: Mikoa ${res.data.regions}, Wilaya ${res.data.districts}, Kata ${res.data.wards}`);
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kujaza maeneo');
    } finally { setSeeding(false); }
  };

  const handleSeed = async () => {
    if (!window.confirm('Jaza jedwali na njia zote za Tanzania (70+ njia)? Njia zilizopo hazitabadilishwa.')) return;
    try {
      setSeeding(true); setError(''); setSuccess(''); setSeedResult(null);
      const res = await api.post('/super-agents/admin/seed-routes');
      setSeedResult(res.data);
      setSuccess(`✅ Imekamilika! Njia mpya: ${res.data.seeded}, Zilizokuwepo: ${res.data.skipped}`);
      fetchRoutes();
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kujaza njia');
    } finally { setSeeding(false); }
  };

  const handleSave = async () => {
    if (!form.originCity || !form.destinationCity) { setError('Chagua miji miwili'); return; }
    if (form.originCity === form.destinationCity) { setError('Miji lazima iwe tofauti'); return; }
    try {
      setSaving(true); setError(''); setSuccess('');
      await api.post('/super-agents/admin/routes', {
        ...form,
        estimatedDays:   Number(form.estimatedDays),
        baseShippingFee: Number(form.baseShippingFee),
        perKgFee:        Number(form.perKgFee),
        transitCity:     form.transitCity || null,
        leg1Days:        form.transitCity ? Number(form.leg1Days) : null,
        leg2Days:        form.transitCity ? Number(form.leg2Days) : null,
      });
      setSuccess(`Route ${form.originCity} → ${form.destinationCity} imehifadhiwa!`);
      setShowForm(false);
      setForm({ originCity: '', destinationCity: '', estimatedDays: '2', baseShippingFee: '5000', perKgFee: '1000', primaryTransport: 'bus', notes: '', isActive: true });
      fetchRoutes();
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kuhifadhi');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id, label) => {
    if (!window.confirm(`Futa route: ${label}?`)) return;
    try {
      await api.delete(`/super-agents/admin/routes/${id}`);
      fetchRoutes();
    } catch { setError('Imeshindwa kufuta'); }
  };

  const filtered = filterOrigin
    ? routes.filter(r => r.originCity === filterOrigin)
    : routes;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar onNavigate={onNavigate} activeItem="RouteManagement" />
      <div style={{ flex: 1, padding: 24, maxWidth: 960, margin: '0 auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', margin: 0 }}>🗺️ Jedwali la Njia za Intercity</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
              Simamia njia zote kati ya miji — ETA, ada, na usafirishaji
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleSeed} disabled={seeding}
              style={{ background: seeding ? '#64748b' : 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 10, cursor: seeding ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 800 }}>
              {seeding ? '⏳ Inajaza...' : '🌍 Jaza Njia za Tanzania'}
            </button>
            <button onClick={handleSeedLocations} disabled={seeding}
              style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', color: '#fff',
                border: 'none', padding: '10px 18px', borderRadius: 10,
                cursor: seeding ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 800 }}>
              {seeding ? '⏳ Inajaza...' : '🗺️ Jaza Maeneo ya Tanzania'}
            </button>
            <button onClick={() => setShowForm(!showForm)}
              style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
              {showForm ? '✕ Funga' : '+ Ongeza Route'}
            </button>
          </div>
        </div>

        {error && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: 12, borderRadius: 8, marginBottom: 14, fontSize: 13 }}>❌ {error}</div>}
        {success && <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: 12, borderRadius: 8, marginBottom: 14, fontSize: 13 }}>✅ {success}</div>}

        {/* Seed result summary */}
        {seedResult && (
          <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: '14px 16px', marginBottom: 16, display: 'flex', gap: 20, alignItems: 'center' }}>
            {[
              { label: 'Njia Mpya Zilizoongezwa', value: seedResult.seeded, color: '#16a34a' },
              { label: 'Zilizokuwepo (Hazikubadilishwa)', value: seedResult.skipped, color: '#64748b' },
              { label: 'Jumla ya Mbegu', value: seedResult.total, color: '#1d4ed8' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
            <button onClick={() => setSeedResult(null)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 18 }}>×</button>
          </div>
        )}

        {/* Add/Edit form */}
        {showForm && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 16px' }}>➕ Route Mpya</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Jiji la Asili *</label>
                <select value={form.originCity} onChange={e => setForm(f => ({ ...f, originCity: e.target.value }))} style={inputStyle}>
                  <option value="">— Chagua —</option>
                  {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Jiji la Mwisho *</label>
                <select value={form.destinationCity} onChange={e => setForm(f => ({ ...f, destinationCity: e.target.value }))} style={inputStyle}>
                  <option value="">— Chagua —</option>
                  {CITIES.filter(c => c !== form.originCity).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Siku za Delivery *</label>
                <input type="number" min="1" max="14" value={form.estimatedDays} onChange={e => setForm(f => ({ ...f, estimatedDays: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Ada ya Msingi (TZS) *</label>
                <input type="number" value={form.baseShippingFee} onChange={e => setForm(f => ({ ...f, baseShippingFee: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Ada kwa Kilo (TZS)</label>
                <input type="number" value={form.perKgFee} onChange={e => setForm(f => ({ ...f, perKgFee: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Jina la Kampuni (hiari)</label>
                <input value={form.providerName} onChange={e => setForm(f => ({...f, providerName: e.target.value}))}
                  placeholder="e.g. Scandinavian Express, DHL..." style={{ width: '100%', padding: '8px 10px',
                  borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={form.isPartnerRoute}
                    onChange={e => setForm(f => ({...f, isPartnerRoute: e.target.checked}))} />
                  🤝 Route ya Mshirika (Partner)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={form.isActive !== false}
                    onChange={e => setForm(f => ({...f, isActive: e.target.checked}))} />
                  ✅ Inatumika
                </label>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Usafiri wa Kawaida</label>
                <select value={form.primaryTransport} onChange={e => setForm(f => ({ ...f, primaryTransport: e.target.value }))} style={inputStyle}>
                  <option value="bus">🚌 Basi</option>
                  <option value="agent_van">🚐 Van ya Agent</option>
                  <option value="courier">📦 Courier</option>
                  <option value="flight">✈️ Ndege</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Mji wa Kupita (Transit)</label>
                <select value={form.transitCity || ''} onChange={e => setForm(f => ({ ...f, transitCity: e.target.value || null }))} style={inputStyle}>
                  <option value="">Hakuna — njia ya moja kwa moja</option>
                  {CITIES.filter(c => c !== form.originCity && c !== form.destinationCity).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            {form.transitCity && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Siku: {form.originCity} → {form.transitCity}</label>
                  <input type="number" min="1" max="7" value={form.leg1Days || 1} onChange={e => setForm(f => ({ ...f, leg1Days: Number(e.target.value) }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Siku: {form.transitCity} → {form.destinationCity}</label>
                  <input type="number" min="1" max="7" value={form.leg2Days || 1} onChange={e => setForm(f => ({ ...f, leg2Days: Number(e.target.value) }))} style={inputStyle} />
                </div>
              </div>
            )}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Maelezo (Optional)</label>
              <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. Via Morogoro — basi Mon/Wed/Fri tu" style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleSave} disabled={saving}
                style={{ flex: 1, background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                {saving ? '⏳ Inahifadhi...' : '💾 Hifadhi Route'}
              </button>
              <button onClick={() => setShowForm(false)}
                style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#64748b' }}>
                Ghairi
              </button>
            </div>
          </div>
        )}

        {/* Filter */}
        <div style={{ marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Chuja na jiji:</div>
          <select value={filterOrigin} onChange={e => setFilterOrigin(e.target.value)} style={{ ...inputStyle, width: 200 }}>
            <option value="">Miji yote</option>
            {[...new Set(routes.map(r => r.originCity))].sort().map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{filtered.length} routes</div>
        </div>

        {/* Routes table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳ Inapakia...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗺️</div>
            <div>Hakuna routes bado. Ongeza route ya kwanza!</div>
          </div>
        ) : (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                  {['Asili → Mwisho','Siku','Ada Msingi','Ada/Kg','Usafiri','Hali',''].map(h => (
                    <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(route => (
                  <tr key={route.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                      {route.originCity} → {route.destinationCity}
                      {route.transitCity && <div style={{ fontSize: 11, color: '#ca8a04', marginTop: 2 }}>🔄 Via {route.transitCity}</div>}
                    {route.notes && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{route.notes}</div>}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13, color: '#475569' }}>
                      {route.estimatedDays} siku
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13, color: '#1e293b', fontWeight: 700 }}>
                      TZS {Number(route.baseShippingFee).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b' }}>
                      +TZS {Number(route.perKgFee).toLocaleString()}/kg
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: '#475569' }}>
                      {TRANSPORT_LABELS[route.primaryTransport] || route.primaryTransport || '—'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                        backgroundColor: route.isActive ? '#dcfce7' : '#fee2e2',
                        color: route.isActive ? '#16a34a' : '#dc2626' }}>
                        {route.isActive ? '✅ Inafanya kazi' : '⏸️ Imesimamishwa'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <button onClick={() => handleDelete(route.id, `${route.originCity} → ${route.destinationCity}`)}
                        style={{ backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                        🗑️ Futa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default RouteManagement;