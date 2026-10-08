import React, { useEffect, useState } from 'react';
import api from '../../api/api';

// Delegated Super Agent onboarding. The server validates permissions on every
// request; this page never treats a client-side role flag as authorization.
export default function SuperAgentOnboarding() {
  const [applications, setApplications] = useState([]);
  const [officers, setOfficers] = useState(null);
  const [officerUser, setOfficerUser] = useState(null);\n  const [userQuery, setUserQuery] = useState('');\n  const [userResults, setUserResults] = useState([]);\n  const [searchingUsers, setSearchingUsers] = useState(false);
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    const { data } = await api.get('/super-agents/onboarding/applications');
    setApplications(Array.isArray(data) ? data : []);
    try {
      const result = await api.get('/super-agents/onboarding/officers');
      setOfficers(Array.isArray(result.data) ? result.data : []);
    } catch {
      // Officer registry is admin-only. Delegated officers cannot read it.
      setOfficers(null);
    }
  };

  useEffect(() => {
    let active = true;
    api.get('/super-agents/onboarding/applications')
      .then(({ data }) => { if (active) setApplications(Array.isArray(data) ? data : []); })
      .catch(() => { if (active) setError('Huna ruhusa ya kusimamia maombi haya.'); });
    return () => { active = false; };
  }, []);

  const perform = async (action, success) => {
    setBusy(true); setError(''); setMessage('');
    try { await action(); setMessage(success); await load(); }
    catch (err) { setError(err?.response?.data?.message || 'Ombi halikufanikiwa. Jaribu tena.'); }
    finally { setBusy(false); }
  };

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: 20, fontSize: 16 }}>
      <h1>Usajili wa Super Agent</h1>
      <p>Hakiki maombi, idhinisha Super Agent na rekodi mafunzo yaliyokamilika.</p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {applications.map(item => (
        <section key={item.id} style={{ border: '1px solid #ccd5e2', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <h2>{item.businessName || 'Super Agent'} — #{item.id}</h2>
          <p>{item.city || 'Eneo halijawekwa'} · {item.status}</p>
          <button type="button" disabled={busy || item.status !== 'pending'} onClick={() => perform(
            () => api.patch(`/super-agents/onboarding/applications/${item.id}/approve`),
            'Super Agent ameidhinishwa.'
          )}>Idhinisha</button>
          <label style={{ display: 'block', marginTop: 14 }}>
            Muhtasari wa mafunzo
            <textarea style={{ display: 'block', width: '100%', minHeight: 80, fontSize: 16 }}
              value={notes[item.id] || ''}
              onChange={e => setNotes(previous => ({ ...previous, [item.id]: e.target.value }))}
              placeholder="Eleza mafunzo ya usajili wa mizigo, risiti, malipo na ufuatiliaji." />
          </label>
          <button type="button" disabled={busy || item.status !== 'active' || (notes[item.id] || '').trim().length < 10}
            onClick={() => perform(
              () => api.post(`/super-agents/onboarding/applications/${item.id}/training`, { note: notes[item.id] }),
              'Mafunzo yamerekodiwa.'
            )}>Hifadhi mafunzo</button>
        </section>
      ))}
      {!error && applications.length === 0 && <p>Hakuna maombi yanayosubiri kwa sasa.</p>}
      <section style={{ marginTop: 24 }}>
        <h2>Ruhusa za maafisa</h2>
        <p>Sehemu hii inapatikana kwa Admin pekee.</p>
        <button type="button" disabled={busy} onClick={() => perform(
          async () => {
            const result = await api.get('/super-agents/onboarding/officers');
            setOfficers(result.data);
          }, 'Orodha imesasishwa.'
        )}>Angalia maafisa</button>
        {officers !== null && <>
          <label style={{ display: 'block', marginTop: 12 }}>
            Tafuta mfanyakazi wa Kentexa
            <input type="search" value={userQuery}
              onChange={async e => {
                const value = e.target.value;
                setUserQuery(value);
                setOfficerUser(null);
                if (value.trim().length < 2) { setUserResults([]); return; }
                setSearchingUsers(true);
                try {
                  const result = await api.get('/users/admin/lookup', { params: { q: value.trim() } });
                  setUserResults(Array.isArray(result.data) ? result.data : []);
                } catch { setUserResults([]); }
                finally { setSearchingUsers(false); }
              }}
              placeholder="Jina, simu au email" />
          </label>
          {searchingUsers && <p>Inatafuta...</p>}
          {userResults.map(user => (
            <button key={user.id} type="button"
              onClick={() => { setOfficerUser(user); setUserResults([]); setUserQuery(user.name || user.email || user.phone || ''); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: 6, padding: 10 }}>
              <strong>{user.name || 'Mtumiaji'}</strong><br />
              <span>{user.phone || user.email || `User #${user.id}`}</span>
            </button>
          ))}
          {officerUser && <p>
            Atapewa uwezo: <strong>{officerUser.name || officerUser.email || `User #${officerUser.id}`}</strong>
            {' '}<button type="button" disabled={busy}
              onClick={() => perform(
                () => api.patch(`/super-agents/onboarding/officers/${officerUser.id}`, { enabled: true }),
                'Uwezo wa kuanzisha Super Agent umetolewa.'
              )}>Mpe uwezo wa ku-activate Super Agent</button>
          </p>}
          {officers.map(officer => (
            <p key={officer.userId}>
              User #{officer.userId} — {officer.revokedAt ? 'Ruhusa imeondolewa' : 'Ana ruhusa'}
              {!officer.revokedAt && <button type="button" disabled={busy}
                onClick={() => perform(
                  () => api.patch(`/super-agents/onboarding/officers/${officer.userId}`, { enabled: false }),
                  'Ruhusa imeondolewa.'
                )}>Ondoa ruhusa</button>}
            </p>
          ))}
        </>}
      </section>
    </main>
  );
}
