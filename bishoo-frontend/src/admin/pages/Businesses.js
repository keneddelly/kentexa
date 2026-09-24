import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

export default function Businesses({ activePage, onNavigate, onLogout }) {
  const [businesses, setBusinesses] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  async function load() {
    try {
      setError('');
      const response = await api.get('/admin/businesses', { params: { search, status } });
      setBusinesses(response.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load businesses');
    }
  }
  useEffect(() => { load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps -- Search submits on demand.

  async function change(business, action) {
    const reason = window.prompt(`Reason to ${action} ${business.legalName}:`);
    if (reason === null) return;
    if (reason.trim().length < 3) { setError('Enter a reason of at least 3 characters.'); return; }
    if (!window.confirm(`Confirm ${action} for ${business.legalName} (#${business.id})?`)) return;
    try {
      setBusy(business.id);
      setError('');
      await api.post(`/admin/businesses/${business.id}/${action}`, { reason: reason.trim() });
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || `Could not ${action} business`);
    } finally { setBusy(null); }
  }

  return <>
    <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
    <main style={{ marginLeft: 250, padding: 24 }}>
      <h1>Businesses</h1>
      <p>Business status is separate from Seller status. If selling remains suspended after restoring a Business, open Sellers and restore the linked Seller profile there.</p>
      <form onSubmit={event => { event.preventDefault(); load(); }}>
        <input aria-label="Search business name" value={search} onChange={event => setSearch(event.target.value)} placeholder="Business name" />
        <select aria-label="Business status" value={status} onChange={event => setStatus(event.target.value)}>
          <option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option>
        </select>
        <button type="submit">Search</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <table style={{ width: '100%', textAlign: 'left', marginTop: 20 }}>
        <thead><tr><th>ID</th><th>Business</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{businesses.map(business => <tr key={business.id}>
          <td>{business.id}</td><td>{business.legalName}</td><td>{business.status}</td>
          <td><button disabled={busy !== null} onClick={() => change(business, business.status === 'suspended' ? 'restore' : 'suspend')}>
            {business.status === 'suspended' ? 'Restore' : 'Suspend'}
          </button></td>
        </tr>)}</tbody>
      </table>
    </main>
  </>;
}
