import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/api';

// Super Agent: invite this parcel's transport (or the receiving office) to join KenteXa.
// The message goes out from the agent's OWN WhatsApp or SMS app, never KenteXa's SMS.
// Joining is only an application: KenteXa approval is unchanged and the parcel is not
// assigned to anyone automatically. Swahili, like the rest of the dashboard.

const STATUS = {
  sent: ['Imetumwa', '#64748b'], opened: ['Imefunguliwa', '#1d4ed8'], joined: ['Amejiunga', '#16a34a'],
  confirmed: ['Umethibitisha', '#15803d'], expired: ['Muda umekwisha', '#b91c1c'],
};
const ROLE = { transport_provider: 'Msafirishaji', super_agent: 'Ofisi ya mizigo' };
const inp = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, marginBottom: 8 };
const btn = (bg) => ({ flex: 1, minHeight: 44, borderRadius: 10, border: 'none', backgroundColor: bg, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' });

const PartnerInvitePanel = ({ parcel, defaultPhone = '', defaultName = '' }) => {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState('transport_provider');
  const [phone, setPhone] = useState(defaultPhone);
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null);
  const [list, setList] = useState([]);

  const load = useCallback(() => {
    if (!parcel?.id) return;
    api.get('/partner-invitations/mine', { params: { parcelId: parcel.id } })
      .then((r) => setList(r.data || [])).catch(() => {});
  }, [parcel?.id]);
  useEffect(() => { if (open) load(); }, [open, load]);
  useEffect(() => { if (!open) { setPhone(defaultPhone); setName(defaultName); } }, [defaultPhone, defaultName, open]);

  if (!parcel?.id || !parcel?.waybillNumber) return null;

  const send = async (channel) => {
    setBusy(true); setError(''); setSent(null);
    try {
      const { data } = await api.post('/partner-invitations', { parcelId: parcel.id, phone, name, role, channel });
      setSent({ channel, url: channel === 'whatsapp' ? data.whatsappUrl : data.smsUrl });
      if (channel === 'whatsapp') window.open(data.whatsappUrl, '_blank', 'noopener');
      else window.location.href = data.smsUrl;
      load();
    } catch (e) {
      setError(e?.response?.data?.message || 'Imeshindikana kutuma mwaliko.');
    } finally { setBusy(false); }
  };

  const confirm = async (id) => {
    try { await api.patch(`/partner-invitations/${id}/confirm`); load(); }
    catch (e) { setError(e?.response?.data?.message || 'Imeshindikana kuthibitisha.'); }
  };

  return (
    <div data-testid="partner-invite-panel" style={{ border: '1px dashed #bfdbfe', borderRadius: 12, padding: 12, marginBottom: 10, backgroundColor: '#f8fbff' }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 14, fontWeight: 800, color: '#1d4ed8', width: '100%', textAlign: 'left' }}>
        🤝 Mwalike ajiunge KenteXa {open ? '▲' : '▼'}
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: '#475569', marginBottom: 8, lineHeight: 1.5 }}>
            Mwaliko unatumwa kwa WhatsApp au SMS yako mwenyewe, na mzigo {parcel.waybillNumber}. Akijiunga, KenteXa itakagua ombi lake kama kawaida.
          </div>
          <div role="radiogroup" style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {Object.entries(ROLE).map(([value, label]) => (
              <button key={value} type="button" role="radio" aria-checked={role === value} onClick={() => setRole(value)}
                style={{ flex: 1, minHeight: 40, borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  border: `2px solid ${role === value ? '#1d4ed8' : '#e2e8f0'}`, backgroundColor: role === value ? '#eff6ff' : '#fff', color: '#0f172a' }}>
                {label}
              </button>
            ))}
          </div>
          <input type="tel" placeholder="Namba ya simu (mf. 0712345678)" value={phone} onChange={(e) => setPhone(e.target.value)} style={inp} />
          <input type="text" placeholder="Jina (hiari)" value={name} onChange={(e) => setName(e.target.value)} style={inp} />
          {error && <div role="alert" style={{ fontSize: 13, color: '#b91c1c', marginBottom: 8 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={busy || !phone} onClick={() => send('whatsapp')} style={{ ...btn('#16a34a'), opacity: busy || !phone ? 0.6 : 1 }}>WhatsApp</button>
            <button type="button" disabled={busy || !phone} onClick={() => send('own_sms')} style={{ ...btn('#1d4ed8'), opacity: busy || !phone ? 0.6 : 1 }}>SMS yangu</button>
          </div>
          {sent && (
            <div style={{ fontSize: 13, marginTop: 8 }}>
              Haikufunguka? <a href={sent.url} target={sent.channel === 'whatsapp' ? '_blank' : undefined} rel="noopener noreferrer"
                style={{ color: '#1d4ed8', fontWeight: 700 }}>{sent.channel === 'whatsapp' ? 'Fungua WhatsApp' : 'Fungua SMS'}</a>
            </div>
          )}
          {list.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {list.map((inv) => {
                const [label, color] = STATUS[inv.status] || [inv.status, '#64748b'];
                return (
                  <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '1px solid #e2e8f0', fontSize: 13 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inv.invitedName || inv.invitedPhone} · {ROLE[inv.roleOffered]}
                      </div>
                      <div style={{ color, fontWeight: 700, fontSize: 12 }}>{label}</div>
                    </div>
                    {inv.status === 'joined' && (
                      <button type="button" onClick={() => confirm(inv.id)}
                        style={{ minHeight: 36, padding: '0 12px', borderRadius: 8, border: 'none', backgroundColor: '#15803d', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                        Thibitisha
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PartnerInvitePanel;
