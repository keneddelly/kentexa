import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/api';

// Agent: the sellers you work with as their partner agent. Their pickup jobs reach you
// first for a few minutes. You stay a free agent and can stop at any time.
const AgentPartnerSellersCard = () => {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/seller-agent-partners/as-agent').then((r) => setItems(r.data || [])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!items.length) return null;

  const leave = async (item) => {
    if (!window.confirm(`Acha kuwa wakala mshirika wa ${item.shopName}?`)) return;
    setError('');
    try { await api.patch(`/seller-agent-partners/as-agent/${item.id}/end`); load(); }
    catch (e) { setError(e?.response?.data?.message || 'Imeshindikana.'); }
  };

  return (
    <div data-testid="agent-partner-sellers" style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>🤝 Wauzaji washirika</div>
      <div style={{ fontSize: 12, color: '#64748b', margin: '2px 0 8px', lineHeight: 1.5 }}>
        Kazi zao za kuchukua mizigo zinakufikia wewe kwanza kwa dakika chache.
      </div>
      {error && <div role="alert" style={{ fontSize: 13, color: '#b91c1c', marginBottom: 6 }}>{error}</div>}
      {items.map((item) => (
        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '1px solid #e2e8f0' }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.shopName}
          </div>
          <button type="button" onClick={() => leave(item)}
            style={{ minHeight: 34, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#b91c1c', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            Acha
          </button>
        </div>
      ))}
    </div>
  );
};

export default AgentPartnerSellersCard;
