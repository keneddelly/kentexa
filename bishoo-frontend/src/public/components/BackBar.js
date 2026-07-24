import React from 'react';

/**
 * BackBar — universal back navigation bar
 * Usage: <BackBar onBack={() => onNavigate('Home')} title="Product Name" />
 */
const BackBar = ({ onBack, title, right }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px', backgroundColor: '#fff',
    borderBottom: '1px solid #f1f5f9',
    position: 'sticky', top: 56, zIndex: 90,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  }}>
    <button onClick={onBack}
      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#1d4ed8', padding: '4px 0' }}>
      ← Back
    </button>
    {title && (
      <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%', textAlign: 'center' }}>
        {title}
      </span>
    )}
    {right ? right : <div style={{ width: 60 }} />}
  </div>
);

export default BackBar;