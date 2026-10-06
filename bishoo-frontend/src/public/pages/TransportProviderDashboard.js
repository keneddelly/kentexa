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

// eslint-disable-next-line no-unused-vars -- kept for the screen it will serve again; an unused-variable warning must not fail the CI build
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

const TransportProviderDashboard = ({ onNavigate, onOpenMoment, inboxUnread }) => {
  const { t } = useTranslation();
  const STATUS_STYLE = getStatusStyle(t);
  const [profile,       setProfile]       = useState(null);
  const [routes,        setRoutes]        = useState([]);
  const [assignments,   setAssignments]   = useState([]);
  const [vanRuns,       setVanRuns]       = useState([]);
  const [runManifest,   setRunManifest]   = useState({});
  const [runBusy,       setRunBusy]       = useState(null);
  const [vanTenders,    setVanTenders]    = useState([]);
  const [vehicles,      setVehicles]      = useState([]);
  const [showRunForm,   setShowRunForm]   = useState(false);
  const [runForm,       setRunForm]       = useState({ routeId:'', scheduledDeparture:'' });
  const [schedules, setSchedules] = useState([]);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ routeId:'', scheduleType:'daily', departureTime:'06:00', daysOfWeek:[], defaultVehicleId:'' });
  const [showVehicleForm,setShowVehicleForm] = useState(false);
  const [routeStops, setRouteStops] = useState({});
  const [stopDraft, setStopDraft] = useState({});
  const [activeHubs, setActiveHubs] = useState([]);
  const [newRouteStops, setNewRouteStops] = useState([]);
  const [vehicleForm,   setVehicleForm]   = useState({ identifier:'', registrationPlate:'', type:'van', parcelCapacity:'', weightCapacityKg:'' });
  const [loading,       setLoading]       = useState(true);
  const [tab,           setTab]           = useState('home');
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
      const [pRes, rRes, asRes, runRes, tenderRes, vehicleRes, scheduleRes] = await Promise.all([
        api.get('/transport/my-profile'),
        api.get('/transport/routes'),
        api.get('/transport/assignments'),
        api.get('/van-pilot/runs').catch(() => ({ data: [] })),
        api.get('/van-pilot/movement-tenders/open').catch(() => ({ data: [] })),
        api.get('/van-pilot/vehicles').catch(() => ({ data: [] })),
        api.get('/van-pilot/schedules').catch(() => ({ data: [] })),
      ]);
      setProfile(pRes.data);
      setRoutes(rRes.data || []);
      setAssignments(asRes.data || []);
      setVanRuns(runRes.data || []);
      setVanTenders(tenderRes.data || []);
      setVehicles(vehicleRes.data || []);
      setSchedules(scheduleRes.data || []);
    } catch { /* not registered yet */ }
    finally { setLoading(false); }
  };

  // Dated transport supply is represented canonically by Transport Runs.\n  // Legacy /transport/availability publishing is intentionally retired from this UI.\n\n  // Previously there was no way to add a route at all — the Routes tab
  // only ever listed rows a route had to already exist to show, and the
  // "Add Route" button elsewhere in the app just linked back to
  // registration. POST /transport/routes has always existed server-side;
  // this is the first UI that actually calls it.
  const loadActiveHubs = async () => {
    try { const res=await api.get('/van-pilot/hubs'); setActiveHubs(res.data || []); }
    catch(e){ alert(e.response?.data?.message || 'Could not load active Kentexa hubs'); }
  };

  const addNewRouteStop = (hubId='') => {
    if(hubId) {
      const hub=activeHubs.find(h=>Number(h.id)===Number(hubId)); if(!hub) return;
      const locationLabel=[hub.address,hub.city].filter(Boolean).join(', ') || hub.businessName;
      setNewRouteStops(p=>[...p,{ locationLabel, superAgentId:Number(hub.id), hubName:hub.businessName }]); return;
    }
    const locationLabel=prompt('Stop location'); if(locationLabel?.trim()) setNewRouteStops(p=>[...p,{locationLabel:locationLabel.trim(),superAgentId:null}]);
  };

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
        if (newRouteStops.length < 2) throw new Error('Add at least two Van stops');
        dto.loopStops = newRouteStops.map(s => s.locationLabel);
      } else if (routeForm.routeType === 'last_mile') {
        dto.coverageCity = routeForm.coverageCity;
        dto.coverageWards = routeForm.coverageWards.split(',').map(s => s.trim()).filter(Boolean);
      }
      const routeRes = await api.post('/transport/routes', dto);
      const createdRoute = routeRes.data;
      if (createdRoute?.id && (routeForm.routeType === 'local_loop' || routeForm.routeType === 'intercity')) {
        const stopsToCreate = routeForm.routeType === 'intercity'
          ? [{ locationLabel: routeForm.originCity, superAgentId: null }, { locationLabel: routeForm.destinationCity, superAgentId: null }]
          : newRouteStops;
        if (stopsToCreate.length < 2 || stopsToCreate.some(s => !s.locationLabel?.trim())) throw new Error('Route needs an origin and destination');
        for (let sequence=0; sequence<stopsToCreate.length; sequence++) {
          const st=stopsToCreate[sequence];
          await api.post(`/van-pilot/routes/${createdRoute.id}/stops`, { sequence, locationLabel:st.locationLabel, superAgentId:st.superAgentId || undefined });
        }
      }
      setNewRouteStops([]);
      setShowRouteForm(false);
      setRouteForm(p => ({ ...p, originCity: '', destinationCity: '', loopStops: '', coverageCity: '', coverageWards: '', pricePerKg: '', fixedFee: '', estimatedHours: '', notes: '' }));
      fetchAll();
    } catch (e) { alert(e.response?.data?.message || t('transport_provider_dashboard.route_save_error')); }
    finally { setSavingRoute(false); }
  };


  const loadRouteStops = async routeId => {
    try { const res=await api.get(`/van-pilot/routes/${routeId}/stops`); setRouteStops(p=>({...p,[routeId]:res.data||[]})); }
    catch(e){ alert(e.response?.data?.message || 'Could not load route stops'); }
  };

  const addCanonicalStop = async routeId => {
    const label=(stopDraft[routeId]||'').trim(); if(!label) return;
    try {
      const existing=routeStops[routeId]||[];
      await api.post(`/van-pilot/routes/${routeId}/stops`, { sequence:existing.length, locationLabel:label });
      setStopDraft(p=>({...p,[routeId]:''})); await loadRouteStops(routeId);
    } catch(e){ alert(e.response?.data?.message || 'Could not add route stop'); }
  };

  const renameCanonicalStop = async (routeId, stop) => {
    const locationLabel=prompt('Stop name', stop.locationLabel); if(!locationLabel || locationLabel===stop.locationLabel) return;
    try { await api.patch(`/van-pilot/routes/${routeId}/stops/${stop.id}`, { locationLabel }); await loadRouteStops(routeId); }
    catch(e){ alert(e.response?.data?.message || 'Could not update stop'); }
  };

  const reorderCanonicalStop = async (routeId, stop, delta) => {
    const sequence=Math.max(0, Number(stop.sequence)+delta);
    try { await api.patch(`/van-pilot/routes/${routeId}/stops/${stop.id}/reorder`, { sequence }); await loadRouteStops(routeId); }
    catch(e){ alert(e.response?.data?.message || 'Could not reorder stop'); }
  };

  const updateVehicle = async vehicle => {
    const identifier=prompt('Vehicle name / identifier', vehicle.identifier); if(!identifier) return;
    const registrationPlate=prompt('Plate number', vehicle.registrationPlate || '') ?? vehicle.registrationPlate;
    try { await api.patch(`/van-pilot/vehicles/${vehicle.id}`, { identifier, registrationPlate }); await fetchAll(); }
    catch(e){ alert(e.response?.data?.message || 'Could not update vehicle'); }
  };

  const deactivateVehicle = async vehicleId => {
    if(!window.confirm('Deactivate this vehicle?')) return;
    try { await api.patch(`/van-pilot/vehicles/${vehicleId}/deactivate`); await fetchAll(); }
    catch(e){ alert(e.response?.data?.message || 'Could not deactivate vehicle'); }
  };

  const deactivateCanonicalStop = async (routeId,stopId) => {
    try { await api.patch(`/van-pilot/routes/${routeId}/stops/${stopId}/deactivate`); await loadRouteStops(routeId); }
    catch(e){ alert(e.response?.data?.message || 'Could not deactivate stop'); }
  };

  const createRecurringSchedule = async () => {
    try {
      setRunBusy('schedule');
      await api.post('/van-pilot/schedules', {
        routeId:Number(scheduleForm.routeId), scheduleType:scheduleForm.scheduleType,
        departureTime:scheduleForm.departureTime,
        daysOfWeek:scheduleForm.scheduleType==='selected_days' ? scheduleForm.daysOfWeek : undefined,
        defaultVehicleId:scheduleForm.defaultVehicleId ? Number(scheduleForm.defaultVehicleId) : undefined,
        autoOpen:true, horizonDays:14,
      });
      setShowScheduleForm(false);
      setScheduleForm({ routeId:'', scheduleType:'daily', departureTime:'06:00', daysOfWeek:[], defaultVehicleId:'' });
      await fetchAll();
    } catch(e) { alert(e.response?.data?.message || 'Could not save recurring schedule'); }
    finally { setRunBusy(null); }
  };

  const deactivateSchedule = async id => {
    try { await api.patch(`/van-pilot/schedules/${id}/deactivate`); await fetchAll(); }
    catch(e){ alert(e.response?.data?.message || 'Could not stop schedule'); }
  };

  const createVanRun = async () => {
    try {
      setRunBusy('create');
      await api.post('/van-pilot/runs', { routeId:Number(runForm.routeId), scheduledDeparture:runForm.scheduledDeparture });
      setShowRunForm(false); setRunForm({ routeId:'', scheduledDeparture:'' }); await fetchAll();
    } catch(e) { alert(e.response?.data?.message || 'Could not create Transport Run'); }
    finally { setRunBusy(null); }
  };

  const addVehicle = async () => {
    try {
      setRunBusy('vehicle');
      await api.post('/van-pilot/vehicles', {
        identifier:vehicleForm.identifier, registrationPlate:vehicleForm.registrationPlate || undefined,
        type:vehicleForm.type, parcelCapacity:vehicleForm.parcelCapacity ? Number(vehicleForm.parcelCapacity) : undefined,
        weightCapacityKg:vehicleForm.weightCapacityKg ? Number(vehicleForm.weightCapacityKg) : undefined,
      });
      setShowVehicleForm(false); setVehicleForm({ identifier:'', registrationPlate:'', type:'van', parcelCapacity:'', weightCapacityKg:'' }); await fetchAll();
    } catch(e) { alert(e.response?.data?.message || 'Could not add vehicle'); }
    finally { setRunBusy(null); }
  };

  const assignVehicle = async (runId, vehicleId) => {
    if (!vehicleId) return;
    try { setRunBusy(runId); await api.post(`/van-pilot/runs/${runId}/vehicle`, { vehicleId:Number(vehicleId) }); await fetchAll(); }
    catch(e) { alert(e.response?.data?.message || 'Could not assign vehicle'); } finally { setRunBusy(null); }
  };

  const acceptTenderIntoRun = async tender => {
    try {
      setRunBusy(`tender-${tender.tenderId}`);
      await api.post('/van-pilot/assignments', {
        runId:Number(tender.runId), parcelId:Number(tender.parcelId),
        loadRunStopId:Number(tender.loadRunStopId), unloadRunStopId:Number(tender.unloadRunStopId),
      });
      await fetchAll(); await loadManifest(tender.runId);
    } catch(e) { alert(e.response?.data?.message || 'Could not add released parcel to Run'); }
    finally { setRunBusy(null); }
  };

  const loadManifest = async runId => {
    try {
      const res = await api.get(`/van-pilot/runs/${runId}/manifest`);
      setRunManifest(p => ({ ...p, [runId]: res.data || [] }));
    } catch (e) { alert(e.response?.data?.message || 'Failed to load Van manifest'); }
  };

  const transitionRun = async (runId, action) => {
    try {
      setRunBusy(runId);
      await api.patch(`/van-pilot/runs/${runId}/${action}`);
      await fetchAll();
      await loadManifest(runId);
    } catch (e) { alert(e.response?.data?.message || 'Transport Run action failed'); }
    finally { setRunBusy(null); }
  };

  const markRunParcel = async (runId, assignmentId, action) => {
    try {
      setRunBusy(assignmentId);
      await api.patch(`/van-pilot/assignments/${assignmentId}/${action}`);
      await loadManifest(runId);
    } catch (e) { alert(e.response?.data?.message || 'Parcel action failed'); }
    finally { setRunBusy(null); }
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
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginBottom: 6 }}>
              <button onClick={() => onNavigate('SellerInbox')} title={t('bottom_nav.messages')}
                style={{ position: 'relative', background: 'rgba(255,255,255,0.1)', border: 'none',
                  borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
                  color: '#fff', fontSize: 15 }}>
                💬
                {inboxUnread > 0 && (
                  <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 14, height: 14,
                    padding: '0 3px', borderRadius: 100, backgroundColor: '#DC2626', color: '#fff',
                    fontSize: 8, fontWeight: 800, lineHeight: '14px', textAlign: 'center' }}>
                    {inboxUnread > 99 ? '99+' : inboxUnread}
                  </span>
                )}
              </button>
              {/* Bottom nav's 4th slot now points to Inbox instead of this
                  (see BottomNav.js) — the route-coverage map needs its own
                  path here so it isn't silently unreachable again, the exact
                  bug that slot's own git history already had once before. */}
              <button onClick={() => onNavigate('RouteCoverageMap')} title={t('bottom_nav.routes')}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none',
                  borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
                  color: '#fff', fontSize: 15 }}>🗺️</button>
              <button onClick={() => onNavigate('TransportProviderSettings')}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none',
                  borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
                  color: '#fff', fontSize: 15 }}>⚙️</button>
            </div>
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
            { key: 'assignments',  label: `${t('transport_provider_dashboard.tab_assignments')}${assignments.length > 0 ? ` (${assignments.length})` : ''}` },
            { key: 'routes',       label: t('transport_provider_dashboard.tab_routes') },
            { key: 'van',          label: `Runs${vanRuns.length ? ` (${vanRuns.length})` : ''}` },
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


        {tab === 'van' && (
          <div>
            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
              <button onClick={() => setShowScheduleForm(v=>!v)} style={{ flex:1, border:'none', borderRadius:10, padding:12, background:'#1d4ed8', color:'#fff', fontWeight:800 }}>+ Daily Schedule</button>
              <button onClick={() => setShowRunForm(v=>!v)} style={{ flex:1, border:'none', borderRadius:10, padding:12, background:'#475569', color:'#fff', fontWeight:800 }}>+ One-off Run</button>
              <button onClick={() => setShowVehicleForm(v=>!v)} style={{ flex:1, border:'none', borderRadius:10, padding:12, background:'#0f172a', color:'#fff', fontWeight:800 }}>+ Vehicle</button>
            </div>
            {showScheduleForm && <div style={{background:'#fff',borderRadius:12,padding:14,marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:900,marginBottom:8}}>Recurring safari</div>
              <select style={inp} value={scheduleForm.routeId} onChange={e=>setScheduleForm(p=>({...p,routeId:e.target.value}))}>
                <option value="">Choose route</option>{routes.filter(r=>r.routeType==='local_loop'||r.routeType==='intercity').map(r=><option key={r.id} value={r.id}>#{r.id} {r.routeType==='intercity'? `${r.originCity} → ${r.destinationCity}`:(r.loopStops||[]).join(' → ')}</option>)}
              </select>
              <select style={{...inp,marginTop:8}} value={scheduleForm.scheduleType} onChange={e=>setScheduleForm(p=>({...p,scheduleType:e.target.value}))}><option value="daily">Every day</option><option value="selected_days">Selected days</option></select>
              {scheduleForm.scheduleType==='selected_days' && <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:8}}>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d,i)=><button type="button" key={d} onClick={()=>setScheduleForm(p=>({...p,daysOfWeek:p.daysOfWeek.includes(i)?p.daysOfWeek.filter(x=>x!==i):[...p.daysOfWeek,i]}))} style={{border:'1px solid #cbd5e1',borderRadius:8,padding:'6px 8px',background:scheduleForm.daysOfWeek.includes(i)?'#dbeafe':'#fff',fontWeight:700}}>{d}</button>)}</div>}
              <input type="time" style={{...inp,marginTop:8}} value={scheduleForm.departureTime} onChange={e=>setScheduleForm(p=>({...p,departureTime:e.target.value}))}/>
              <select style={{...inp,marginTop:8}} value={scheduleForm.defaultVehicleId} onChange={e=>setScheduleForm(p=>({...p,defaultVehicleId:e.target.value}))}><option value="">No default vehicle</option>{vehicles.filter(v=>v.isActive).map(v=><option key={v.id} value={v.id}>{v.identifier}{v.registrationPlate?` · ${v.registrationPlate}`:''}</option>)}</select>
              <div style={{fontSize:11,color:'#64748b',marginTop:7}}>Kentexa will keep the next 14 days of Runs ready automatically. You only manage exceptions.</div>
              <button disabled={!scheduleForm.routeId||!scheduleForm.departureTime||runBusy==='schedule'||(scheduleForm.scheduleType==='selected_days'&&!scheduleForm.daysOfWeek.length)} onClick={createRecurringSchedule} style={{width:'100%',marginTop:8,padding:10,border:'none',borderRadius:8,background:'#16a34a',color:'#fff',fontWeight:800}}>Save recurring schedule</button>
            </div>}
            {schedules.filter(s=>s.isActive).length>0 && <div style={{background:'#fff',borderRadius:12,padding:12,marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:900,marginBottom:6}}>RECURRING SCHEDULES</div>
              {schedules.filter(s=>s.isActive).map(s=><div key={s.id} style={{padding:'8px 0',borderTop:'1px solid #f1f5f9',fontSize:12}}><strong>{s.originCity || (s.loopStops||[])[0]} → {s.destinationCity || (s.loopStops||[]).slice(-1)[0]}</strong> · {s.scheduleType==='daily'?'Every day':'Selected days'} · {String(s.departureTime).slice(0,5)}{s.defaultVehicleIdentifier?` · ${s.defaultVehicleIdentifier}`:''}<button onClick={()=>deactivateSchedule(s.id)} style={{float:'right',border:'none',background:'none',color:'#b91c1c'}}>Stop</button></div>)}
            </div>}
            {showRunForm && <div style={{ background:'#fff', borderRadius:12, padding:14, marginBottom:12 }}>
              <select style={inp} value={runForm.routeId} onChange={e=>setRunForm(p=>({...p,routeId:e.target.value}))}>
                <option value="">Choose route</option>{routes.filter(r=>r.routeType==='local_loop'||r.routeType==='intercity').map(r=><option key={r.id} value={r.id}>#{r.id} {r.routeType==='intercity' ? `${r.originCity} → ${r.destinationCity}` : (r.loopStops||[]).join(' → ')}</option>)}
              </select>
              <input type="datetime-local" style={{...inp,marginTop:8}} value={runForm.scheduledDeparture} onChange={e=>setRunForm(p=>({...p,scheduledDeparture:e.target.value}))}/>
              <button disabled={!runForm.routeId||!runForm.scheduledDeparture||runBusy==='create'} onClick={createVanRun} style={{ width:'100%', marginTop:8, padding:10, border:'none', borderRadius:8, background:'#16a34a', color:'#fff', fontWeight:800 }}>Create Run</button>
            </div>}
            {vehicles.length>0 && <div style={{background:'#fff',borderRadius:12,padding:12,marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:900,marginBottom:6}}>VEHICLES</div>
              {vehicles.map(v=><div key={v.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:11,padding:'6px 0',borderTop:'1px solid #f1f5f9'}}>
                <span><strong>{v.identifier}</strong>{v.registrationPlate ? ` · ${v.registrationPlate}` : ''} · {v.operationalStatus}</span>
                <span><button onClick={()=>updateVehicle(v)} style={{border:'none',background:'none',color:'#1d4ed8'}}>Edit</button>{v.isActive && <button onClick={()=>deactivateVehicle(v.id)} style={{border:'none',background:'none',color:'#b91c1c'}}>Deactivate</button>}</span>
              </div>)}
            </div>}
            {showVehicleForm && <div style={{ background:'#fff', borderRadius:12, padding:14, marginBottom:12 }}>
              <input style={inp} placeholder="Vehicle name / identifier" value={vehicleForm.identifier} onChange={e=>setVehicleForm(p=>({...p,identifier:e.target.value}))}/>
              <input style={{...inp,marginTop:8}} placeholder="Plate number" value={vehicleForm.registrationPlate} onChange={e=>setVehicleForm(p=>({...p,registrationPlate:e.target.value}))}/>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}>
                <input type="number" style={inp} placeholder="Parcel capacity" value={vehicleForm.parcelCapacity} onChange={e=>setVehicleForm(p=>({...p,parcelCapacity:e.target.value}))}/>
                <input type="number" style={inp} placeholder="Max kg" value={vehicleForm.weightCapacityKg} onChange={e=>setVehicleForm(p=>({...p,weightCapacityKg:e.target.value}))}/>
              </div>
              <button disabled={!vehicleForm.identifier||runBusy==='vehicle'} onClick={addVehicle} style={{ width:'100%', marginTop:8, padding:10, border:'none', borderRadius:8, background:'#16a34a', color:'#fff', fontWeight:800 }}>Save Vehicle</button>
            </div>}
            {vanTenders.length>0 && <div style={{marginBottom:16}}>
              <div style={{fontSize:12,fontWeight:900,color:'#7c3aed',marginBottom:7}}>RELEASED TO YOU · {vanTenders.length}</div>
              {vanTenders.map(t=><div key={t.tenderId} style={{background:'#fff',borderRadius:12,padding:12,marginBottom:7}}>
                <div style={{fontSize:13,fontWeight:900}}>{t.trackingNumber || `Parcel #${t.parcelId}`}</div>
                <div style={{fontSize:11,color:'#64748b',margin:'3px 0 8px'}}>{t.loadLocation} → {t.unloadLocation} · Run #{t.runId}{t.weightKg ? ` · ${t.weightKg}kg` : ''}</div>
                <button disabled={runBusy===`tender-${t.tenderId}`} onClick={()=>acceptTenderIntoRun(t)} style={{width:'100%',border:'none',borderRadius:8,padding:9,background:'#1d4ed8',color:'#fff',fontWeight:800}}>Accept into Manifest</button>
              </div>)}
            </div>}
            {vanRuns.length === 0 ? (
              <div style={{ textAlign:'center', padding:40, backgroundColor:'#fff', borderRadius:14, color:'#64748b' }}>
                No Transport Runs yet. Create a Run from a configured local-loop route when the vehicle is scheduled.
              </div>
            ) : vanRuns.map(run => {
              const manifest = runManifest[run.id];
              const next = run.status === 'scheduled' ? 'open' : run.status === 'open' ? 'close' :
                run.status === 'closed' ? 'start' : run.status === 'started' ? 'complete' : null;
              return (
                <div key={run.id} style={{ backgroundColor:'#fff', borderRadius:14, padding:16, marginBottom:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:10, marginBottom:8 }}>
                    <div>
                      <div style={{ fontSize:15, fontWeight:900 }}>Transport Run #{run.id}</div>
                      <div style={{ fontSize:12, color:'#64748b' }}>{new Date(run.scheduledDeparture).toLocaleString()} · Route #{run.routeId}</div>
                    </div>
                    <span style={{ fontSize:11, fontWeight:800, textTransform:'uppercase' }}>{run.status}</span>
                  </div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
                    {!run.vehicleId && vehicles.filter(v=>v.isActive).length>0 && <select defaultValue="" onChange={e=>assignVehicle(run.id,e.target.value)} style={{border:'1px solid #cbd5e1',borderRadius:8,padding:'8px 10px',fontSize:11}}>
                      <option value="">Assign vehicle</option>{vehicles.filter(v=>v.isActive).map(v=><option key={v.id} value={v.id}>{v.identifier}{v.registrationPlate ? ` · ${v.registrationPlate}` : ''}</option>)}
                    </select>}
                    {run.vehicleId && <span style={{fontSize:11,padding:'8px 10px',background:'#f1f5f9',borderRadius:8}}>Vehicle #{run.vehicleId}</span>}
                    <button onClick={() => loadManifest(run.id)} style={{ border:'none', borderRadius:8, padding:'9px 12px', cursor:'pointer', fontWeight:700 }}>Manifest</button>
                    {['scheduled','open','closed'].includes(run.status) && <button disabled={runBusy===run.id} onClick={()=>transitionRun(run.id,'cancel')}
                      style={{border:'none',borderRadius:8,padding:'9px 12px',cursor:'pointer',fontWeight:700,background:'#fee2e2',color:'#b91c1c'}}>Cancel</button>}
                    {next && <button disabled={runBusy === run.id} onClick={() => transitionRun(run.id, next)}
                      style={{ border:'none', borderRadius:8, padding:'9px 12px', cursor:'pointer', fontWeight:800, backgroundColor:'#1d4ed8', color:'#fff' }}>
                      {next === 'open' ? 'Open Run' : next === 'close' ? 'Close Loading' : next === 'start' ? 'Start Van' : 'Complete Run'}
                    </button>}
                  </div>
                  {manifest && (
                    <div>
                      {manifest.length === 0 ? <div style={{ fontSize:12, color:'#94a3b8' }}>No parcels assigned to this Run yet.</div> :
                        manifest.map(a => (
                          <div key={a.id} style={{ borderTop:'1px solid #e2e8f0', padding:'10px 0' }}>
                            <div style={{ fontSize:12, fontWeight:800 }}>{a.trackingNumber || `Parcel #${a.parcelId}`} · {a.recipientName || 'Recipient'}</div>
                            <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>{a.loadLocation} → {a.unloadLocation} · {a.status}</div>
                            <div style={{ display:'flex', gap:6, marginTop:7 }}>
                              {a.status === 'scheduled' && <button disabled={runBusy === a.id} onClick={() => markRunParcel(run.id, a.id, 'loaded')}>Load</button>}
                              {a.status === 'loaded' && <button disabled={runBusy === a.id} onClick={() => markRunParcel(run.id, a.id, 'unloaded')}>Unload</button>}
                              {a.status === 'scheduled' && <button disabled={runBusy === a.id} onClick={() => markRunParcel(run.id, a.id, 'cancel')} style={{color:'#b91c1c'}}>Cancel parcel</button>}
                            </div>
                          </div>
                        ))}
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
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize:12,fontWeight:800,color:'#334155',display:'block',marginBottom:6 }}>Van stops / Kentexa hubs</label>
                    <button type="button" onClick={loadActiveHubs} style={{border:'none',borderRadius:8,padding:'8px 10px',fontWeight:800,marginBottom:8}}>Load active Kentexa hubs</button>
                    {activeHubs.length>0 && <select defaultValue="" onChange={e=>{addNewRouteStop(e.target.value);e.target.value='';}} style={{...inp,marginBottom:8}}>
                      <option value="">Add Super Agent hub…</option>
                      {activeHubs.map(h=><option key={h.id} value={h.id}>{h.businessName} · {h.address || h.city}</option>)}
                    </select>}
                    {newRouteStops.map((st,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',gap:8,padding:'7px 0',fontSize:12,borderTop:'1px solid #f1f5f9'}}>
                      <span><strong>{i+1}. {st.locationLabel}</strong>{st.superAgentId ? ` · ${st.hubName}` : ' · ordinary stop'}</span>
                      <button type="button" onClick={()=>setNewRouteStops(p=>p.filter((_,x)=>x!==i))} style={{border:'none',background:'none',color:'#b91c1c'}}>Remove</button>
                    </div>)}
                    <button type="button" onClick={()=>addNewRouteStop()} style={{border:'1px solid #cbd5e1',borderRadius:8,padding:'7px 10px',background:'#fff',fontWeight:700,marginTop:6}}>+ Ordinary stop</button>
                    <div style={{fontSize:11,color:'#64748b',marginTop:6}}>Use a Kentexa hub where parcels can enter/leave custody. Ordinary stops can still be used as route waypoints.</div>
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
                {r.routeType === 'local_loop' && <div style={{marginTop:10,borderTop:'1px solid #e2e8f0',paddingTop:10}}>
                  <button onClick={()=>loadRouteStops(r.id)} style={{border:'none',borderRadius:8,padding:'7px 10px',fontSize:11,fontWeight:800,cursor:'pointer'}}>Manage Van Stops</button>
                  {routeStops[r.id] && <div style={{marginTop:8}}>
                    {routeStops[r.id].filter(x=>x.isActive!==false).map(st=><div key={st.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:11,padding:'5px 0'}}>
                      <span>{st.sequence+1}. {st.locationLabel}{st.superAgentId ? ` · Hub #${st.superAgentId}` : ''}</span>
                      <span><button onClick={()=>reorderCanonicalStop(r.id,st,-1)} style={{border:'none',background:'none',cursor:'pointer'}}>↑</button><button onClick={()=>reorderCanonicalStop(r.id,st,1)} style={{border:'none',background:'none',cursor:'pointer'}}>↓</button><button onClick={()=>renameCanonicalStop(r.id,st)} style={{border:'none',background:'none',color:'#1d4ed8',cursor:'pointer'}}>Edit</button><button onClick={()=>deactivateCanonicalStop(r.id,st.id)} style={{border:'none',background:'none',color:'#b91c1c',cursor:'pointer'}}>Remove</button></span>
                    </div>)}
                    <div style={{display:'flex',gap:6,marginTop:6}}>
                      <input style={{...inp,padding:8}} placeholder="Add stop" value={stopDraft[r.id]||''} onChange={e=>setStopDraft(p=>({...p,[r.id]:e.target.value}))}/>
                      <button onClick={()=>addCanonicalStop(r.id)} style={{border:'none',borderRadius:8,padding:'0 12px',background:'#1d4ed8',color:'#fff',fontWeight:800}}>Add</button>
                    </div>
                  </div>}
                </div>}
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