import React, { useState } from 'react';
import api from '../../api/api';

/**
 * BodaRates — Admin page to manage boda fee matrix
 * Route: onNavigate('BodaRates')
 * Admin edits the zone-to-zone fee matrix
 * Changes take effect immediately for all buyers at checkout
 */

const ZONES = [
  { rank: 1, label: 'Eneo 1 — Kariakoo / Ilala / Upanga',  short: 'Kariakoo/Ilala' },
  { rank: 2, label: 'Eneo 2 — Kinondoni / Sinza / Temeke', short: 'Kinondoni/Sinza' },
  { rank: 3, label: 'Eneo 3 — Ubungo / Kimara / Mbagala',  short: 'Ubungo/Mbagala' },
  { rank: 4, label: 'Eneo 4 — Bunju / Tegeta / Boko',      short: 'Bunju/Tegeta' },
];

const DEFAULT_MATRIX = {
  '1-1': 3000,  '1-2': 6000,  '1-3': 10000, '1-4': 15000,
  '2-1': 5000,  '2-2': 4000,  '2-3': 8000,  '2-4': 13000,
  '3-1': 9000,  '3-2': 7000,  '3-3': 4000,  '3-4': 10000,
  '4-1': 14000, '4-2': 12000, '4-3': 9000,  '4-4': 5000,
};

const BodaRates = ({ onNavigate }) => {
  const [matrix, setMatrix]       = useState({ ...DEFAULT_MATRIX });
  const [saving, setSaving]       = useState({});
  const [message, setMessage]     = useState('');
  const [testAddr, setTestAddr]   = useState('');
  const [testSeller, setTestSeller] = useState('Kariakoo');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting]     = useState(false);
  const [editCell, setEditCell]   = useState(null); // { key, value }

  const showMsg = (m) => { setMessage(m); setTimeout(() => setMessage(''), 3000); };

  const handleSaveCell = async (key, value) => {
    try {
      setSaving(s => ({ ...s, [key]: true }));
      // Save to DB via boda-rates endpoint
      await api.patch(`/boda-rates/matrix_${key.replace('-', '_')}`, {
        fee: Number(value),
        label: `Matrix ${key}`,
        category: 'matrix',
        isActive: true,
      });
      setMatrix(m => ({ ...m, [key]: Number(value) }));
      setEditCell(null);
      showMsg('✅ Bei imesasishwa');
    } catch {
      showMsg('❌ Imeshindwa kuhifadhi');
    } finally {
      setSaving(s => ({ ...s, [key]: false }));
    }
  };

  const handleTest = async () => {
    if (!testAddr.trim()) return;
    try {
      setTesting(true); setTestResult(null);
      const res = await api.get(
        `/daily-batches/delivery-methods?address=${encodeURIComponent(testAddr)}&productId=1&sellerCity=${encodeURIComponent(testSeller)}`
      );
      const boda = res.data?.methods?.find(m => m.key === 'boda');
      setTestResult(boda || { fee: 0, desc: 'Haijulikani' });
    } catch { setTestResult({ error: 'Imeshindwa' }); }
    finally { setTesting(false); }
  };

  const handleResetDefaults = async () => {
    if (!window.confirm('Rudisha bei zote kwa chaguo-msingi la KenteXa?')) return;
    setMatrix({ ...DEFAULT_MATRIX });
    showMsg('✅ Bei zimerudishwa — zitaathiri mara tu upakiwe upya');
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => onNavigate('Dashboard')} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#64748b' }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>🛵 Bei za Boda Boda — Dar es Salaam</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>KenteXa inasimamia bei zote kwa niaba ya wauzaji</div>
        </div>
        <button onClick={handleResetDefaults}
          style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}>
          🔄 Chaguo-Msingi
        </button>
      </div>

      {message && (
        <div style={{ backgroundColor: message.startsWith('❌') ? '#fee2e2' : '#dcfce7', color: message.startsWith('❌') ? '#dc2626' : '#15803d', padding: '10px 16px', fontSize: 13, fontWeight: 700, textAlign: 'center' }}>
          {message}
        </div>
      )}

      <div style={{ padding: 16, maxWidth: 700, margin: '0 auto', boxSizing: 'border-box', paddingBottom: 40 }}>

        {/* Explanation */}
        <div style={{ backgroundColor: '#eff6ff', borderRadius: 12, padding: 14, marginBottom: 16, fontSize: 12, color: '#1d4ed8' }}>
          <strong>Jinsi inavyofanya kazi:</strong> Mfumo unatumia jedwali hili kuhesabu bei ya boda kiotomatiki. 
          Bei inategemea eneo la muuzaji na eneo la mnunuzi. Gusa kisanduku chochote kubadilisha bei yake.
        </div>

        {/* Fee Matrix Table */}
        <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 16, overflowX: 'auto' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>
            📊 Jedwali la Bei (TZS) — Muuzaji → Mnunuzi
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: 10, color: '#94a3b8', fontWeight: 700, borderBottom: '2px solid #f1f5f9' }}>
                  MUUZAJI ↓ / MNUNUZI →
                </th>
                {ZONES.map(z => (
                  <th key={z.rank} style={{ padding: '8px 6px', textAlign: 'center', fontSize: 10, color: '#7c3aed', fontWeight: 700, borderBottom: '2px solid #f1f5f9', minWidth: 80 }}>
                    {z.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ZONES.map(seller => (
                <tr key={seller.rank}>
                  <td style={{ padding: '8px 6px', fontSize: 11, fontWeight: 700, color: '#1d4ed8', borderBottom: '1px solid #f8fafc', whiteSpace: 'nowrap' }}>
                    {seller.short}
                  </td>
                  {ZONES.map(buyer => {
                    const key = `${seller.rank}-${buyer.rank}`;
                    const isSame = seller.rank === buyer.rank;
                    const isEditing = editCell?.key === key;
                    return (
                      <td key={buyer.rank} style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #f8fafc', backgroundColor: isSame ? '#f0fdf4' : 'transparent' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                            <input
                              type="number"
                              value={editCell.value}
                              onChange={e => setEditCell({ key, value: e.target.value })}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSaveCell(key, editCell.value);
                                if (e.key === 'Escape') setEditCell(null);
                              }}
                              autoFocus
                              style={{ width: 65, padding: '3px 5px', borderRadius: 6, border: '2px solid #7c3aed', fontSize: 11, textAlign: 'center' }}
                            />
                            <button onClick={() => handleSaveCell(key, editCell.value)}
                              style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 5, padding: '3px 6px', cursor: 'pointer', fontSize: 10, fontWeight: 700 }}>
                              {saving[key] ? '⏳' : '✓'}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditCell({ key, value: String(matrix[key] || DEFAULT_MATRIX[key] || 5000) })}
                            style={{ background: 'none', border: '1px solid transparent', borderRadius: 8, padding: '4px 8px', cursor: 'pointer', fontSize: 12, fontWeight: 800, color: isSame ? '#15803d' : '#1e293b', width: '100%' }}
                            onMouseEnter={e => e.currentTarget.style.border = '1px solid #e2e8f0'}
                            onMouseLeave={e => e.currentTarget.style.border = '1px solid transparent'}>
                            {(matrix[key] || DEFAULT_MATRIX[key] || 0).toLocaleString()}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 10, fontSize: 10, color: '#94a3b8' }}>
            💡 Gusa bei yoyote ili kuibadilisha · Kisanduku <span style={{ backgroundColor: '#f0fdf4', padding: '0 4px', borderRadius: 3 }}>kijani</span> = muuzaji na mnunuzi wako eneo moja
          </div>
        </div>

        {/* Zone Legend */}
        <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 10 }}>📍 Maeneo</div>
          {ZONES.map(z => (
            <div key={z.rank} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #f8fafc' }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: '#7c3aed', width: 20 }}>{z.rank}</span>
              <span style={{ fontSize: 12, color: '#1e293b' }}>{z.label}</span>
            </div>
          ))}
        </div>

        {/* Live tester */}
        <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>🧮 Jaribu Bei</div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 4 }}>Eneo la Muuzaji</label>
            <select value={testSeller} onChange={e => setTestSeller(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '2px solid #e2e8f0', fontSize: 13 }}>
              {ZONES.map(z => <option key={z.rank} value={z.short.split('/')[0].trim()}>{z.label}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 4 }}>Anwani ya Mnunuzi</label>
            <input placeholder="e.g. Sinza, Mtaa wa Kijitonyama" value={testAddr}
              onChange={e => setTestAddr(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleTest()}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '2px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <button onClick={handleTest} disabled={testing}
            style={{ width: '100%', background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 11, borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
            {testing ? '⏳ Inakokotoa...' : '🧮 Kokotoa Bei'}
          </button>

          {testResult && !testResult.error && (
            <div style={{ marginTop: 12, backgroundColor: '#f0fdf4', borderRadius: 10, padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#15803d' }}>
                TZS {Number(testResult.fee || 0).toLocaleString()}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{testResult.desc}</div>
            </div>
          )}
          {testResult?.error && (
            <div style={{ marginTop: 10, color: '#dc2626', fontSize: 13 }}>❌ {testResult.error}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BodaRates;