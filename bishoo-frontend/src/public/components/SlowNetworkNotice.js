import React, { useEffect, useState } from 'react';
import { isSlow, subscribeSlow } from '../../api/slowNetwork';
import { reportClientError } from '../../utils/clientErrors';

// Slow internet (owner approved 2026-11-15): shown while something has been loading for more
// than 20 seconds; it goes away by itself when the answer arrives.
export default function SlowNetworkNotice({ page }) {
  const [slow, setSlow] = useState(isSlow);
  useEffect(() => subscribeSlow(setSlow), []);
  useEffect(() => {
    if (slow) reportClientError({ kind: 'slow', page, message: 'Loading took more than 20 seconds' });
  }, [slow, page]);
  if (!slow) return null;
  return (
    <div role="status" data-testid="slow-network"
      style={{ position: 'fixed', left: 12, right: 12, top: 'calc(env(safe-area-inset-top, 0px) + 10px)', zIndex: 3500, maxWidth: 520, margin: '0 auto',
        background: '#0f1419', color: '#fff', borderRadius: 12, padding: '10px 14px', display: 'flex', gap: 12, alignItems: 'center',
        fontSize: 14, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
      <span style={{ flex: 1 }}>Mtandao ni dhaifu — inachukua muda kufungua.</span>
      <button type="button" onClick={() => window.location.reload()}
        style={{ background: '#fff', color: '#0f1419', border: 'none', borderRadius: 16, padding: '6px 12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
        Jaribu tena
      </button>
    </div>
  );
}
