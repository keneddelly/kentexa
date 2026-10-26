import React, { useEffect, useState } from 'react';
import api from '../../api/api';

/**
 * Which transport carries this shehena (owner 2026-10-26): the office's own vehicles
 * and its partners on KenteXa first, or another transporter typed by name (allowed
 * while KenteXa is growing). A transporter picked from the list sees the shehena on
 * its own dashboard. The fare stays between the office and the transporter.
 */
const chip = (on) => ({
  minHeight: 44, padding: '8px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
  border: `2px solid ${on ? '#1d4ed8' : '#e2e8f0'}`, background: on ? '#eff6ff' : '#ffffff', color: '#0f172a',
});

export default function ShehenaTransportPicker({ value, onChange, inputStyle }) {
  const [list, setList] = useState([]);
  useEffect(() => {
    api.get('/super-agents/shehena/transport').then((r) => setList(r.data?.transport || [])).catch(() => setList([]));
  }, []);
  const typed = value.transportProviderId == null;
  return (
    <div data-testid="shehena-transport" style={{ marginBottom: 8 }}>
      {list.length > 0 && (
        <div role="radiogroup" aria-label="Usafiri wa shehena" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {list.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={value.transportProviderId === t.id}
              data-testid={`shehena-transport-${t.id}`}
              onClick={() => onChange({ transportProviderId: t.id, transportCompany: t.name })} style={chip(value.transportProviderId === t.id)}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{t.name}</div>
              <div style={{ fontSize: 11, color: '#475569' }}>{t.relation === 'own' ? 'Usafiri wako' : 'Mshirika'}</div>
            </button>
          ))}
          <button type="button" role="radio" aria-checked={typed} onClick={() => onChange({ transportProviderId: null, transportCompany: '' })}
            style={chip(typed)}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Mwingine</div>
            <div style={{ fontSize: 11, color: '#475569' }}>Andika jina</div>
          </button>
        </div>
      )}
      {typed && (
        <input type="text" placeholder="Kampuni ya usafiri (hiari — e.g. Shabiby Bus)" aria-label="Kampuni ya usafiri"
          value={value.transportCompany} onChange={(e) => onChange({ transportProviderId: null, transportCompany: e.target.value })}
          style={inputStyle} />
      )}
    </div>
  );
}
