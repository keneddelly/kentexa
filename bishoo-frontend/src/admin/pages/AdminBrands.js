import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

const EMPTY_BRAND = { name: '', legalName: '', website: '', countryOfOrigin: '', description: '' };
const EMPTY_DISTRIBUTOR = { name: '', contactPhone: '', contactEmail: '' };

const AdminBrands = ({ activePage, onNavigate, onLogout }) => {
  const [tab, setTab] = useState('brands'); // 'brands' | 'distributors'
  const [brands, setBrands] = useState([]);
  const [distributors, setDistributors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [showBrandForm, setShowBrandForm] = useState(false);
  const [brandForm, setBrandForm] = useState(EMPTY_BRAND);
  const [showDistForm, setShowDistForm] = useState(false);
  const [distForm, setDistForm] = useState(EMPTY_DISTRIBUTOR);
  const [saving, setSaving] = useState(false);
  const [ownerBrand, setOwnerBrand] = useState(null); // brand row currently assigning an owner for
  const [ownerUserId, setOwnerUserId] = useState('');

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [b, d] = await Promise.all([
        api.get('/brands', { params: { includeInactive: 'true' } }).catch(() => ({ data: [] })),
        api.get('/distributors').catch(() => ({ data: [] })),
      ]);
      setBrands(b.data || []);
      setDistributors(d.data || []);
    } catch { setError('Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  const showMsg = (m) => { setMessage(m); setTimeout(() => setMessage(''), 4000); };
  const showErr = (m) => { setError(m);   setTimeout(() => setError(''),   4000); };

  const createBrand = async () => {
    if (!brandForm.name.trim()) { showErr('Brand name is required'); return; }
    try {
      setSaving(true);
      await api.post('/brands', {
        name: brandForm.name,
        legalName: brandForm.legalName || undefined,
        website: brandForm.website || undefined,
        countryOfOrigin: brandForm.countryOfOrigin || undefined,
        description: brandForm.description || undefined,
      });
      showMsg('✅ Brand created');
      setShowBrandForm(false); setBrandForm(EMPTY_BRAND);
      fetchAll();
    } catch (err) { showErr(err?.response?.data?.message || 'Failed to create brand'); }
    finally { setSaving(false); }
  };

  const toggleBrandActive = async (brand) => {
    try {
      await api.patch(`/brands/${brand.id}`, { isActive: !brand.isActive });
      fetchAll();
    } catch { showErr('Failed to update brand'); }
  };

  const verifyBrand = async (brand) => {
    try {
      await api.patch(`/brands/${brand.id}/verify`, { status: brand.verificationStatus === 'verified' ? 'unverified' : 'verified' });
      fetchAll();
    } catch { showErr('Failed to update verification'); }
  };

  const assignOwner = async () => {
    const userId = parseInt(ownerUserId, 10);
    if (!userId) { showErr('Enter a valid user ID'); return; }
    try {
      setSaving(true);
      await api.post(`/brands/${ownerBrand.id}/assign-owner`, { userId });
      showMsg(`✅ Brand identity assigned to user #${userId}`);
      setOwnerBrand(null); setOwnerUserId('');
    } catch (err) { showErr(err?.response?.data?.message || 'Failed to assign owner'); }
    finally { setSaving(false); }
  };

  const createDistributor = async () => {
    if (!distForm.name.trim()) { showErr('Distributor name is required'); return; }
    try {
      setSaving(true);
      await api.post('/distributors', {
        name: distForm.name,
        contactInfo: { phone: distForm.contactPhone || undefined, email: distForm.contactEmail || undefined },
      });
      showMsg('✅ Distributor created');
      setShowDistForm(false); setDistForm(EMPTY_DISTRIBUTOR);
      fetchAll();
    } catch (err) { showErr(err?.response?.data?.message || 'Failed to create distributor'); }
    finally { setSaving(false); }
  };

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', marginBottom: 10 };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32 }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>🏷️ Brand Network</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Manage brands and distributors — see Brand Authorizations for reviewing seller requests</p>
          </div>
          <button onClick={() => tab === 'brands' ? setShowBrandForm(true) : setShowDistForm(true)}
            style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            + {tab === 'brands' ? 'New Brand' : 'New Distributor'}
          </button>
        </div>

        {message && <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>{message}</div>}
        {error   && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>❌ {error}</div>}

        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {[{ key: 'brands', label: 'Brands' }, { key: 'distributors', label: 'Distributors' }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                backgroundColor: tab === t.key ? '#6366f1' : '#fff', color: tab === t.key ? '#fff' : '#64748b',
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>⏳ Loading...</div>
        ) : tab === 'brands' ? (
          <div style={{ backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #f1f5f9' }}>
                  {['Name', 'Country', 'Verification', 'Active', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {brands.map((b, idx) => (
                  <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{b.name}</td>
                    <td style={{ padding: '14px 16px', fontSize: 12, color: '#64748b' }}>{b.countryOfOrigin || '—'}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                        backgroundColor: b.verificationStatus === 'verified' ? '#dcfce7' : '#f1f5f9',
                        color: b.verificationStatus === 'verified' ? '#16a34a' : '#64748b' }}>
                        {b.verificationStatus === 'verified' ? '✅ Verified' : 'Unverified'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: 12, color: b.isActive ? '#16a34a' : '#dc2626' }}>{b.isActive ? 'Active' : 'Inactive'}</td>
                    <td style={{ padding: '14px 16px', display: 'flex', gap: 6 }}>
                      <button onClick={() => verifyBrand(b)}
                        style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', border: 'none', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                        {b.verificationStatus === 'verified' ? 'Unverify' : 'Verify'}
                      </button>
                      <button onClick={() => toggleBrandActive(b)}
                        style={{ backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                        {b.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => { setOwnerBrand(b); setOwnerUserId(''); }}
                        style={{ backgroundColor: '#f5f3ff', color: '#7c3aed', border: 'none', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                        Assign Owner
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #f1f5f9' }}>
                  {['Name', 'Contact', 'Verification', 'Active'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {distributors.map((d, idx) => (
                  <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{d.name}</td>
                    <td style={{ padding: '14px 16px', fontSize: 12, color: '#64748b' }}>{d.contactInfo?.phone || d.contactInfo?.email || '—'}</td>
                    <td style={{ padding: '14px 16px', fontSize: 12, color: d.verificationStatus === 'verified' ? '#16a34a' : '#64748b' }}>{d.verificationStatus}</td>
                    <td style={{ padding: '14px 16px', fontSize: 12, color: d.isActive ? '#16a34a' : '#dc2626' }}>{d.isActive ? 'Active' : 'Inactive'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {showBrandForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 24, width: 420 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800 }}>New Brand</h3>
            <input placeholder="Name *" value={brandForm.name} onChange={e => setBrandForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
            <input placeholder="Legal name" value={brandForm.legalName} onChange={e => setBrandForm(f => ({ ...f, legalName: e.target.value }))} style={inputStyle} />
            <input placeholder="Website" value={brandForm.website} onChange={e => setBrandForm(f => ({ ...f, website: e.target.value }))} style={inputStyle} />
            <input placeholder="Country of origin" value={brandForm.countryOfOrigin} onChange={e => setBrandForm(f => ({ ...f, countryOfOrigin: e.target.value }))} style={inputStyle} />
            <textarea placeholder="Description" value={brandForm.description} onChange={e => setBrandForm(f => ({ ...f, description: e.target.value }))} rows={3} style={inputStyle} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => { setShowBrandForm(false); setBrandForm(EMPTY_BRAND); }}
                style={{ flex: 1, padding: 12, borderRadius: 8, border: 'none', backgroundColor: '#f1f5f9', color: '#64748b', cursor: 'pointer', fontWeight: 700 }}>Cancel</button>
              <button onClick={createBrand} disabled={saving}
                style={{ flex: 1, padding: 12, borderRadius: 8, border: 'none', backgroundColor: '#1d4ed8', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
                {saving ? 'Saving...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDistForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 24, width: 420 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800 }}>New Distributor</h3>
            <input placeholder="Name *" value={distForm.name} onChange={e => setDistForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
            <input placeholder="Contact phone" value={distForm.contactPhone} onChange={e => setDistForm(f => ({ ...f, contactPhone: e.target.value }))} style={inputStyle} />
            <input placeholder="Contact email" value={distForm.contactEmail} onChange={e => setDistForm(f => ({ ...f, contactEmail: e.target.value }))} style={inputStyle} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => { setShowDistForm(false); setDistForm(EMPTY_DISTRIBUTOR); }}
                style={{ flex: 1, padding: 12, borderRadius: 8, border: 'none', backgroundColor: '#f1f5f9', color: '#64748b', cursor: 'pointer', fontWeight: 700 }}>Cancel</button>
              <button onClick={createDistributor} disabled={saving}
                style={{ flex: 1, padding: 12, borderRadius: 8, border: 'none', backgroundColor: '#1d4ed8', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
                {saving ? 'Saving...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
      {ownerBrand && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 24, width: 420 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 800 }}>Assign Brand Owner</h3>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#64748b' }}>
              Grants a Kentexa user a "{ownerBrand.name}" brand identity (creates or reassigns its CommerceProfile). This is how a brand's own dashboard access is provisioned — no self-service signup.
            </p>
            <input placeholder="User ID *" type="number" value={ownerUserId} onChange={e => setOwnerUserId(e.target.value)} style={inputStyle} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => { setOwnerBrand(null); setOwnerUserId(''); }}
                style={{ flex: 1, padding: 12, borderRadius: 8, border: 'none', backgroundColor: '#f1f5f9', color: '#64748b', cursor: 'pointer', fontWeight: 700 }}>Cancel</button>
              <button onClick={assignOwner} disabled={saving}
                style={{ flex: 1, padding: 12, borderRadius: 8, border: 'none', backgroundColor: '#7c3aed', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
                {saving ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminBrands;
