/**
 * TransportProviderDashboard.js — Provider publishes availability, manages assignments
 * Place at: src/public/pages/TransportProviderDashboard.js
 * Route: 'TransportProviderDashboard'
 */
import React, { useState, useEffect } from 'react';
import Navbar  from '../components/Navbar';
import BackBar from '../components/BackBar';
import Footer  from '../components/Footer';
import api     from '../../api/api';

// ── Launch scope ──────────────────────────────────────────────────────────
// Registration stays fully open. The operational dashboard (posting routes,
// availability, accepting assignments) stays disabled at launch while that
// logic gets more real-world testing. Flip this back on later.
const TRANSPORT_OPS_ENABLED = false;

const STATUS_STYLE = {
  pending:   { bg: '#fef3c7', text: '#d97706', label: 'Inasubiri' },
  accepted:  { bg: '#dcfce7', text: '#16a34a', label: 'Imekubaliwa' },
  declined:  { bg: '#fee2e2', text: '#dc2626', label: 'Imekataliwa' },
  collected: { bg: '#dbeafe', text: '#1d4ed8', label: 'Imechukuliwa' },
  departed:  { bg: '#ede9fe', text: '#7c3aed', label: 'Njiani' },
  arrived:   { bg: '#f0fdf4', text: '#16a34a', label: 'Imefika' },
  completed: { bg: '#f8fafc', text: '#64748b', label: 'Imekamilika' },
};

const AVAIL_STATUS = {
  open:      { bg: '#dcfce7', text: '#16a34a', label: 'Wazi' },
  full:      { bg: '#fee2e2', text: '#dc2626', label: 'Imejaa' },
  departed:  { bg: '#f1f5f9', text: '#64748b', label: 'Imeondoka' },
  cancelled: { bg: '#fef3c7', text: '#d97706', label: 'Imefutwa' },
};

const inp = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box',
  outline: 'none', fontFamily: 'inherit',
};

const TransportProviderDashboard = ({ onNavigate, isLoggedIn, onLogout, userRole, onOpenMoment }) => {
  const [profile,       setProfile]       = useState(null);
  const [routes,        setRoutes]        = useState([]);
  const [availability,  setAvailability]  = useState([]);
  const [assignments,   setAssignments]   = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [tab,           setTab]           = useState('home');
  const [showAvailForm, setShowAvailForm] = useState(false);
  const [availForm,     setAvailForm]     = useState({
    routeId: '', date: new Date().toISOString().slice(0,10),
    departureTime: '', arrivalEstimate: '', bookingDeadline: '',
    totalSlots: '20', totalCapacityKg: '200',
    fromCity: '', toCity: '', notes: '',
  });
  const [savingAvail, setSavingAvail] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [pRes, rRes, aRes, asRes] = await Promise.all([
        api.get('/transport/my-profile'),
        api.get('/transport/routes'),
        api.get('/transport/availability'),
        api.get('/transport/assignments'),
      ]);
      setProfile(pRes.data);
      setRoutes(rRes.data || []);
      setAvailability(aRes.data || []);
      setAssignments(asRes.data || []);
    } catch { /* not registered yet */ }
    finally { setLoading(false); }
  };

  const handlePublishAvailability = async () => {
    try {
      setSavingAvail(true);
      await api.post('/transport/availability', {
        ...availForm,
        routeId:         availForm.routeId ? Number(availForm.routeId) : undefined,
        totalSlots:      Number(availForm.totalSlots),
        totalCapacityKg: Number(availForm.totalCapacityKg),
      });
      setShowAvailForm(false);
      fetchAll();
    } catch (e) { alert(e.response?.data?.message || 'Imeshindwa'); }
    finally { setSavingAvail(false); }
  };

  const handleRespond = async (id, accept) => {
    const reason = accept ? null : prompt('Sababu ya kukataa (hiari):');
    try {
      await api.patch(`/transport/assignments/${id}/respond`, { accept, declineReason: reason });
      fetchAll();
    } catch { alert('Imeshindwa'); }
  };

  const handleUpdateStatus = async (id, status) => {
    const proofUrl = ['collected','departed','arrived'].includes(status)
      ? prompt(`URL ya picha ya uthibitisho (hiari):`) : null;
    try {
      await api.patch(`/transport/assignments/${id}/status`, { status, proofUrl });
      fetchAll();
    } catch { alert('Imeshindwa'); }
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <Navbar currentPage="TransportProviderDashboard" onNavigate={onNavigate}
        isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🚌</div>
          <div>Inapakia...</div>
        </div>
      </div>
    </div>
  );

  if (!profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <Navbar currentPage="TransportProviderDashboard" onNavigate={onNavigate}
        isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🚌</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', marginBottom: 8 }}>
            Huna akaunti ya usafirishaji
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>
            Jiunge kama msafirishaji na uanze kupata maagizo
          </div>
          <button onClick={() => onNavigate('BecomeTransportProvider')}
            style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none',
              borderRadius: 12, padding: '14px 28px', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
            🚀 Jiunge Sasa
          </button>
        </div>
      </div>
      <Footer onNavigate={onNavigate} />
    </div>
  );

  // ── Launch scope ──────────────────────────────────────────────────────────
  // Registration (BecomeTransportProvider, checked above) stays fully open —
  // transport providers can sign up and get verified from day one. The
  // operational dashboard (Today/Availability/Assignments/Routes) stays
  // disabled until that logic gets more real-world testing. Flip
  // TRANSPORT_OPS_ENABLED back on later; nothing below needs to change.
  if (!TRANSPORT_OPS_ENABLED) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <Navbar currentPage="TransportProviderDashboard" onNavigate={onNavigate}
        isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 340 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🚌</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', marginBottom: 8 }}>
            You're Registered ✅
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>
            {profile.status === 'verified' ? '✅ Verified' : profile.status === 'pending' ? '⏳ Under review' : profile.status}
          </div>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            Posting routes and accepting deliveries is launching soon —
            we'll notify you as soon as it's ready.
          </div>
        </div>
      </div>
      <Footer onNavigate={onNavigate} />
    </div>
  );

  const pendingAssignments = assignments.filter(a => a.status === 'pending');
  const activeAssignments  = assignments.filter(a => ['accepted','collected','departed','arrived'].includes(a.status));

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <Navbar currentPage="TransportProviderDashboard" onNavigate={onNavigate}
        isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => onNavigate('back')} title="🚌 Dashibodi ya Msafirishaji" />

      <div style={{ flex: 1, padding: '16px 16px 40px', maxWidth: 900, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* Profile header */}
        <div style={{ background: 'linear-gradient(135deg,#0f172a,#1d4ed8)', borderRadius: 20,
          padding: 20, marginBottom: 20, color: '#fff', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>{profile.name}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
              {profile.type?.toUpperCase()} · {profile.contactPhone}
            </div>
            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 100, marginTop: 8, display: 'inline-block',
              backgroundColor: profile.status === 'verified' ? '#16a34a' : profile.status === 'pending' ? '#d97706' : '#dc2626',
              color: '#fff', fontWeight: 700 }}>
              {profile.status === 'verified' ? '✅ Imehakikiwa' : profile.status === 'pending' ? '⏳ Inasubiri Ukaguzi' : '❌ Imekataliwa'}
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 900 }}>{profile.completedAssignments || 0}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>Zilizokamilika</div>
            {pendingAssignments.length > 0 && (
              <div style={{ backgroundColor: '#ef4444', borderRadius: 100,
                padding: '2px 10px', fontSize: 11, fontWeight: 800, marginTop: 6 }}>
                {pendingAssignments.length} zinasubiri jibu
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', backgroundColor: '#fff', borderRadius: 12,
          padding: 4, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          {[
            { key: 'home',         label: '🏠 Leo' },
            { key: 'availability', label: '📅 Upatikanaji' },
            { key: 'assignments',  label: `📋 Maagizo${assignments.length > 0 ? ` (${assignments.length})` : ''}` },
            { key: 'routes',       label: '🗺️ Njia' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ flex: 1, padding: '9px 4px', border: 'none', cursor: 'pointer',
                borderRadius: 9, fontSize: 11, fontWeight: 700,
                backgroundColor: tab === t.key ? '#1d4ed8' : 'transparent',
                color: tab === t.key ? '#fff' : '#64748b' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Home tab — pending assignments */}
        {tab === 'home' && (
          <div>
            {pendingAssignments.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#dc2626', marginBottom: 10 }}>
                  ⚠️ Zinahitaji Jibu Lako ({pendingAssignments.length})
                </div>
                {pendingAssignments.map(a => (
                  <div key={a.id} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16,
                    marginBottom: 10, border: '2px solid #fecaca',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>
                      {a.fromCity} → {a.toCity}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                      📦 {a.parcelCount} vifurushi · {a.weightKg}kg
                      {a.scheduledDeparture && ` · ${a.scheduledDeparture}`}
                      {a.trackingNumber && ` · ${a.trackingNumber}`}
                    </div>
                    {a.superAgentNotes && (
                      <div style={{ fontSize: 12, color: '#475569', backgroundColor: '#f8fafc',
                        borderRadius: 8, padding: '6px 10px', marginBottom: 10 }}>
                        "{a.superAgentNotes}"
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => handleRespond(a.id, true)}
                        style={{ flex: 1, backgroundColor: '#dcfce7', color: '#16a34a',
                          border: 'none', borderRadius: 8, padding: '10px 0',
                          cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                        ✅ Kubali
                      </button>
                      <button onClick={() => handleRespond(a.id, false)}
                        style={{ flex: 1, backgroundColor: '#fee2e2', color: '#dc2626',
                          border: 'none', borderRadius: 8, padding: '10px 0',
                          cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                        ❌ Kataa
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Active assignments */}
            {activeAssignments.length > 0 && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 10 }}>
                  🚌 Zinazoendelea ({activeAssignments.length})
                </div>
                {activeAssignments.map(a => {
                  const sc = STATUS_STYLE[a.status] || STATUS_STYLE.accepted;
                  const nextStatus =
                    a.status === 'accepted'  ? { status: 'collected', label: '📦 Nimechukua' } :
                    a.status === 'collected' ? { status: 'departed',  label: '🚌 Nimeondoka' } :
                    a.status === 'departed'  ? { status: 'arrived',   label: '🏙️ Nimefika' } :
                    a.status === 'arrived'   ? { status: 'completed', label: '✅ Imekamilika' } : null;
                  return (
                    <div key={a.id} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16,
                      marginBottom: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ fontSize: 14, fontWeight: 800 }}>{a.fromCity} → {a.toCity}</div>
                        <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 100,
                          backgroundColor: sc.bg, color: sc.text, fontWeight: 700 }}>
                          {sc.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                        {a.trackingNumber || `Mgawo #${a.id}`} · {a.parcelCount} vifurushi
                      </div>
                      {nextStatus && (
                        <button onClick={() => handleUpdateStatus(a.id, nextStatus.status)}
                          style={{ width: '100%', backgroundColor: '#1d4ed8', color: '#fff',
                            border: 'none', borderRadius: 8, padding: '10px 0',
                            cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                          {nextStatus.label}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {pendingAssignments.length === 0 && activeAssignments.length === 0 && (
              <div style={{ textAlign: 'center', padding: 60, backgroundColor: '#fff', borderRadius: 16 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>😴</div>
                <div style={{ color: '#64748b' }}>Hakuna maagizo kwa sasa</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
                  Chapisha upatikanaji wako ili Super Agents wakuone
                </div>
              </div>
            )}
          </div>
        )}

        {/* Availability tab */}
        {tab === 'availability' && (
          <div>
            <button onClick={() => setShowAvailForm(true)}
              style={{ width: '100%', background: 'linear-gradient(135deg,#16a34a,#15803d)',
                color: '#fff', border: 'none', borderRadius: 12, padding: '14px 0',
                fontSize: 14, fontWeight: 800, cursor: 'pointer', marginBottom: 16 }}>
              + Chapisha Upatikanaji wa Leo
            </button>

            {showAvailForm && (
              <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20,
                marginBottom: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', marginBottom: 16 }}>
                  📅 Safari Mpya
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Tarehe *</label>
                    <input type="date" style={inp} value={availForm.date}
                      onChange={e => setAvailForm(p => ({ ...p, date: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Saa ya Kuondoka</label>
                    <input type="time" style={inp} value={availForm.departureTime}
                      onChange={e => setAvailForm(p => ({ ...p, departureTime: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Kutoka</label>
                    <input style={inp} value={availForm.fromCity} placeholder="Dar es Salaam"
                      onChange={e => setAvailForm(p => ({ ...p, fromCity: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Kwenda</label>
                    <input style={inp} value={availForm.toCity} placeholder="Mbeya"
                      onChange={e => setAvailForm(p => ({ ...p, toCity: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Nafasi (vifurushi)</label>
                    <input type="number" style={inp} value={availForm.totalSlots}
                      onChange={e => setAvailForm(p => ({ ...p, totalSlots: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Uzito Max (kg)</label>
                    <input type="number" style={inp} value={availForm.totalCapacityKg}
                      onChange={e => setAvailForm(p => ({ ...p, totalCapacityKg: e.target.value }))} />
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Maelezo (hiari)</label>
                  <input style={inp} value={availForm.notes} placeholder="e.g. Basi la biashara, kinga ya mvua inafaa"
                    onChange={e => setAvailForm(p => ({ ...p, notes: e.target.value }))} />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setShowAvailForm(false)}
                    style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none',
                      borderRadius: 8, padding: '10px 0', cursor: 'pointer', fontWeight: 700 }}>
                    Funga
                  </button>
                  <button onClick={handlePublishAvailability} disabled={savingAvail}
                    style={{ flex: 2, backgroundColor: '#16a34a', color: '#fff', border: 'none',
                      borderRadius: 8, padding: '10px 0', cursor: 'pointer', fontWeight: 800 }}>
                    {savingAvail ? '⏳...' : '✅ Chapisha'}
                  </button>
                </div>
              </div>
            )}

            {availability.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, backgroundColor: '#fff', borderRadius: 14, color: '#94a3b8' }}>
                Bado haujachapisha upatikanaji wowote
              </div>
            ) : availability.map(a => {
              const sc = AVAIL_STATUS[a.status] || AVAIL_STATUS.open;
              const slotsLeft = a.totalSlots - a.usedSlots;
              return (
                <div key={a.id} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16,
                  marginBottom: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>
                        {a.fromCity || a.route?.originCity} → {a.toCity || a.route?.destinationCity}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                        📅 {a.date} {a.departureTime && `· ${a.departureTime}`}
                      </div>
                      <div style={{ fontSize: 12, color: slotsLeft > 0 ? '#16a34a' : '#dc2626', marginTop: 2 }}>
                        {slotsLeft > 0 ? `✅ Nafasi ${slotsLeft} zimebaki` : '❌ Imejaa'}
                        {a.totalCapacityKg > 0 && ` · ${a.totalCapacityKg - a.usedCapacityKg}kg`}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 100,
                      backgroundColor: sc.bg, color: sc.text, fontWeight: 700 }}>
                      {sc.label}
                    </span>
                  </div>
                  {a.notes && (
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 6,
                      backgroundColor: '#f8fafc', borderRadius: 6, padding: '4px 8px' }}>
                      "{a.notes}"
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Assignments tab */}
        {tab === 'assignments' && (
          <div>
            {assignments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, backgroundColor: '#fff', borderRadius: 16, color: '#94a3b8' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                <div>Bado haujapata maagizo yoyote</div>
              </div>
            ) : assignments.map(a => {
              const sc = STATUS_STYLE[a.status] || STATUS_STYLE.pending;
              return (
                <div key={a.id} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16,
                  marginBottom: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{a.fromCity} → {a.toCity}</div>
                    <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 100,
                      backgroundColor: sc.bg, color: sc.text, fontWeight: 700 }}>
                      {sc.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {a.trackingNumber || `Mgawo #${a.id}`} · {a.parcelCount} vifurushi · {a.weightKg}kg
                  </div>
                  {a.agreedPrice && (
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', marginTop: 4 }}>
                      💰 TZS {Number(a.agreedPrice).toLocaleString()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Routes tab */}
        {tab === 'routes' && (
          <div>
            {routes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, backgroundColor: '#fff', borderRadius: 16, color: '#94a3b8' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🗺️</div>
                <div>Bado haujasajili njia yoyote</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>Wasiliana na msaada wa KenteXa kuongeza njia</div>
              </div>
            ) : routes.map(r => {
              const routeLabel = r.routeType === 'intercity'  ? `${r.originCity} → ${r.destinationCity}` :
                   r.routeType === 'local_loop' ? r.loopStops?.join(' → ') :
                   r.coverageWards?.join(', ');
              return (
              <div key={r.id} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16,
                marginBottom: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>
                  {routeLabel}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                  {r.routeType === 'intercity' ? '🚌 Safari ya Miji' :
                   r.routeType === 'local_loop' ? '🔄 Mzunguko wa Ndani' :
                   '🏍️ Utoaji wa Mwisho'}
                  {r.estimatedHours && ` · ~${r.estimatedHours} masaa`}
                  {r.pricePerKg > 0 && ` · TZS ${Number(r.pricePerKg).toLocaleString()}/kg`}
                </div>
                <button onClick={() => onOpenMoment?.('selling', {
                    type: 'route', id: r.id, title: routeLabel || 'My Route', image: null,
                  })}
                  style={{ background:'none', border:'none', cursor:'pointer', padding:0,
                    color:'#2563EB', fontSize:12, fontWeight:700 }}>
                  📸 Share as Moment
                </button>
              </div>
              );
            })}
          </div>
        )}
      </div>
      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default TransportProviderDashboard;