import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * BackBar — universal back navigation bar
 * Usage: <BackBar onBack={() => onNavigate('Home')} title="Product Name" />
 *
 * Defaults to sticking below a 56px Navbar (`top={56}`) since that's how
 * most pages use it. Pages with no Navbar above it (the newer, minimal-chrome
 * pages — no marketplace-style top nav/footer) must pass `top={0}`, or this
 * sticks 56px down the viewport, leaving a blank gap above it.
 */
const BackBar = ({ onBack, title, right, top = 56 }) => {
  const { t } = useTranslation();
  // Only pad for the device notch/status bar when this bar IS the physical
  // top of the screen (top===0, no Navbar above it) — a top={56} bar already
  // sits below Navbar, which owns its own inset handling.
  const padTop = top === 0 ? 'env(safe-area-inset-top, 0px)' : '0px';
  return (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: `calc(10px + ${padTop}) 14px 10px`, backgroundColor: '#fff',
    borderBottom: '1px solid #f1f5f9',
    position: 'sticky', top, zIndex: 90,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  }}>
    <button onClick={onBack}
      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#1d4ed8', padding: '4px 0' }}>
      {t('common.back')}
    </button>
    {title && (
      <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%', textAlign: 'center' }}>
        {title}
      </span>
    )}
    {right ? right : <div style={{ width: 60 }} />}
  </div>
  );
};

export default BackBar;