/**
 * TransportProviderDashboard.js — Provider publishes availability, manages assignments
 * Place at: src/public/pages/TransportProviderDashboard.js
 * Route: 'TransportProviderDashboard'
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api     from '../../api/api';

// ── Launch scope ──────────────────────────────────────────────────────────
// Operational dashboard (posting routes, availability, accepting
// assignments) re-enabled — the backend endpoints it calls have been live
// all along.
const TRANSPORT_OPS_ENABLED = true;

const getStatusStyle = t => ({
  pending:   { bg: '#fef3c7', text: '#d97706', label: t('transport_provider_dashboard.status_pending') },
  accepted:  { bg: '#dcfce7', text: '#16a34a', label: t('transport_provider_dashboard.status_accepted') },
  declined:  { bg: '#fee2e2', text: '#dc2626', label: t('transport_provider_dashboard.status_declined') },
  collected: { bg: '#dbeafe', text: '#1d4ed8', label: t('transport_provider_dashboard.status_collected') },
  departed:  { bg: '#ede9fe', text: '#7c3aed', label: t('transport_provider_dashboard.status_departed') },
  arrived:   { bg: '#f0fdf4', text: '#16a34a', label: t('transport_provider_dashboard.status_arrived') },
  completed: { bg: '#f8fafc', text: '#64748b', label: t('transport_provider_dashboard.status_completed') },
});

const getAvailStatus = t => ({
  open:      { bg: '#dcfce7', text: '#16a34a', label: t('transport_provider_dashboard.avail_open') },
  full:      { bg: '#fee2e2', text: '#dc2626', label: t('transport_provider_dashboard.avail_full') },
  departed:  { bg: '#f1f5f9', text: '#64748b', label: t('transport_provider_dashboard.avail_departed') },
  cancelled: { bg: '#fef3c7', text: '#d97706', label: t('transport_provider_dashboard.avail_cancelled') },
});

const inp = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box',
  outline: 'none', fontFamily: 'inherit',
};

// Real structured location search (same GET /locations/search + suggestion
// pattern already used in SendShipment.js) — the route form previously
// took origin/destination as bare typed text with no resolution against
// the actual location engine at all, unlike every other place in the app
// that collects a city/place.
const CityInput = ({ label, value, onChange, placeholder }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    if (!value?.trim() || value.trim().length < 2) { setSuggestions([]); return; }
    const timer = setTimeout(() => {
      api.get('/locations/search', { params: { q: value.trim() } })
        .then(r => setSuggestions(r.data || []))
        .catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <div style={{ position: 'relative' }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>{label}</label>
      <input style={inp} value={value} placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setShowList(true); }}
        onFocus={() => setShowList(true)}
        onBlur={() => setTimeout(() => setShowList(false), 150)} />
      {showList && suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
          backgroundColor: '#fff', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
          marginTop: 4, overflow: 'hidden', maxHeight: 200, overflowY: 'auto' }}>
          {suggestions.map((s, i) => (
            <button key={i} type="button"
              onClick={() => { onChange(s.region || s.fullAddress); setShowList(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px',
                border: 'none', borderBottom: '1px solid #f1f5f9', backgroundColor: '#fff',
                cursor: 'pointer', fontSize: 12, color: '#1e293b' }}>
              {s.fullAddress}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const TransportProviderDashboard = ({ onNavigate, onOpenMoment }) => {
  const { t } = useTranslation();
  const STATUS_STYLE = getStatusStyle(t);
  const AVAIL_STATUS = getAvailStatus(t);
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
  const [showRouteForm, setShowRouteForm] = useState(false);
  const [routeForm,     setRouteForm]     = useState({
    routeType: 'intercity',
    originCity: '', destinationCity: '',
    loopStops: '', coverageCity: '', coverageWards: '',
    pricePerKg: '', fixedFee: '', estimatedHours: '', notes: '',
  });
  const [savingRoute, setSavingRoute] = useState(false);

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
    } catch (e) { alert(e.response?.data?.message || t('transport_provider_dashboard.publish_error')); }
    finally { setSavingAvail(false); }
  };

  // Previously there was no way to add a route at all — the Routes tab
  // only ever listed rows a route had to already exist to show, and the
  // "Add Route" button elsewhere in the app just linked back to
  // registration. POST /transport/routes has always existed server-side;
  // this is the first UI that actually calls it.
  const handleAddRoute = async () => {
    try {
      setSavingRoute(true);
      const dto = {
        routeType: routeForm.routeType,
        pricePerKg: routeForm.pricePerKg ? Number(routeForm.pricePerKg) : undefined,
        fixedFee: routeForm.fixedFee ? Number(routeForm.fixedFee) : undefined,
        estimatedHours: routeForm.estimatedHours ? Number(routeForm.estimatedHours) : undefined,
        notes: routeForm.notes || undefined,
      };
      if (routeForm.routeType === 'intercity') {
        dto.originCity = routeForm.originCity;
        dto.destinationCity = routeForm.destinationCity;
      } else if (routeForm.routeType === 'local_loop') {
        dto.loopStops = routeForm.loopStops.split(',').map(s => s.trim()).filter(Boolean);
      } else if (routeForm.routeType === 'last_mile') {
        dto.coverageCity = routeForm.coverageCity;
        dto.coverageWards = routeForm.coverageWards.split(',').map(s => s.trim()).filter(Boolean);
      }
      await api.post('/transport/routes', dto);
      setShowRouteForm(false);
      setRouteForm(p => ({ ...p, originCity: '', destinationCity: '', loopStops: '', coverageCity: '', coverageWards: '', pricePerKg: '', fixedFee: '', estimatedHours: '', notes: '' }));
      fetchAll();
    } catch (e) { alert(e.response?.data?.message || t('transport_provider_dashboard.route_save_error')); }
    finally { setSavingRoute(false); }
  };

  const handleRespond = async (id, accept) => {
    const reason = accept ? null : prompt(t('transport_provider_dashboard.decline_reason_prompt'));
    try {
      await api.patch(`/transport/assignments/${id}/respond`, { accept, declineReason: reason });
      fetchAll();
    } catch { alert(t('transport_provider_dashboard.generic_error')); }
  };

  const handleUpdateStatus = async (id, status) => {
    const proofUrl = ['collected','departed','arrived'].includes(status)
      ? prompt(t('transport_provider_dashboard.proof_url_prompt')) : null;
    try {
      await api.patch(`/transport/assignments/${id}/status`, { status, proofUrl });
      fetchAll();
    } catch { alert(t('transport_provider_dashboard.generic_error')); }
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('back')} title={t('transport_provider_dashboard.header_title')} top={0} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🚌</div>
          <div>{t('transport_provider_dashboard.loading')}</div>
        </div>
      </div>
    </div>
  );

  if (!profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('back')} title={t('transport_provider_dashboard.header_title')} top={0} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🚌</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', marginBottom: 8 }}>
            {t('transport_provider_dashboard.no_account_title')}
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>
            {t('transport_provider_dashboard.no_account_desc')}
          </div>
          <button onClick={() => onNavigate('BecomeTransportProvider')}
            style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none',
              borderRadius: 12, padding: '14px 28px', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
            {t('transport_provider_dashboard.join_now_button')}
          </button>
        </div>
      </div>
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
      <BackBar onBack={() => onNavigate('back')} title={t('transport_provider_dashboard.header_title')} top={0} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 340 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🚌</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', marginBottom: 8 }}>
            {t('transport_provider_dashboard.registered_title')}
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>
            {profile.status === 'verified' ? t('transport_provider_dashboard.status_verified') : profile.status === 'pending' ? t('transport_provider_dashboard.status_under_review') : profile.status}
          </div>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            {t('transport_provider_dashboard.ops_disabled_desc')}
          </div>
        </div>
      </div>
    </div>
  );

  const pendingAssignments = assignments.filter(a => a.status === 'pending');
  const activeAssignments  = assignments.filter(a => ['accepted','collected','departed','arrived'].includes(a.status));

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('back')} title={t('transport_provider_dashboard.header_title')} top={0} />

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
              {profile.status === 'verified' ? t('transport_provider_dashboard.status_verified') : profile.status === 'pending' ? t('transport_provider_dashboard.status_under_review') : '❌ ' + t('transport_provider_dashboard.status_declined')}
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <button onClick={() => onNavigate('TransportProviderSettings')}
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none',
                borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
                color: '#fff', fontSize: 15, marginBottom: 6 }}>⚙️</button>
            <div style={{ fontSize: 28, fontWeight: 900 }}>{profile.completedAssignments || 0}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{t('transport_provider_dashboard.completed_label')}</div>
            {pendingAssignments.length > 0 && (
              <div style={{ backgroundColor: '#ef4444', borderRadius: 100,
                padding: '2px 10px', fontSize: 11, fontWeight: 800, marginTop: 6 }}>
                {t('transport_provider_dashboard.pending_response_badge', { count: pendingAssignments.length })}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', backgroundColor: '#fff', borderRadius: 12,
          padding: 4, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          {[
            { key: 'home',         label: t('transport_provider_dashboard.tab_home') },
            { key: 'availability', label: t('transport_provider_dashboard.tab_availability') },
            { key: 'assignments',  label: `${t('transport_provider_dashboard.tab_assignments')}${assignments.length > 0 ? ` (${assignments.length})` : ''}` },
            { key: 'routes',       label: t('transport_provider_dashboard.tab_routes') },
          ].map(tabItem => (
            <button key={tabItem.key} onClick={() => setTab(tabItem.key)}
              style={{ flex: 1, padding: '9px 4px', border: 'none', cursor: 'pointer',
                borderRadius: 9, fontSize: 11, fontWeight: 700,
                backgroundColor: tab === tabItem.key ? '#1d4ed8' : 'transparent',
                color: tab === tabItem.key ? '#fff' : '#64748b' }}>
              {tabItem.label}
            </button>
          ))}
        </div>

        {/* Home tab — pending assignments */}
        {tab === 'home' && (
          <div>
            {pendingAssignments.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#dc2626', marginBottom: 10 }}>
                  {t('transport_provider_dashboard.needs_response_title', { count: pendingAssignments.length })}
                </div>
                {pendingAssignments.map(a => (
                  <div key={a.id} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16,
                    marginBottom: 10, border: '2px solid #fecaca',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>
                      {a.fromCity} → {a.toCity}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                      {t('transport_provider_dashboard.parcel_count_label', { count: a.parcelCount, weight: a.weightKg })}
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
                        {t('transport_provider_dashboard.accept_button')}
                      </button>
                      <button onClick={() => handleRespond(a.id, false)}
                        style={{ flex: 1, backgroundColor: '#fee2e2', color: '#dc2626',
                          border: 'none', borderRadius: 8, padding: '10px 0',
                          cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                        {t('transport_provider_dashboard.decline_button')}
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
                  {t('transport_provider_dashboard.active_title', { count: activeAssignments.length })}
                </div>
                {activeAssignments.map(a => {
                  const sc = STATUS_STYLE[a.status] || STATUS_STYLE.accepted;
                  const nextStatus =
                    a.status === 'accepted'  ? { status: 'collected', label: t('transport_provider_dashboard.next_status_collected') } :
                    a.status === 'collected' ? { status: 'departed',  label: t('transport_provider_dashboard.next_status_departed') } :
                    a.status === 'departed'  ? { status: 'arrived',   label: t('transport_provider_dashboard.next_status_arrived') } :
                    a.status === 'arrived'   ? { status: 'completed', label: t('transport_provider_dashboard.next_status_completed') } : null;
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
                        {a.trackingNumber || t('transport_provider_dashboard.assignment_number', { id: a.id })} · {t('transport_provider_dashboard.parcel_count_label', { count: a.parcelCount, weight: a.weightKg })}
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
                <div style={{ color: '#64748b' }}>{t('transport_provider_dashboard.no_assignments_title')}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
                  {t('transport_provider_dashboard.no_assignments_desc')}
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
              {t('transport_provider_dashboard.publish_today_button')}
            </button>

            {showAvailForm && (
              <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20,
                marginBottom: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', marginBottom: 16 }}>
                  {t('transport_provider_dashboard.new_trip_title')}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>{t('transport_provider_dashboard.field_date')}</label>
                    <input type="date" style={inp} value={availForm.date}
                      onChange={e => setAvailForm(p => ({ ...p, date: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>{t('transport_provider_dashboard.field_departure_time')}</label>
                    <input type="time" style={inp} value={availForm.departureTime}
                      onChange={e => setAvailForm(p => ({ ...p, departureTime: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>{t('transport_provider_dashboard.field_from')}</label>
                    <input style={inp} value={availForm.fromCity} placeholder="Dar es Salaam"
                      onChange={e => setAvailForm(p => ({ ...p, fromCity: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>{t('transport_provider_dashboard.field_to')}</label>
                    <input style={inp} value={availForm.toCity} placeholder="Mbeya"
                      onChange={e => setAvailForm(p => ({ ...p, toCity: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>{t('transport_provider_dashboard.field_slots')}</label>
                    <input type="number" style={inp} value={availForm.totalSlots}
                      onChange={e => setAvailForm(p => ({ ...p, totalSlots: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>{t('transport_provider_dashboard.field_max_weight')}</label>
                    <input type="number" style={inp} value={availForm.totalCapacityKg}
                      onChange={e => setAvailForm(p => ({ ...p, totalCapacityKg: e.target.value }))} />
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>{t('transport_provider_dashboard.field_notes')}</label>
                  <input style={inp} value={availForm.notes} placeholder={t('transport_provider_dashboard.notes_placeholder')}
                    onChange={e => setAvailForm(p => ({ ...p, notes: e.target.value }))} />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setShowAvailForm(false)}
                    style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none',
                      borderRadius: 8, padding: '10px 0', cursor: 'pointer', fontWeight: 700 }}>
                    {t('transport_provider_dashboard.close_button')}
                  </button>
                  <button onClick={handlePublishAvailability} disabled={savingAvail}
                    style={{ flex: 2, backgroundColor: '#16a34a', color: '#fff', border: 'none',
                      borderRadius: 8, padding: '10px 0', cursor: 'pointer', fontWeight: 800 }}>
                    {savingAvail ? t('transport_provider_dashboard.publishing_button') : t('transport_provider_dashboard.publish_button')}
                  </button>
                </div>
              </div>
            )}

            {availability.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, backgroundColor: '#fff', borderRadius: 14, color: '#94a3b8' }}>
                {t('transport_provider_dashboard.no_availability_yet')}
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
                        {slotsLeft > 0 ? t('transport_provider_dashboard.slots_left', { count: slotsLeft }) : t('transport_provider_dashboard.slots_full')}
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
                <div>{t('transport_provider_dashboard.no_assignments_yet_title')}</div>
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
                    {a.trackingNumber || t('transport_provider_dashboard.assignment_number', { id: a.id })} · {t('transport_provider_dashboard.parcel_count_label', { count: a.parcelCount, weight: a.weightKg })}
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
            <button onClick={() => setShowRouteForm(true)}
              style={{ width: '100%', background: 'linear-gradient(135deg,#1d4ed8,#7c3aed)',
                color: '#fff', border: 'none', borderRadius: 12, padding: '14px 0',
                fontSize: 14, fontWeight: 800, cursor: 'pointer', marginBottom: 16 }}>
              {t('transport_provider_dashboard.add_route_button')}
            </button>

            {showRouteForm && (
              <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20,
                marginBottom: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', marginBottom: 16 }}>
                  {t('transport_provider_dashboard.new_route_title')}
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>{t('transport_provider_dashboard.field_route_type')}</label>
                  <select style={inp} value={routeForm.routeType}
                    onChange={e => setRouteForm(p => ({ ...p, routeType: e.target.value }))}>
                    <option value="intercity">{t('transport_provider_dashboard.route_type_intercity')}</option>
                    <option value="local_loop">{t('transport_provider_dashboard.route_type_local_loop')}</option>
                    <option value="last_mile">{t('transport_provider_dashboard.route_type_last_mile')}</option>
                  </select>
                </div>

                {routeForm.routeType === 'intercity' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <CityInput label={t('transport_provider_dashboard.field_from')}
                      value={routeForm.originCity} placeholder="Dar es Salaam"
                      onChange={v => setRouteForm(p => ({ ...p, originCity: v }))} />
                    <CityInput label={t('transport_provider_dashboard.field_to')}
                      value={routeForm.destinationCity} placeholder="Mbeya"
                      onChange={v => setRouteForm(p => ({ ...p, destinationCity: v }))} />
                  </div>
                )}

                {routeForm.routeType === 'local_loop' && (
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>{t('transport_provider_dashboard.field_loop_stops')}</label>
                    <input style={inp} value={routeForm.loopStops} placeholder="Kariakoo, Buguruni, Mbagala"
                      onChange={e => setRouteForm(p => ({ ...p, loopStops: e.target.value }))} />
                  </div>
                )}

                {routeForm.routeType === 'last_mile' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <CityInput label={t('transport_provider_dashboard.field_coverage_city')}
                      value={routeForm.coverageCity} placeholder="Dar es Salaam"
                      onChange={v => setRouteForm(p => ({ ...p, coverageCity: v }))} />
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>{t('transport_provider_dashboard.field_coverage_wards')}</label>
                      <input style={inp} value={routeForm.coverageWards} placeholder="Bunju, Tegeta"
                        onChange={e => setRouteForm(p => ({ ...p, coverageWards: e.target.value }))} />
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>{t('transport_provider_dashboard.field_price_per_kg')}</label>
                    <input type="number" style={inp} value={routeForm.pricePerKg}
                      onChange={e => setRouteForm(p => ({ ...p, pricePerKg: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>{t('transport_provider_dashboard.field_fixed_fee')}</label>
                    <input type="number" style={inp} value={routeForm.fixedFee}
                      onChange={e => setRouteForm(p => ({ ...p, fixedFee: e.target.value }))} />
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>{t('transport_provider_dashboard.field_estimated_hours')}</label>
                  <input type="number" style={inp} value={routeForm.estimatedHours}
                    onChange={e => setRouteForm(p => ({ ...p, estimatedHours: e.target.value }))} />
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setShowRouteForm(false)}
                    style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none',
                      borderRadius: 8, padding: '10px 0', cursor: 'pointer', fontWeight: 700 }}>
                    {t('transport_provider_dashboard.close_button')}
                  </button>
                  <button onClick={handleAddRoute} disabled={savingRoute}
                    style={{ flex: 2, backgroundColor: '#1d4ed8', color: '#fff', border: 'none',
                      borderRadius: 8, padding: '10px 0', cursor: 'pointer', fontWeight: 800 }}>
                    {savingRoute ? t('transport_provider_dashboard.saving_button') : t('transport_provider_dashboard.save_route_button')}
                  </button>
                </div>
              </div>
            )}

            {routes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, backgroundColor: '#fff', borderRadius: 16, color: '#94a3b8' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🗺️</div>
                <div>{t('transport_provider_dashboard.no_routes_title')}</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>{t('transport_provider_dashboard.no_routes_desc')}</div>
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
                  {r.routeType === 'intercity' ? t('transport_provider_dashboard.route_type_intercity') :
                   r.routeType === 'local_loop' ? t('transport_provider_dashboard.route_type_local_loop') :
                   t('transport_provider_dashboard.route_type_last_mile')}
                  {r.estimatedHours && ` ${t('transport_provider_dashboard.hours_suffix', { hours: r.estimatedHours })}`}
                  {r.pricePerKg > 0 && ` · TZS ${Number(r.pricePerKg).toLocaleString()}/kg`}
                </div>
                <button onClick={() => onOpenMoment?.('selling', {
                    type: 'route', id: r.id, title: routeLabel || t('transport_provider_dashboard.my_route_fallback'), image: null,
                  })}
                  style={{ background:'none', border:'none', cursor:'pointer', padding:0,
                    color:'#2563EB', fontSize:12, fontWeight:700 }}>
                  {t('transport_provider_dashboard.share_moment_button')}
                </button>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TransportProviderDashboard;