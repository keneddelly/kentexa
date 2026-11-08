/**
 * PickupLive.js — after "Tuma", the sender sees who is coming, like Bolt (owner 2026-11-08:
 * "agents are requested silently ... the system should show available agents with distance; if no
 * agent, show no agent ... even for intercity, no silent request").
 *   waiting   the agents told about the job, nearest first: name, km from the shop, Piga (owner:
 *             the sender may call any of them); "Waambie tena" every 2 minutes; a clear
 *             "Hakuna wakala" with the office to bring it to when none is near or none accepts.
 *   accepted  "<name> amekubali, anakuja" with km and Piga.
 *   office    intercity / drop-off: the office, its place, km, Piga ofisi, Ramani; "Imepokelewa".
 * Live from GET /shipments/:id/pickup-task (every 8 s while open). Only real records are shown.
 */
import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/api';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const GREEN = '#05603a';
const AMBER = '#92400e';
const NO_ONE_MINUTES = 10;
const telOf = (p) => String(p || '').replace(/[^\d+]/g, '');
const km = (d) => (d == null ? null : d < 1 ? `m ${Math.max(100, Math.round(d * 10) * 100)}` : `km ${d}`);
const pill = (dark) => ({ height: 38, padding: '0 16px', borderRadius: 19, border: dark ? 'none' : '1px solid #cfd9de', background: dark ? INK : '#fff',
  color: dark ? '#fff' : INK, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', flexShrink: 0 });
const box = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' };

export const minutesSince = (at, now = Date.now()) => (at ? Math.max(0, Math.floor((now - new Date(at).getTime()) / 60000)) : 0);

const Person = ({ name, sub, phone, testId }) => (
  <div data-testid={testId} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <span style={{ width: 40, height: 40, borderRadius: 20, background: INK, color: '#fff', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {String(name || 'W').charAt(0).toUpperCase()}
    </span>
    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <b style={{ fontSize: 15 }}>{name || 'Wakala'}</b>
      {sub && <span style={{ fontSize: 13, color: MUTED }}>{sub}</span>}
    </span>
    {phone && <a href={`tel:${telOf(phone)}`} style={pill(true)}>Piga</a>}
  </div>
);

export default function PickupLive({ shipmentId, pollMs = 8000 }) {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');
  const [now, setNow] = useState(Date.now());

  const load = useCallback(() => Promise.resolve(api.get(`/shipments/${shipmentId}/pickup-task`))
    .then((r) => { setData(r?.data || null); setNow(Date.now()); }).catch(() => {}), [shipmentId]);
  useEffect(() => {
    if (!shipmentId) return undefined;
    load();
    const t = setInterval(load, pollMs);
    return () => clearInterval(t);
  }, [shipmentId, pollMs, load]);

  const remind = async () => {
    setMsg('');
    try { const r = await api.post(`/shipments/${shipmentId}/pickup-task/remind`); setMsg(`Mawakala ${r?.data?.told ?? 0} wameambiwa tena.`); }
    catch (e) { setMsg(e?.response?.data?.message || 'Imeshindikana. Jaribu tena.'); }
  };

  if (!shipmentId || !data) return null;
  const task = data.task;
  const office = data.office;
  const officeCard = office && (
    <div data-testid="live-office" style={box}>
      <span style={{ fontSize: 13, fontWeight: 700, color: MUTED }}>{task ? 'Mzigo unapelekwa ofisi' : 'Peleka mzigo ofisini'}</span>
      <Person name={office.name} phone={office.phone}
        sub={[office.address || office.city, km(office.distanceKm) && `${km(office.distanceKm)} kutoka kwako`].filter(Boolean).join(' · ')} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {office.mapsUrl && <a href={office.mapsUrl} target="_blank" rel="noreferrer" style={pill(false)}>Ramani</a>}
        <span style={{ fontSize: 14, fontWeight: 700, color: office.received ? GREEN : AMBER }}>
          {office.received ? 'Ofisi imepokea mzigo' : 'Ofisi bado haijapokea'}
        </span>
      </div>
    </div>
  );

  if (!task) return <div data-testid="pickup-live" style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>{officeCard}</div>;

  const waited = minutesSince(task.requestedAt, now);
  let body;
  if (task.status === 'requested') {
    const list = task.nearby || [];
    const long = waited >= NO_ONE_MINUTES;
    body = (
      <div data-testid="live-waiting" style={box}>
        <b style={{ fontSize: 16 }}>{list.length ? 'Tunatafuta wakala' : 'Hakuna wakala karibu sasa hivi'}</b>
        <span style={{ fontSize: 13, color: MUTED }}>
          {list.length ? `Mawakala ${list.length} wa karibu wameambiwa · dakika ${waited}` : 'KenteXa itakuambia mmoja akipatikana. Unaweza kupeleka mzigo ofisini.'}
        </span>
        {list.map((a) => (
          <Person key={a.id} testId={`live-agent-${a.id}`} name={a.name} phone={a.phone}
            sub={[a.distanceKm != null ? `${km(a.distanceKm)} kutoka dukani` : 'hajaweka kituo', a.isOnline ? 'yuko mtandaoni' : null].filter(Boolean).join(' · ')} />
        ))}
        {long && <span data-testid="live-no-one" style={{ fontSize: 14, fontWeight: 700, color: AMBER }}>Hakuna aliyekubali kwa dakika {waited}. Mpigie mmoja, au waambie tena.</span>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" data-testid="live-remind" onClick={remind} style={pill(false)}>Waambie tena</button>
        </div>
        {msg && <span role="status" style={{ fontSize: 13, color: MUTED }}>{msg}</span>}
      </div>
    );
  } else if (task.agent) {
    const text = task.status === 'claimed' ? 'amekubali, anakuja kuchukua' : 'amechukua mzigo';
    body = (
      <div data-testid="live-accepted" style={box}>
        <b style={{ fontSize: 16, color: GREEN }}>{task.agent.name || 'Wakala'} {text}</b>
        <Person name={task.agent.name} phone={task.agent.phone} sub={task.agent.distanceKm != null ? `${km(task.agent.distanceKm)} kutoka dukani (kituo chake)` : null} />
      </div>
    );
  } else {
    const done = ['delivered', 'completed', 'hub_received'].includes(task.status);
    body = <div data-testid="live-other" style={box}><b style={{ fontSize: 16 }}>{done ? 'Mzigo umefika' : task.status === 'cancelled' ? 'Kazi imeghairiwa' : 'Mzigo uko njiani'}</b></div>;
  }
  return <div data-testid="pickup-live" style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>{body}{officeCard}</div>;
}
