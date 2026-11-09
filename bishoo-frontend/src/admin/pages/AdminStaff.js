/**
 * Wafanyakazi wa KenteXa (owner 2026-11-09: "create role for manager / customer care and etc ...
 * make KenteXa look like a professional company"). The admin gives a person a staff role by their
 * phone number, and can pause or re-open it. The person then switches to that role from their own
 * account and sees the admin with only their area. Admin only (the server refuses staff here).
 */
import React, { useCallback, useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

export const STAFF_ROLES = [
  ['manager', 'Meneja', 'Anaona na kufanya kila kitu, isipokuwa ada za KenteXa na kuongeza wafanyakazi.'],
  ['customer_care', 'Huduma kwa wateja', 'Anaona watu, oda na mizigo; anajibu ujumbe wa wateja na migogoro. Haoni fedha.'],
  ['finance', 'Fedha', 'Malipo, malipo kwa wauzaji, ankara, ada za KenteXa na ripoti za fedha.'],
  ['moderator', 'Ukaguzi', 'Anakagua Moments, matangazo, maoni na ripoti; anaidhinisha vitambulisho, wauzaji na biashara.'],
];
const NAME = Object.fromEntries(STAFF_ROLES.map(([k, n]) => [k, n]));
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16 };
const input = { height: 40, padding: '0 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 15, fontFamily: 'inherit', background: '#fff' };
const pill = (dark) => ({ height: 38, padding: '0 16px', borderRadius: 19, border: dark ? 'none' : '1px solid #cbd5e1', background: dark ? '#0f172a' : '#fff', color: dark ? '#fff' : '#0f172a', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' });

export default function AdminStaff({ activePage, onNavigate, onLogout }) {
  const [rows, setRows] = useState([]);
  const [phone, setPhone] = useState('');
  const [roleType, setRoleType] = useState('customer_care');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try { const { data } = await api.get('/admin/staff'); setRows(Array.isArray(data) ? data : []); }
    catch (e) { setError(e?.response?.data?.message || 'Wafanyakazi hawakupatikana'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const grant = async () => {
    setError(''); setNotice('');
    if (phone.replace(/\D/g, '').length < 9) { setError('Weka namba ya simu ya mfanyakazi'); return; }
    setBusy(true);
    try {
      await api.post('/admin/staff', { phone: phone.trim(), roleType });
      setNotice(`Amepewa kazi ya ${NAME[roleType]}. Aingie KenteXa, abadilishe akaunti kwenda "${NAME[roleType]}".`);
      setPhone(''); await load();
    } catch (e) { setError(e?.response?.data?.message || 'Imeshindikana'); }
    finally { setBusy(false); }
  };

  const setStatus = async (row, status) => {
    setError(''); setNotice('');
    try { await api.patch(`/admin/staff/${row.id}`, { status }); await load(); }
    catch (e) { setError(e?.response?.data?.message || 'Imeshindikana'); }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32, maxWidth: 980, color: '#0f172a', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Wafanyakazi wa KenteXa</h1>
          <p style={{ margin: '4px 0 0', color: '#64748b' }}>Kila mfanyakazi anaona sehemu ya kazi yake tu. Kila anachofanya kinarekodiwa kwa jina lake (Shughuli).</p>
        </div>
        {error && <p role="alert" style={{ margin: 0, color: '#b91c1c' }}>{error}</p>}
        {notice && <p role="status" style={{ margin: 0, color: '#05603a' }}>{notice}</p>}
        <section style={card}>
          <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>Ongeza mfanyakazi</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input aria-label="Simu ya mfanyakazi" placeholder="Simu (mf. 0712 345 678)" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ ...input, flex: 1, minWidth: 200 }} />
            <select aria-label="Kazi" value={roleType} onChange={(e) => setRoleType(e.target.value)} style={input}>
              {STAFF_ROLES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
            <button type="button" data-testid="staff-grant" disabled={busy} onClick={grant} style={pill(true)}>{busy ? 'Inaongeza...' : 'Mpe kazi'}</button>
          </div>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
            {STAFF_ROLES.map(([k, n, note]) => (
              <div key={k} style={{ fontSize: 13, color: '#475569', background: '#f8fafc', borderRadius: 10, padding: 10 }}><b style={{ color: '#0f172a' }}>{n}</b><br />{note}</div>
            ))}
          </div>
        </section>
        <section style={card}>
          <h2 style={{ margin: '0 0 6px', fontSize: 16 }}>Wafanyakazi ({rows.length})</h2>
          {rows.length === 0 ? <p style={{ color: '#64748b', fontSize: 14 }}>Bado hakuna mfanyakazi.</p> : rows.map((r) => (
            <div key={r.id} data-testid={`staff-${r.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 180 }}>
                <button type="button" onClick={() => onNavigate('AdminPerson', { userId: r.userId })}
                  style={{ background: 'none', border: 'none', padding: 0, fontWeight: 700, color: '#0f172a', cursor: 'pointer', fontFamily: 'inherit', fontSize: 15 }}>{r.name || `#${r.userId}`}</button>
                <span style={{ display: 'block', fontSize: 13, color: '#64748b' }}>{[r.phone, NAME[r.roleType] || r.roleType].filter(Boolean).join(' · ')}</span>
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: r.status === 'active' ? '#05603a' : '#b45309' }}>{r.status === 'active' ? 'Anafanya kazi' : 'Amesimamishwa'}</span>
              {r.status === 'active'
                ? <button type="button" data-testid={`staff-pause-${r.id}`} onClick={() => setStatus(r, 'suspended')} style={pill(false)}>Simamisha</button>
                : <button type="button" data-testid={`staff-open-${r.id}`} onClick={() => setStatus(r, 'active')} style={pill(false)}>Rudisha</button>}
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
