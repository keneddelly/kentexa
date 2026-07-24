import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

const CITIES = [
  'Dar es Salaam','Mwanza','Arusha','Moshi','Dodoma','Mbeya','Tanga','Morogoro',
  'Kigoma','Tabora','Songea','Iringa','Zanzibar','Lindi','Mtwara','Shinyanga',
  'Singida','Musoma','Bukoba','Sumbawanga','Babati','Kibaha','Njombe','Kasulu',
  'Mpanda','Masasi','Korogwe','Geita','Bariadi','Chato','Sengerema',
];

const DEFAULT_URBAN = 1500;
const DEFAULT_RURAL = 3000;

const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box',
};

const CollectionFees = ({ onNavigate }) => {
  const [fees, setFees]         = useState({});      // city → { urban, rural }
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(null);    // city being saved
  const [success, setSuccess]   = useState('');
  const [error, setError]       = useState('');
  const [editing, setEditing]   = useState({});      // city → { urban, rural } — local edits

  useEffect(() => {
    fetchFees();
  }, []);

  const fetchFees = async () => {
    try {
      setLoading(true);
      const res = await api.get('/super-agents/admin/collection-fees');
      const map = {};
      (res.data || []).forEach(f => { map[f.city] = { urban: f.urbanFee, rural: f.ruralFee }; });
      setFees(map);
    } catch {
      // No existing fees — start with defaults
      setFees({});
    } finally { setLoading(false); }
  };

  const getEditing = (city) => editing[city] || {
    urban: fees[city]?.urban ?? DEFAULT_URBAN,
    rural: fees[city]?.rural ?? DEFAULT_RURAL,
  };

  const setField = (city, field, value) => {
    setEditing(e => ({ ...e, [city]: { ...getEditing(city), [field]: value } }));
  };

  const handleSave = async (city) => {
    const vals = getEditing(city);
    try {
      setSaving(city); setError(''); setSuccess('');
      await api.post('/super-agents/admin/collection-fees', {
        city, urbanFee: Number(vals.urban), ruralFee: Number(vals.rural),
      });
      setSuccess(`Ada za ${city} zimehifadhiwa!`);
      setFees(f => ({ ...f, [city]: { urban: Number(vals.urban), rural: Number(vals.rural) } }));
      setEditing(e => { const n = { ...e }; delete n[city]; return n; });
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kuhifadhi');
    } finally { setSaving(null); }
  };

  const isDirty = (city) => {
    if (!editing[city]) return false;
    const saved = fees[city];
    const ed    = editing[city];
    return Number(ed.urban) !== (saved?.urban ?? DEFAULT_URBAN) ||
           Number(ed.rural) !== (saved?.rural ?? DEFAULT_RURAL);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar onNavigate={onNavigate} activeItem="CollectionFees" />
      <div style={{ flex: 1, padding: 24, maxWidth: 900, margin: '0 auto' }}>

        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', margin: 0 }}>🚴 Ada za Kukusanya kwa Mji</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
            Weka ada za kukusanya bidhaa kutoka kwa wauzaji kwa kila mji. Mji wa vijijini una ada ya juu zaidi.
          </p>
        </div>

        {/* Global defaults info */}
        <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#1d4ed8' }}>
          💡 Mji usio na ada maalum utatumia: <strong>TZS {DEFAULT_URBAN.toLocaleString()} (mjini)</strong> na <strong>TZS {DEFAULT_RURAL.toLocaleString()} (vijijini)</strong> kwa chaguo-msingi.
        </div>

        {error && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: 12, borderRadius: 8, marginBottom: 14, fontSize: 13 }}>❌ {error}</div>}
        {success && <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: 12, borderRadius: 8, marginBottom: 14, fontSize: 13 }}>✅ {success}</div>}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳ Inapakia...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {CITIES.map(city => {
              const vals   = getEditing(city);
              const saved  = fees[city];
              const dirty  = isDirty(city);
              const hasCustom = !!saved;

              return (
                <div key={city} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  border: dirty ? '2px solid #f59e0b' : hasCustom ? '1px solid #86efac' : '1px solid #e2e8f0' }}>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>📍 {city}</div>
                    {hasCustom && !dirty && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, backgroundColor: '#dcfce7', color: '#16a34a' }}>
                        ✅ Imewekwa
                      </span>
                    )}
                    {dirty && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, backgroundColor: '#fef9c3', color: '#ca8a04' }}>
                        ✏️ Mabadiliko
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 4 }}>🏙️ Mjini (TZS)</label>
                      <input type="number" value={vals.urban}
                        onChange={e => setField(city, 'urban', e.target.value)}
                        style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 4 }}>🌾 Vijijini (TZS)</label>
                      <input type="number" value={vals.rural}
                        onChange={e => setField(city, 'rural', e.target.value)}
                        style={inputStyle} />
                    </div>
                  </div>

                  <button onClick={() => handleSave(city)} disabled={saving === city || !dirty}
                    style={{ width: '100%', padding: '8px', borderRadius: 8, border: 'none', cursor: dirty ? 'pointer' : 'not-allowed',
                      fontSize: 12, fontWeight: 700,
                      background: dirty ? 'linear-gradient(135deg,#1d4ed8,#2563eb)' : '#f1f5f9',
                      color: dirty ? '#fff' : '#94a3b8' }}>
                    {saving === city ? '⏳ Inahifadhi...' : dirty ? '💾 Hifadhi' : '✓ Imehifadhiwa'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default CollectionFees;