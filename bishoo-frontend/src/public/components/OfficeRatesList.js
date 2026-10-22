import React from 'react';

// Dashboard BEI tab: this office's own per-destination rates (shipping_rate), read from
// GET /super-agents/me/price-rule. Read-only; "Hariri Bei" opens Settings to edit them.
// Swahili, like the rest of the dashboard.

const tzs = (n) => `TZS ${Number(n || 0).toLocaleString('en-US')}`;

const OfficeRatesList = ({ rates, onEdit }) => {
  if (!rates || rates.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
        Bado haujaweka bei zako.
        <br />
        <button onClick={onEdit}
          style={{ marginTop: 12, backgroundColor: '#1d4ed8', color: '#fff',
            border: 'none', padding: '10px 20px', borderRadius: 8,
            cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
          + Weka Bei Zangu
        </button>
      </div>
    );
  }
  return (
    <>
      <div data-testid="office-rates-list" style={{ backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 0.6fr',
          backgroundColor: '#f8fafc', padding: '10px 14px',
          fontSize: 11, fontWeight: 800, color: '#64748b' }}>
          <span>MJI</span><span>KWA KG</span><span>BEI YA CHINI</span><span>SIKU</span>
        </div>
        {rates.map((r, i) => (
          <div key={r.destinationCity} style={{ display: 'grid',
            gridTemplateColumns: '1.2fr 1fr 1fr 0.6fr',
            padding: '10px 14px', fontSize: 13,
            backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa',
            borderTop: '1px solid #f1f5f9' }}>
            <span style={{ fontWeight: 700, color: '#1e293b' }}>{r.destinationCity}</span>
            <span style={{ color: '#64748b' }}>{tzs(r.ratePerKg)}</span>
            <span style={{ color: '#16a34a', fontWeight: 700 }}>{tzs(r.minimumCharge)}</span>
            <span style={{ color: '#64748b' }}>{r.estimatedDays ?? '—'}</span>
          </div>
        ))}
      </div>
      <button onClick={onEdit}
        style={{ width: '100%', marginTop: 12, background: '#fff',
          color: '#1d4ed8', border: '2px solid #1d4ed8', padding: 12,
          borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
        ✏️ Hariri Bei
      </button>
    </>
  );
};

export default OfficeRatesList;
