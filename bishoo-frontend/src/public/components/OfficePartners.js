import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import InviteCarrier from './InviteCarrier';
import { OfficeRow } from './OfficeDashboardShell';

/**
 * Washirika (office menu, mockup screen 6): the transport this office works with -
 * its own vehicles and its partners on KenteXa (GET /super-agents/shehena/transport,
 * the same list the shehena picker uses) - and a WhatsApp invitation from the
 * office's own phone for a transporter or office not on KenteXa yet.
 */
export default function OfficePartners({ officeName }) {
  const [list, setList] = useState(null);
  useEffect(() => {
    api.get('/super-agents/shehena/transport').then((r) => setList(r.data?.transport || [])).catch(() => setList([]));
  }, []);
  return (
    <div data-testid="office-partners">
      <div style={{ background: '#ffffff', border: '2px solid #1d4ed8', borderRadius: 16, padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Alika mshirika</div>
        <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.45 }}>Ujumbe unatoka kwenye simu yako mwenyewe, kwa hiyo mshirika anakujua. Hautumii SMS za KenteXa.</div>
        <InviteCarrier shopName={officeName} destCity={null} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', letterSpacing: '0.04em', margin: '6px 0 8px' }}>USAFIRI UNAOFANYA NAO KAZI</div>
      {list == null && <div style={{ fontSize: 14, color: '#475569' }}>Inapakia…</div>}
      {list && list.length === 0 && (
        <div style={{ fontSize: 14, color: '#475569' }}>Bado hakuna. Msafirishaji akijiunga kupitia mwaliko wako, au ukimtumia shehena, ataonekana hapa.</div>
      )}
      {(list || []).map((t) => (
        <OfficeRow key={t.id} testId={`office-partner-${t.id}`} title={t.name}
          hint={`${t.relation === 'own' ? 'Usafiri wako' : 'Mshirika'}${t.phone ? ` · ${t.phone}` : ''}`} />
      ))}
    </div>
  );
}
