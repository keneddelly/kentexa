/**
 * TransportProviderDashboard.js — Provider publishes availability, manages assignments
 * Place at: src/public/pages/TransportProviderDashboard.js
 * Route: 'TransportProviderDashboard'
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api     from '../../api/api';
import RunBookings from '../components/RunBookings';
import RoutesAwaitingPrice from '../components/RoutesAwaitingPrice';
import { TransportHome, TRANSPORT_COLORS } from '../components/TransportDashboardShell';
import { OfficeScreenHeader, OfficeRow, officeSection } from '../components/OfficeDashboardShell';

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
  const [routesAwaitingPrice, setRoutesAwaitingPrice] = useState(0);
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
  const [quotes,        setQuotes]        = useState([]);
  const [shehena,       setShehena]       = useState([]);
  const [tripBusy,      setTripBusy]      = useState(null);
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
      // KAZI: whole-vehicle requests to price; SAFARI: shehena offices loaded onto me.
      api.get('/quote-requests/inbox').then((r) => setQuotes(r.data?.requests || [])).catch(() => setQuotes([]));
      api.get('/super-agents/shehena/as-transport').then((r) => setShehena(r.data?.shehena || [])).catch(() => setShehena([]));
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
        autoOpen:true, horizonDays:21,
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
          <div style={{ fontSize: 20, fontWeight:800, color: '#1e293b', marginBottom: 8 }}>
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
          <div style={{ fontSize: 20, fontWeight:800, color: '#1e293b', marginBottom: 8 }}>
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
  const quotesToPrice = quotes.filter(q => q.status === 'open' && !q.myOffer);
  const hiredTrips = quotes.filter(q => q.myOffer?.status === 'accepted' && q.trip && q.trip.status !== 'delivered');
  const movingShehena = shehena.filter(x => ['dispatched', 'in_transit'].includes(String(x.status)));

  // SAFARI: one card per trip - everything loaded for the same route and departure moves together.
  const NEXT = {
    accepted:  { status: 'collected', label: 'Nimepakia mzigo' },
    collected: { status: 'departed',  label: 'Tumeondoka, njiani' },
    departed:  { status: 'arrived',   label: 'Tumefika' },
    arrived:   { status: 'completed', label: 'Nimekabidhi ofisini' },
  };
  const ORDER = ['accepted', 'collected', 'departed', 'arrived'];
  const tripsMap = new Map();
  for (const a of activeAssignments) {
    const key = `${a.fromCity}|${a.toCity}|${a.scheduledDeparture || ''}`;
    if (!tripsMap.has(key)) tripsMap.set(key, { key, fromCity: a.fromCity, toCity: a.toCity, departure: a.scheduledDeparture, items: [] });
    tripsMap.get(key).items.push(a);
  }
  const trips = [...tripsMap.values()].map(tr => {
    const stage = ORDER.find(st => tr.items.some(a => a.status === st));
    return { ...tr, stage, parcels: tr.items.reduce((n, a) => n + (Number(a.parcelCount) || 1), 0),
      kg: tr.items.reduce((n, a) => n + (Number(a.weightKg) || 0), 0),
      fare: tr.items.reduce((n, a) => n + (Number(a.agreedPrice) || 0), 0),
      offices: [...new Set(tr.items.map(a => a.assignedBy?.storeName || a.assignedBy?.name).filter(Boolean))] };
  });
  const moveTrip = async (tr) => {
    const next = NEXT[tr.stage]; if (!next) return;
    setTripBusy(tr.key);
    try {
      for (const a of tr.items.filter(x => x.status === tr.stage)) {
        await api.patch(`/transport/assignments/${a.id}/status`, { status: next.status, proofUrl: null });
      }
      await fetchAll();
    } catch (e) { alert(e?.response?.data?.message || t('transport_provider_dashboard.generic_error')); }
    finally { setTripBusy(null); }
  };

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const completed = assignments.filter(a => a.status === 'completed');
  const earnedThisMonth = completed.filter(a => new Date(a.completedAt || a.updatedAt || a.createdAt) >= monthStart)
    .reduce((n, a) => n + (Number(a.agreedPrice) || 0), 0);
  const earnedAll = completed.reduce((n, a) => n + (Number(a.agreedPrice) || 0), 0);
  const shehenaFares = shehena.reduce((n, x) => n + (Number(x.fare) || 0), 0);

  const partnerOffices = (() => {
    const m = new Map();
    for (const a of assignments) {
      const n = a.assignedBy?.storeName || a.assignedBy?.name; if (!n) continue;
      const o = m.get(n) || { name: n, phone: a.assignedBy?.phone || null, loads: 0 }; o.loads += 1; m.set(n, o);
    }
    for (const x of shehena) {
      for (const [n, ph] of [[x.fromOffice, x.fromPhone], [x.toOffice, x.toPhone]]) {
        if (!n) continue; const o = m.get(n) || { name: n, phone: ph || null, loads: 0 }; o.loads += 1; m.set(n, o);
      }
    }
    return [...m.values()].sort((a, b) => b.loads - a.loads);
  })();
  const inviteText = encodeURIComponent(`Tufanye kazi pamoja kwenye KenteXa: fungua ofisi yako, tutapakia mizigo yako. ${window.location.origin}/?join=office`);

  const KIND = { bus: 'Basi', truck: 'Lori', van: 'Van', boda: 'Boda', courier: 'Courier', rail: 'Treni', air: 'Ndege', boat: 'Boti' };
  const TITLE = { kazi: 'KAZI', safari: 'SAFARI', menu: 'Menyu', magari: 'Magari yangu', njia: 'Njia na bei', van: 'Ratiba za van', ofisi: 'Ofisi ninazofanya nazo', mapato: 'Mapato' };
  const MENU_PAGES = ['magari', 'njia', 'van', 'ofisi', 'mapato'];
  const hasVan = vanRuns.length > 0 || schedules.length > 0 || vanTenders.length > 0 || routes.some(r => r.routeType === 'local_loop');
  const card = { background: '#fff', border: '1px solid #eff3f4', borderRadius: 16, padding: 16, marginBottom: 10 };
  const pill = (dark) => ({ height: 44, padding: '0 18px', borderRadius: 22, border: dark ? 'none' : `1px solid ${TRANSPORT_COLORS.line}`,
    background: dark ? TRANSPORT_COLORS.ink : '#fff', color: dark ? '#fff' : TRANSPORT_COLORS.ink, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' });
  const tzs = (n) => `TZS ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
  const empty = (text) => <div style={{ ...card, color: TRANSPORT_COLORS.grey, fontSize: 15 }}>{text}</div>;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f7f9f9', color: TRANSPORT_COLORS.ink }}>
      {tab === 'home'
        ? <BackBar onBack={() => onNavigate('back')} title={t('transport_provider_dashboard.header_title')} top={0} />
        : <OfficeScreenHeader title={TITLE[tab] || 'Usafiri'} backLabel={MENU_PAGES.includes(tab) ? 'Menyu' : 'Mwanzo'}
            onBack={() => setTab(MENU_PAGES.includes(tab) ? 'menu' : 'home')} />}

      <div style={{ flex: 1, padding: '16px 16px calc(124px + env(safe-area-inset-bottom, 0px))', maxWidth: 560, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {tab === 'home' && (
          <TransportHome name={profile.name} kind={KIND[profile.type] || profile.type} status={profile.status}
            kaziCount={pendingAssignments.length + quotesToPrice.length + vanTenders.length}
            safariCount={trips.length + movingShehena.length + hiredTrips.length}
            earnedThisMonth={earnedThisMonth}
            onKazi={() => setTab('kazi')} onSafari={() => setTab('safari')} onMenu={() => setTab('menu')}
            onInbox={() => onNavigate('SellerInbox')} inboxUnread={inboxUnread} />
        )}

        {/* ── KAZI: everything waiting for my answer ── */}
        {tab === 'kazi' && (
          <div data-testid="transport-kazi-list">
            <div style={officeSection}>KUTOKA OFISI · {pendingAssignments.length}</div>
            {pendingAssignments.length === 0 && empty('Hakuna mzigo unaosubiri. Ofisi ikikuchagua, utaona hapa.')}
            {pendingAssignments.map(a => (
              <div key={a.id} style={card}>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{a.fromCity} → {a.toCity}</div>
                <div style={{ fontSize: 15, color: TRANSPORT_COLORS.grey, marginTop: 2 }}>
                  {a.assignedBy?.storeName || a.assignedBy?.name || 'Ofisi'} · Mizigo {a.parcelCount || 1}{Number(a.weightKg) ? ` · ${a.weightKg} kg` : ''}
                  {a.scheduledDeparture ? ` · ${a.scheduledDeparture}` : ''}
                </div>
                {a.agreedPrice && <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{tzs(a.agreedPrice)}</div>}
                {a.superAgentNotes && <div style={{ fontSize: 15, marginTop: 6 }}>{a.superAgentNotes}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button type="button" onClick={() => handleRespond(a.id, true)} style={{ ...pill(true), flex: 1 }}>Kubali</button>
                  <button type="button" onClick={() => handleRespond(a.id, false)} style={{ ...pill(false), flex: 1 }}>Kataa</button>
                </div>
              </div>
            ))}

            <div style={{ ...officeSection, marginTop: 18 }}>MAOMBI YA GARI ZIMA · {quotesToPrice.length}</div>
            {quotesToPrice.length === 0 && empty('Hakuna ombi jipya. Weka aina za magari yako kwenye "Magari yangu" ili yakufikie.')}
            {quotesToPrice.slice(0, 3).map(q => (
              <div key={q.id} style={card}>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{q.fromCity} → {q.toCity}</div>
                <div style={{ fontSize: 15, color: TRANSPORT_COLORS.grey, marginTop: 2 }}>{q.description}{q.travelDate ? ` · ${q.travelDate}` : ''}</div>
              </div>
            ))}
            <OfficeRow title="Toa bei" hint="Maombi yote ya gari zima" count={quotesToPrice.length} onClick={() => onNavigate('QuoteInbox')} testId="transport-quotes" />

            {vanTenders.length > 0 && (
              <>
                <div style={{ ...officeSection, marginTop: 18 }}>VAN: ULIYOPEWA · {vanTenders.length}</div>
                {vanTenders.map(tn => (
                  <div key={tn.tenderId} style={card}>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>{tn.trackingNumber || `Mzigo #${tn.parcelId}`}</div>
                    <div style={{ fontSize: 15, color: TRANSPORT_COLORS.grey, margin: '2px 0 10px' }}>{tn.loadLocation} → {tn.unloadLocation}{tn.weightKg ? ` · ${tn.weightKg} kg` : ''}</div>
                    <button type="button" disabled={runBusy === `tender-${tn.tenderId}`} onClick={() => acceptTenderIntoRun(tn)} style={{ ...pill(true), width: '100%' }}>Pakia kwenye safari</button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* ── SAFARI: my trips; one tap moves the whole load ── */}
        {tab === 'safari' && (
          <div data-testid="transport-safari-list">
            {trips.length === 0 && movingShehena.length === 0 && hiredTrips.length === 0 && empty('Hakuna safari inayoendelea. Ukikubali mzigo kwenye KAZI, safari itaonekana hapa.')}
            {trips.map(tr => (
              <div key={tr.key} style={card} data-testid="transport-trip">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 17, fontWeight: 800 }}>{tr.fromCity} → {tr.toCity}</div>
                  <div style={{ fontSize: 13, color: TRANSPORT_COLORS.grey, whiteSpace: 'nowrap' }}>{STATUS_STYLE[tr.stage]?.label || tr.stage}</div>
                </div>
                <div style={{ fontSize: 15, color: TRANSPORT_COLORS.grey, marginTop: 2 }}>
                  Mizigo {tr.parcels}{tr.kg ? ` · ${tr.kg} kg` : ''}{tr.departure ? ` · ${tr.departure}` : ''}{tr.fare ? ` · ${tzs(tr.fare)}` : ''}
                </div>
                {tr.offices.length > 0 && <div style={{ fontSize: 13, color: TRANSPORT_COLORS.grey, marginTop: 2 }}>Ofisi: {tr.offices.join(', ')}</div>}
                {NEXT[tr.stage] && (
                  <button type="button" disabled={tripBusy === tr.key} onClick={() => moveTrip(tr)} style={{ ...pill(true), width: '100%', marginTop: 12 }}>
                    {tripBusy === tr.key ? 'Inaendelea…' : NEXT[tr.stage].label}
                  </button>
                )}
              </div>
            ))}
            {movingShehena.length > 0 && <div style={{ ...officeSection, marginTop: 18 }}>SHEHENA ZA OFISI · {movingShehena.length}</div>}
            {movingShehena.map(x => (
              <div key={`s${x.id}`} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 17, fontWeight: 800 }}>{x.originCity} → {x.destinationCity}</div>
                  <div style={{ fontSize: 13, color: TRANSPORT_COLORS.grey }}>{x.code || `#${x.id}`}</div>
                </div>
                <div style={{ fontSize: 15, color: TRANSPORT_COLORS.grey, marginTop: 2 }}>
                  Vifurushi {x.parcels}{x.weightKg ? ` · ${x.weightKg} kg` : ''}{x.fare ? ` · ${tzs(x.fare)}` : ''}
                </div>
                <div style={{ fontSize: 13, color: TRANSPORT_COLORS.grey, marginTop: 2 }}>
                  Kutoka: {x.fromOffice || 'Ofisi'}{x.toOffice ? ` · Kwenda: ${x.toOffice}${x.toPhone ? ` (${x.toPhone})` : ''}` : ''}
                </div>
                <div style={{ fontSize: 13, color: TRANSPORT_COLORS.grey, marginTop: 4 }}>Ofisi ya kupokea ndiyo inathibitisha imefika.</div>
              </div>
            ))}
            {hiredTrips.length > 0 && (
              <OfficeRow title="Safari za gari zima" hint="Ulizochaguliwa: njiani, umefika" count={hiredTrips.length} onClick={() => onNavigate('QuoteInbox')} />
            )}
            {hasVan && <OfficeRow title="Safari za van" hint="Ratiba, upakiaji na orodha ya mizigo" count={vanRuns.length} onClick={() => setTab('van')} />}
          </div>
        )}

        {tab === 'menu' && (
          <div data-testid="transport-menu">
            <div style={{ fontSize: 15, color: TRANSPORT_COLORS.grey, marginBottom: 12 }}>Mambo yanayosaidia biashara yako. Kazi ya kila siku iko kwenye KAZI na SAFARI.</div>
            <OfficeRow title="Magari yangu" hint="Aina na uwezo: maombi ya gari zima yanakufikia kwa haya" count={vehicles.filter(v => v.isActive).length} onClick={() => setTab('magari')} />
            <OfficeRow title="Njia na bei" hint="Unakokwenda, na nauli ofisi zinakulipa" count={routes.length} onClick={() => setTab('njia')} />
            {hasVan && <OfficeRow title="Ratiba za van" hint="Safari za van za kila siku" onClick={() => setTab('van')} />}
            <OfficeRow title="Ofisi ninazofanya nazo" hint="Ofisi zinazokupa mizigo; alika ofisi mpya" count={partnerOffices.length} onClick={() => setTab('ofisi')} />
            <OfficeRow title="Mapato" hint="Safari zilizokamilika" onClick={() => setTab('mapato')} />
            <OfficeRow title="Ramani ya njia" hint="Njia zako kwenye ramani" onClick={() => onNavigate('RouteCoverageMap')} />
            <OfficeRow title="Wasifu na mipangilio" hint="Jina, simu, aina ya usafiri" onClick={() => onNavigate('TransportProviderSettings')} />
          </div>
        )}

        {/* ── Magari yangu ── */}
        {tab === 'magari' && (
          <div>
            <div style={{ fontSize: 15, color: TRANSPORT_COLORS.grey, marginBottom: 12 }}>Wateja na ofisi wanaoomba gari zima wanakufikia kwa aina ya magari uliyoweka hapa.</div>
            {vehicles.length === 0 && empty('Bado hujaweka gari.')}
            {vehicles.map(v => (
              <div key={v.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, opacity: v.isActive ? 1 : 0.5 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{v.identifier}{v.registrationPlate ? ` · ${v.registrationPlate}` : ''}</div>
                  <div style={{ fontSize: 13, color: TRANSPORT_COLORS.grey }}>
                    {KIND[v.type] || v.type}{v.weightCapacityKg ? ` · hadi ${Number(v.weightCapacityKg)} kg` : ''}{v.parcelCapacity ? ` · vifurushi ${v.parcelCapacity}` : ''}{v.isActive ? '' : ' · haitumiki'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" onClick={() => updateVehicle(v)} style={{ ...pill(false), height: 36, padding: '0 12px' }}>Badilisha</button>
                  {v.isActive && <button type="button" onClick={() => deactivateVehicle(v.id)} style={{ ...pill(false), height: 36, padding: '0 12px', color: '#b91c1c' }}>Ondoa</button>}
                </div>
              </div>
            ))}
            {!showVehicleForm ? (
              <button type="button" onClick={() => setShowVehicleForm(true)} style={{ ...pill(true), width: '100%', marginTop: 6 }}>+ Ongeza gari</button>
            ) : (
              <div style={card}>
                <label style={{ display: 'block', fontSize: 15, fontWeight: 700, marginBottom: 6 }} htmlFor="veh-name">Jina la gari</label>
                <input id="veh-name" style={{ ...inp, height: 44, fontSize: 16 }} placeholder="Mfano: Fuso nyeupe" value={vehicleForm.identifier} onChange={e => setVehicleForm(p => ({ ...p, identifier: e.target.value }))} />
                <label style={{ display: 'block', fontSize: 15, fontWeight: 700, margin: '10px 0 6px' }} htmlFor="veh-type">Aina</label>
                <select id="veh-type" style={{ ...inp, height: 44, fontSize: 16 }} value={vehicleForm.type} onChange={e => setVehicleForm(p => ({ ...p, type: e.target.value }))}>
                  <option value="van">Van / Kirikuu</option><option value="truck">Lori (Canter, Fuso, kontena)</option><option value="bus">Basi</option>
                  <option value="boda">Boda</option><option value="courier">Courier</option>
                </select>
                <input style={{ ...inp, height: 44, fontSize: 16, marginTop: 10 }} placeholder="Namba ya gari (si lazima)" aria-label="Namba ya gari" value={vehicleForm.registrationPlate} onChange={e => setVehicleForm(p => ({ ...p, registrationPlate: e.target.value }))} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 10 }}>
                  <input type="number" style={{ ...inp, height: 44, fontSize: 16 }} placeholder="Uzito hadi (kg)" aria-label="Uzito hadi (kg)" value={vehicleForm.weightCapacityKg} onChange={e => setVehicleForm(p => ({ ...p, weightCapacityKg: e.target.value }))} />
                  <input type="number" style={{ ...inp, height: 44, fontSize: 16 }} placeholder="Vifurushi hadi" aria-label="Vifurushi hadi" value={vehicleForm.parcelCapacity} onChange={e => setVehicleForm(p => ({ ...p, parcelCapacity: e.target.value }))} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button type="button" onClick={() => setShowVehicleForm(false)} style={{ ...pill(false), flex: 1 }}>Funga</button>
                  <button type="button" disabled={!vehicleForm.identifier || runBusy === 'vehicle'} onClick={addVehicle} style={{ ...pill(true), flex: 2 }}>Hifadhi gari</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Ofisi ninazofanya nazo ── */}
        {tab === 'ofisi' && (
          <div>
            {partnerOffices.length === 0 && empty('Bado hakuna ofisi iliyokupa mzigo kwenye KenteXa.')}
            {partnerOffices.map(o => (
              <div key={o.name} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{o.name}</div>
                  <div style={{ fontSize: 13, color: TRANSPORT_COLORS.grey }}>Mizigo {o.loads}{o.phone ? ` · ${o.phone}` : ''}</div>
                </div>
                {o.phone && <a href={`tel:${o.phone}`} style={{ ...pill(false), height: 36, padding: '0 12px', display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Piga</a>}
              </div>
            ))}
            <a href={`https://wa.me/?text=${inviteText}`} target="_blank" rel="noopener noreferrer"
              style={{ ...pill(true), width: '100%', marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', boxSizing: 'border-box' }}>
              Alika ofisi kwa WhatsApp
            </a>
          </div>
        )}

        {/* ── Mapato ── */}
        {tab === 'mapato' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <div style={card}><div style={{ fontSize: 20, fontWeight: 800 }}>{tzs(earnedThisMonth)}</div><div style={{ fontSize: 13, color: TRANSPORT_COLORS.grey }}>Mwezi huu</div></div>
              <div style={card}><div style={{ fontSize: 20, fontWeight: 800 }}>{tzs(earnedAll)}</div><div style={{ fontSize: 13, color: TRANSPORT_COLORS.grey }}>Jumla ({completed.length} zimekamilika)</div></div>
            </div>
            {shehenaFares > 0 && <div style={card}><div style={{ fontSize: 20, fontWeight: 800 }}>{tzs(shehenaFares)}</div><div style={{ fontSize: 13, color: TRANSPORT_COLORS.grey }}>Nauli za shehena ulizopewa na ofisi</div></div>}
            <div style={{ fontSize: 13, color: TRANSPORT_COLORS.grey, lineHeight: '18px' }}>Kiasi ni nauli mlizokubaliana na ofisi. KenteXa haishiki pesa: ofisi inakulipa moja kwa moja.</div>
          </div>
        )}

        {tab === 'van' && (
          <div>
            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
              <button onClick={() => setShowScheduleForm(v=>!v)} style={{ flex:1, border:'none', borderRadius:10, padding:12, background:'#1d4ed8', color:'#fff', fontWeight:800 }}>+ Ratiba ya kila siku</button>
              <button onClick={() => setShowRunForm(v=>!v)} style={{ flex:1, border:'none', borderRadius:10, padding:12, background:'#475569', color:'#fff', fontWeight:800 }}>+ Safari moja</button>
            </div>
            {showScheduleForm && <div style={{background:'#fff',borderRadius:12,padding:14,marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:800,marginBottom:8}}>Ratiba ya safari</div>
              <select style={inp} value={scheduleForm.routeId} onChange={e=>setScheduleForm(p=>({...p,routeId:e.target.value}))}>
                <option value="">Chagua njia</option>{routes.filter(r=>r.routeType==='local_loop'||r.routeType==='intercity').map(r=><option key={r.id} value={r.id}>#{r.id} {r.routeType==='intercity'? `${r.originCity} → ${r.destinationCity}`:(r.loopStops||[]).join(' → ')}</option>)}
              </select>
              <select style={{...inp,marginTop:8}} value={scheduleForm.scheduleType} onChange={e=>setScheduleForm(p=>({...p,scheduleType:e.target.value}))}><option value="daily">Kila siku</option><option value="selected_days">Siku maalum</option></select>
              {scheduleForm.scheduleType==='selected_days' && <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:8}}>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d,i)=><button type="button" key={d} onClick={()=>setScheduleForm(p=>({...p,daysOfWeek:p.daysOfWeek.includes(i)?p.daysOfWeek.filter(x=>x!==i):[...p.daysOfWeek,i]}))} style={{border:'1px solid #cbd5e1',borderRadius:8,padding:'6px 8px',background:scheduleForm.daysOfWeek.includes(i)?'#dbeafe':'#fff',fontWeight:700}}>{d}</button>)}</div>}
              <input type="time" style={{...inp,marginTop:8}} value={scheduleForm.departureTime} onChange={e=>setScheduleForm(p=>({...p,departureTime:e.target.value}))}/>
              <select style={{...inp,marginTop:8}} value={scheduleForm.defaultVehicleId} onChange={e=>setScheduleForm(p=>({...p,defaultVehicleId:e.target.value}))}><option value="">Bila gari maalum</option>{vehicles.filter(v=>v.isActive).map(v=><option key={v.id} value={v.id}>{v.identifier}{v.registrationPlate?` · ${v.registrationPlate}`:''}</option>)}</select>
              <div style={{fontSize:11,color:'#64748b',marginTop:7}}>KenteXa itaandaa safari za siku 14 zijazo. Wewe badilisha zile tu zenye mabadiliko.</div>
              <button disabled={!scheduleForm.routeId||!scheduleForm.departureTime||runBusy==='schedule'||(scheduleForm.scheduleType==='selected_days'&&!scheduleForm.daysOfWeek.length)} onClick={createRecurringSchedule} style={{width:'100%',marginTop:8,padding:10,border:'none',borderRadius:8,background:'#16a34a',color:'#fff',fontWeight:800}}>Hifadhi ratiba</button>
            </div>}
            {schedules.filter(s=>s.isActive).length>0 && <div style={{background:'#fff',borderRadius:12,padding:12,marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:800,marginBottom:6}}>RATIBA</div>
              {schedules.filter(s=>s.isActive).map(s=><div key={s.id} style={{padding:'8px 0',borderTop:'1px solid #f1f5f9',fontSize:12}}><strong>{s.originCity || (s.loopStops||[])[0]} → {s.destinationCity || (s.loopStops||[]).slice(-1)[0]}</strong> · {s.scheduleType==='daily'?'Kila siku':'Siku maalum'} · {String(s.departureTime).slice(0,5)}{s.defaultVehicleIdentifier?` · ${s.defaultVehicleIdentifier}`:''}<button onClick={()=>deactivateSchedule(s.id)} style={{float:'right',border:'none',background:'none',color:'#b91c1c'}}>Simamisha</button></div>)}
            </div>}
            {showRunForm && <div style={{ background:'#fff', borderRadius:12, padding:14, marginBottom:12 }}>
              <select style={inp} value={runForm.routeId} onChange={e=>setRunForm(p=>({...p,routeId:e.target.value}))}>
                <option value="">Chagua njia</option>{routes.filter(r=>r.routeType==='local_loop'||r.routeType==='intercity').map(r=><option key={r.id} value={r.id}>#{r.id} {r.routeType==='intercity' ? `${r.originCity} → ${r.destinationCity}` : (r.loopStops||[]).join(' → ')}</option>)}
              </select>
              <input type="datetime-local" style={{...inp,marginTop:8}} value={runForm.scheduledDeparture} onChange={e=>setRunForm(p=>({...p,scheduledDeparture:e.target.value}))}/>
              <button disabled={!runForm.routeId||!runForm.scheduledDeparture||runBusy==='create'} onClick={createVanRun} style={{ width:'100%', marginTop:8, padding:10, border:'none', borderRadius:8, background:'#16a34a', color:'#fff', fontWeight:800 }}>Unda safari</button>
            </div>}
            {vanTenders.length>0 && <div style={{marginBottom:16}}>
              <div style={{fontSize:12,fontWeight:800,color:'#7c3aed',marginBottom:7}}>ULIYOPEWA · {vanTenders.length}</div>
              {vanTenders.map(t=><div key={t.tenderId} style={{background:'#fff',borderRadius:12,padding:12,marginBottom:7}}>
                <div style={{fontSize:13,fontWeight:800}}>{t.trackingNumber || `Parcel #${t.parcelId}`}</div>
                <div style={{fontSize:11,color:'#64748b',margin:'3px 0 8px'}}>{t.loadLocation} → {t.unloadLocation} · Run #{t.runId}{t.weightKg ? ` · ${t.weightKg}kg` : ''}</div>
                <button disabled={runBusy===`tender-${t.tenderId}`} onClick={()=>acceptTenderIntoRun(t)} style={{width:'100%',border:'none',borderRadius:8,padding:9,background:'#1d4ed8',color:'#fff',fontWeight:800}}>Pakia kwenye safari</button>
              </div>)}
            </div>}
            {vanRuns.length === 0 ? (
              <div style={{ textAlign:'center', padding:40, backgroundColor:'#fff', borderRadius:14, color:'#64748b' }}>
                Bado hakuna safari za van. Unda safari kutoka njia ya van gari likiwa tayari.
              </div>
            ) : vanRuns.map(run => {
              const manifest = runManifest[run.id];
              const next = run.status === 'scheduled' ? 'open' : run.status === 'open' ? 'close' :
                run.status === 'closed' ? 'start' : run.status === 'started' ? 'complete' : null;
              return (
                <div key={run.id} style={{ backgroundColor:'#fff', borderRadius:14, padding:16, marginBottom:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:10, marginBottom:8 }}>
                    <div>
                      <div style={{ fontSize:15, fontWeight:800 }}>Safari #{run.id}</div>
                      <div style={{ fontSize:12, color:'#64748b' }}>{new Date(run.scheduledDeparture).toLocaleString()} · Route #{run.routeId}</div>
                    </div>
                    <span style={{ fontSize:11, fontWeight:800, textTransform:'uppercase' }}>{run.status}</span>
                  </div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
                    {!run.vehicleId && vehicles.filter(v=>v.isActive).length>0 && <select defaultValue="" onChange={e=>assignVehicle(run.id,e.target.value)} style={{border:'1px solid #cbd5e1',borderRadius:8,padding:'8px 10px',fontSize:11}}>
                      <option value="">Chagua gari</option>{vehicles.filter(v=>v.isActive).map(v=><option key={v.id} value={v.id}>{v.identifier}{v.registrationPlate ? ` · ${v.registrationPlate}` : ''}</option>)}
                    </select>}
                    {run.vehicleId && <span style={{fontSize:11,padding:'8px 10px',background:'#f1f5f9',borderRadius:8}}>Vehicle #{run.vehicleId}</span>}
                    <button onClick={() => loadManifest(run.id)} style={{ border:'none', borderRadius:8, padding:'9px 12px', cursor:'pointer', fontWeight:700 }}>Orodha ya mizigo</button>
                    {['scheduled','open','closed'].includes(run.status) && <button disabled={runBusy===run.id} onClick={()=>transitionRun(run.id,'cancel')}
                      style={{border:'none',borderRadius:8,padding:'9px 12px',cursor:'pointer',fontWeight:700,background:'#fee2e2',color:'#b91c1c'}}>Ghairi</button>}
                    {next && <button disabled={runBusy === run.id} onClick={() => transitionRun(run.id, next)}
                      style={{ border:'none', borderRadius:8, padding:'9px 12px', cursor:'pointer', fontWeight:800, backgroundColor:'#1d4ed8', color:'#fff' }}>
                      {next === 'open' ? 'Fungua safari' : next === 'close' ? 'Funga upakiaji' : next === 'start' ? 'Ondoka' : 'Maliza safari'}
                    </button>}
                  </div>
                  {/* Gate 5: what senders booked on this trip, and one-tap acceptance. */}
                  <RunBookings runId={run.id} onAssigned={() => loadManifest(run.id)} />
                  {manifest && (
                    <div>
                      {manifest.length === 0 ? <div style={{ fontSize:12, color:'#94a3b8' }}>Bado hakuna mzigo kwenye safari hii.</div> :
                        manifest.map(a => (
                          <div key={a.id} style={{ borderTop:'1px solid #e2e8f0', padding:'10px 0' }}>
                            <div style={{ fontSize:12, fontWeight:800 }}>{a.trackingNumber || `Parcel #${a.parcelId}`} · {a.recipientName || 'Recipient'}</div>
                            <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>{a.loadLocation} → {a.unloadLocation} · {a.status}</div>
                            <div style={{ display:'flex', gap:6, marginTop:7 }}>
                              {a.status === 'scheduled' && <button disabled={runBusy === a.id} onClick={() => markRunParcel(run.id, a.id, 'loaded')}>Pakia</button>}
                              {a.status === 'loaded' && <button disabled={runBusy === a.id} onClick={() => markRunParcel(run.id, a.id, 'unloaded')}>Shusha</button>}
                              {a.status === 'scheduled' && <button disabled={runBusy === a.id} onClick={() => markRunParcel(run.id, a.id, 'cancel')} style={{color:'#b91c1c'}}>Ondoa mzigo</button>}
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

        {/* Njia na bei: where I go, and the fare offices pay me */}
        {tab === 'njia' && (
          <div>
            <button onClick={() => setShowRouteForm(true)}
              style={{ width: '100%', background: '#0f1419',
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
                    <label style={{ fontSize:12,fontWeight:800,color:'#334155',display:'block',marginBottom:6 }}>Vituo vya van / ofisi</label>
                    <button type="button" onClick={loadActiveHubs} style={{border:'none',borderRadius:8,padding:'8px 10px',fontWeight:800,marginBottom:8}}>Onyesha ofisi zilizo kwenye KenteXa</button>
                    {activeHubs.length>0 && <select defaultValue="" onChange={e=>{addNewRouteStop(e.target.value);e.target.value='';}} style={{...inp,marginBottom:8}}>
                      <option value="">Ongeza ofisi…</option>
                      {activeHubs.map(h=><option key={h.id} value={h.id}>{h.businessName} · {h.address || h.city}</option>)}
                    </select>}
                    {newRouteStops.map((st,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',gap:8,padding:'7px 0',fontSize:12,borderTop:'1px solid #f1f5f9'}}>
                      <span><strong>{i+1}. {st.locationLabel}</strong>{st.superAgentId ? ` · ${st.hubName}` : ' · kituo cha kawaida'}</span>
                      <button type="button" onClick={()=>setNewRouteStops(p=>p.filter((_,x)=>x!==i))} style={{border:'none',background:'none',color:'#b91c1c'}}>Ondoa</button>
                    </div>)}
                    <button type="button" onClick={()=>addNewRouteStop()} style={{border:'1px solid #cbd5e1',borderRadius:8,padding:'7px 10px',background:'#fff',fontWeight:700,marginTop:6}}>+ Kituo cha kawaida</button>
                    <div style={{fontSize:11,color:'#64748b',marginTop:6}}>Chagua ofisi pale mzigo unapopakiwa au kushushwa. Vituo vya kawaida ni vya kupita tu.</div>
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

            {/* Msafirishaji: the sign-up route waits for its first price ("Weka bei"). */}
            <RoutesAwaitingPrice onPriced={fetchAll} onCount={setRoutesAwaitingPrice} />

            {routes.length === 0 && routesAwaitingPrice > 0 ? null : routes.length === 0 ? (
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
                  <button onClick={()=>loadRouteStops(r.id)} style={{border:'none',borderRadius:8,padding:'7px 10px',fontSize:11,fontWeight:800,cursor:'pointer'}}>Vituo vya van</button>
                  {routeStops[r.id] && <div style={{marginTop:8}}>
                    {routeStops[r.id].filter(x=>x.isActive!==false).map(st=><div key={st.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:11,padding:'5px 0'}}>
                      <span>{st.sequence+1}. {st.locationLabel}{st.superAgentId ? ` · Hub #${st.superAgentId}` : ''}</span>
                      <span><button onClick={()=>reorderCanonicalStop(r.id,st,-1)} style={{border:'none',background:'none',cursor:'pointer'}}>↑</button><button onClick={()=>reorderCanonicalStop(r.id,st,1)} style={{border:'none',background:'none',cursor:'pointer'}}>↓</button><button onClick={()=>renameCanonicalStop(r.id,st)} style={{border:'none',background:'none',color:'#1d4ed8',cursor:'pointer'}}>Edit</button><button onClick={()=>deactivateCanonicalStop(r.id,st.id)} style={{border:'none',background:'none',color:'#b91c1c',cursor:'pointer'}}>Ondoa</button></span>
                    </div>)}
                    <div style={{display:'flex',gap:6,marginTop:6}}>
                      <input style={{...inp,padding:8}} placeholder="Ongeza kituo" value={stopDraft[r.id]||''} onChange={e=>setStopDraft(p=>({...p,[r.id]:e.target.value}))}/>
                      <button onClick={()=>addCanonicalStop(r.id)} style={{border:'none',borderRadius:8,padding:'0 12px',background:'#1d4ed8',color:'#fff',fontWeight:800}}>Ongeza</button>
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
