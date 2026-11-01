import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/api';

// The agent of an order (owner 2026-11-01). The seller sees who comes for the parcel and the
// code to give them; the buyer sees who brings it and the code to give at the door. The server
// decides every state; this shows it. Codes are never kept: each tap makes a new one.
const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const BLUE = '#1d4ed8';

const btn = (primary) => ({
  height: 44, borderRadius: 22, padding: '0 18px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
  border: primary ? 0 : '1px solid #cfd9de', background: primary ? BLUE : '#fff', color: primary ? '#fff' : INK,
});

const when = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}, ${d.getDate()}/${d.getMonth() + 1}`;
};

/** What the line under "Wakala" says for this viewer and job state. */
export const agentLine = (task, viewer) => {
  if (!task) return null;
  const name = task.agent?.name || 'Wakala';
  const direct = task.servicePath === 'direct_delivery';
  if (viewer === 'seller') {
    if (task.status === 'requested') return 'Mawakala wa karibu wameambiwa. Tunasubiri mmoja akubali kazi.';
    if (task.status === 'claimed') return `${name} anakuja kuchukua mzigo. Akifika, mpe mzigo na namba ya kukabidhi.`;
    if (task.status === 'collected' || task.status === 'awaiting_hub') {
      return `Umemkabidhi ${name} mzigo${task.collectedAt ? ` saa ${when(task.collectedAt)}` : ''}. ${direct ? 'Anaupeleka kwa mteja.' : 'Anaupeleka ofisini.'}`;
    }
    if (task.status === 'hub_received') return `${name} ameufikisha mzigo ofisini.`;
    if (task.status === 'delivered') return `${name} amemfikishia mteja mzigo${task.deliveredAt ? ` saa ${when(task.deliveredAt)}` : ''}.`;
    return null;
  }
  if (task.status === 'requested') return 'Muuzaji anaandaa mzigo. Wakala atakuletea.';
  if (task.status === 'claimed') return `${name} atachukua mzigo kwa muuzaji na kukuletea.`;
  if (task.status === 'collected') return direct ? `${name} ana mzigo wako na yuko njiani kukuletea.` : `${name} anaupeleka mzigo ofisini kwa safari.`;
  if (task.status === 'awaiting_hub' || task.status === 'hub_received') return 'Mzigo uko kwenye safari kuja kwako.';
  if (task.status === 'delivered') return `Umepokea mzigo kutoka kwa ${name}${task.deliveredAt ? ` saa ${when(task.deliveredAt)}` : ''}.`;
  return null;
};

export default function OrderAgentPanel({ orderId, viewer, codAmount = 0, style }) {
  const [task, setTask] = useState(null);
  const [code, setCode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const base = viewer === 'seller' ? `/orders/${orderId}/agent-job` : `/orders/${orderId}/delivery-agent`;

  const load = useCallback(async () => {
    try {
      const res = await api.get(base);
      setTask(res.data?.task ?? null);
    } catch { setTask(null); }
  }, [base]);
  useEffect(() => { load(); }, [load]);

  const showCode = async () => {
    setBusy(true); setError('');
    try {
      const res = await api.post(viewer === 'seller' ? `${base}/handoff-code` : `${base}/receive-code`);
      setCode({ value: res.data.code, seconds: res.data.expiresInSeconds || null });
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || 'Haikufanikiwa. Jaribu tena.');
    } finally { setBusy(false); }
  };

  const line = agentLine(task, viewer);
  if (!task || !line) return null;
  const phone = task.agent?.phone;
  const codeOpen = Boolean(task.canShowCode);

  return (
    <section data-testid="order-agent" style={{ margin: '12px 16px 0', padding: 16, borderRadius: 16, border: `1px solid ${LINE}`, background: '#fff', display: 'flex', flexDirection: 'column', gap: 10, ...style }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: MUTED }}>Wakala</span>
      {task.agent?.name && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <strong style={{ fontSize: 17, flex: 1 }}>{task.agent.name}</strong>
          {phone && <a href={`tel:${phone}`} style={{ ...btn(false), height: 36, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Piga {phone}</a>}
        </div>
      )}
      <span style={{ fontSize: 15, color: INK, lineHeight: 1.45 }}>{line}</span>
      {viewer === 'buyer' && codAmount > 0 && task.status !== 'delivered' && (
        <span style={{ fontSize: 14, color: MUTED }}>Utalipa TZS {Number(codAmount).toLocaleString()} ukipokea mzigo.</span>
      )}
      {codeOpen && (code ? (
        <div data-testid="order-agent-code" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: 6, color: INK }} aria-label={viewer === 'seller' ? 'Namba ya kukabidhi' : 'Namba ya kupokea'}>{code.value}</span>
          <span style={{ fontSize: 13, color: MUTED }}>
            {viewer === 'seller'
              ? `Mpe wakala namba hii akiwa amefika na kupokea mzigo. Inatumika dakika ${Math.round((code.seconds || 600) / 60)}.`
              : 'Mpe wakala namba hii ukishapokea mzigo tu. Namba hii inachukua nafasi ya ile ya SMS.'}
          </span>
        </div>
      ) : (
        <>
          {viewer === 'buyer' && task.receiveCodeSent && (
            <span style={{ fontSize: 14, color: MUTED }}>Namba ya kupokea imetumwa kwa SMS. Kama huioni, onyesha mpya hapa.</span>
          )}
          <button type="button" data-testid="order-agent-show-code" disabled={busy} onClick={showCode} style={btn(true)}>
            {viewer === 'seller' ? 'Onyesha namba ya kukabidhi' : 'Onyesha namba ya kupokea'}
          </button>
        </>
      ))}
      {error && <span role="alert" style={{ fontSize: 14, color: '#b91c1c' }}>{error}</span>}
    </section>
  );
}
