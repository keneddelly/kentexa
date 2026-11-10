/**
 * "Uza tena" (resell), owner approved 2026-11-09: the person's reselling in one place.
 *   Ofa zangu        their offers: price, profit for one sale, orders, link to share, stop
 *   Bidhaa za kuuza  products suppliers opened for resellers, with the profit at the shop price
 *   Faida zangu      every order from their links and where its profit stands; "Nimepokea" or
 *                    "Sijapokea" once the shop says it paid (R3)
 *   Wauzaji wangu    for a shop: what it owes each reseller; "Nimelipa" with the M-Pesa reference
 * GET /resale/mine, /resale/products, /resale/profits, /resale/supplier-orders;
 * DELETE /resale/offers/:id; POST /resale/orders/:id/paid | confirm | dispute.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import { resaleLink, shareToStatus, STATUS_DONE } from '../../utils/resaleShare';
import ResaleCatalogue from '../components/ResaleCatalogue';

const B = '#1d4ed8';
const DK = '#0f1419';
const GR = '#536471';
const LINE = '#eff3f4';
const WH = '#ffffff';
const tzs = (n) => `TZS ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const thumb = { width: 56, height: 56, borderRadius: 10, objectFit: 'cover', backgroundColor: '#f7f9f9', flexShrink: 0 };
const small = (bg, color = WH) => ({ height: 36, padding: '0 14px', borderRadius: 18, border: bg === WH ? '1px solid #cfd9de' : 'none', backgroundColor: bg, color,
  fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' });

const STATE = {
  waiting: ['Inasubiri mteja apokee', GR],
  owed: ['Duka linadaiwa', '#b45309'],
  late: ['Imechelewa, zaidi ya siku 3', '#b91c1c'],
  paid: ['Duka limesema limelipa', B],
  confirmed: ['Imepokelewa', '#166534'],
  disputed: ['Muuzaji anasema hajapokea', '#b91c1c'],
  on_hold: ['Mteja ana malalamiko', '#b45309'],
  cancelled: ['Imeghairiwa', GR],
};
const StateTag = ({ state }) => {
  const [text, color] = STATE[state] || [state, GR];
  return <span data-testid={`state-${state}`} style={{ fontSize: 13, fontWeight: 700, color }}>{text}</span>;
};

/** One tap to join (owner 2026-11-10): a verified phone, three rules, no fee, no waiting. */
const RULES = [
  'Sema ukweli kuhusu bidhaa: picha na maelezo ni ya duka.',
  'Uza unachoweza kufikisha: mteja apate alichoagiza.',
  'Hakuna ada ya kujiunga. Faida yako ni kwa kila mauzo yaliyofika tu.',
];
export function JoinResale({ onJoined }) {
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const join = async () => {
    setErr('');
    try { setBusy(true); const r = await api.post('/resale/join', { acceptRules: true }); onJoined(r.data); }
    catch (e) { setErr(e?.response?.data?.message || 'Imeshindikana.'); } finally { setBusy(false); }
  };
  return (
    <section data-testid="resale-join-card" style={{ margin: 16, padding: 16, border: `1px solid ${LINE}`, borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Jiunge na Uza tena</h2>
      <p style={{ margin: 0, fontSize: 14, color: GR, lineHeight: 1.45 }}>Ukijiunga utaona bei ya wauzaji kwa kila bidhaa, uweke bei yako, na upate faida kwa kila mauzo. Bure, bila kusubiri.</p>
      <ol style={{ margin: 0, paddingLeft: 20, fontSize: 15, color: DK, lineHeight: 1.5 }}>{RULES.map((r) => <li key={r}>{r}</li>)}</ol>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600 }}>
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} data-testid="resale-rules" style={{ width: 20, height: 20 }} />
        Nakubali kanuni hizi
      </label>
      {err && <div role="alert" style={{ fontSize: 14, color: '#b91c1c', fontWeight: 600 }}>{err}</div>}
      <button type="button" onClick={join} disabled={!ok || busy} data-testid="resale-join-btn"
        style={{ height: 44, borderRadius: 22, border: 'none', background: ok ? DK : '#cfd9de', color: WH, fontSize: 15, fontWeight: 700, cursor: ok ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
        {busy ? 'Inajiunga...' : 'Jiunge'}
      </button>
    </section>
  );
}

/**
 * A shop opens many of its products for resellers at once (owner 2026-11-10, growth plan):
 * one margin for all, rounded to TZS 100; "only new" keeps prices already set.
 */
function SupplierBulk({ summary, onDone }) {
  const [margin, setMargin] = useState('15');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const run = async (action) => {
    setNote('');
    try {
      setBusy(true);
      const r = await api.post('/resale/supplier/bulk', action === 'open' ? { action, marginPercent: Number(margin), onlyNew: true } : { action });
      setNote(action === 'open' ? `Bidhaa ${r.data.changed} zimefunguliwa kwa wauzaji.` : `Bidhaa ${r.data.changed} zimefungwa.`);
      onDone?.();
    } catch (e) { setNote(e?.response?.data?.message || 'Imeshindikana.'); } finally { setBusy(false); }
  };
  return (
    <section data-testid="supplier-bulk" style={{ margin: 16, padding: 14, border: `1px solid ${LINE}`, borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <b style={{ fontSize: 16 }}>Fungua bidhaa zako kwa wauzaji</b>
      <span style={{ fontSize: 14, color: GR }}>Bidhaa {summary.open} kati ya {summary.products} ziko wazi kwa wauzaji.</span>
      <label style={{ fontSize: 14, color: DK, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        Wape wauzaji punguzo la
        <input inputMode="numeric" value={margin} onChange={(e) => setMargin(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} aria-label="Punguzo kwa wauzaji (%)"
          data-testid="bulk-margin" style={{ width: 64, height: 36, padding: '0 8px', borderRadius: 10, border: '1px solid #cfd9de', fontSize: 15, fontFamily: 'inherit' }} />
        % chini ya bei yako ya duka
      </label>
      {Number(margin) > 0 && (
        <span style={{ fontSize: 13, color: GR }}>Mfano: bidhaa ya TZS 50,000, muuzaji anakulipa TZS {(Math.round((500 * (100 - Number(margin))) / 100) * 100).toLocaleString('en-US')}. Bidhaa zenye bei ya wauzaji tayari hazibadiliki.</span>
      )}
      {note && <span role="status" style={{ fontSize: 14, color: '#166534', fontWeight: 600 }}>{note}</span>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={busy} onClick={() => run('open')} data-testid="bulk-open" style={small(DK)}>Fungua zote</button>
        {summary.open > 0 && <button type="button" disabled={busy} onClick={() => run('close')} data-testid="bulk-close" style={small(WH, DK)}>Funga zote</button>}
      </div>
    </section>
  );
}

export default function MyResales({ onNavigate, startTab, supplierId, currentUser }) {
  const [tab, setTab] = useState(startTab || (supplierId ? 'open' : 'mine'));
  const [mine, setMine] = useState(null);
  const [profits, setProfits] = useState(null);
  const [supplier, setSupplier] = useState(null);
  const [summary, setSummary] = useState(null);
  const loadSummary = () => api.get('/resale/supplier/summary').then((r) => setSummary(r?.data || null)).catch(() => setSummary(null));
  const [refs, setRefs] = useState({});
  const [msg, setMsg] = useState('');
  // Members only see reseller prices (owner 2026-11-10). null = not known yet.
  const [member, setMember] = useState(null);
  useEffect(() => {
    api.get('/resale/membership').then((r) => setMember(!!r?.data?.member)).catch(() => setMember(false));
  }, []);

  const loadProfits = () => api.get('/resale/profits').then((r) => setProfits(r.data || { items: [] })).catch(() => setProfits({ items: [] }));
  const loadSupplier = () => api.get('/resale/supplier-orders').then((r) => setSupplier(r.data || { items: [] })).catch(() => setSupplier({ items: [] }));
  useEffect(() => { loadProfits(); loadSupplier(); loadSummary(); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once on open
  const act = async (fn, okText) => {
    setMsg('');
    try { await fn(); setMsg(okText); } catch (e) { setMsg(e?.response?.data?.message || 'Imeshindikana.'); }
  };
  const markPaid = (o) => act(async () => {
    await api.post(`/resale/orders/${o.orderId}/paid`, { ref: (refs[o.orderId] || '').trim() });
    await loadSupplier();
  }, 'Imehifadhiwa. Muuzaji ataambiwa.');
  const confirmPaid = (o) => act(async () => { await api.post(`/resale/orders/${o.orderId}/confirm`); await loadProfits(); }, 'Asante. Imethibitishwa.');
  const dispute = (o) => act(async () => { await api.post(`/resale/orders/${o.orderId}/dispute`, {}); await loadProfits(); }, 'Duka limeambiwa hujapokea.');

  const loadMine = () => api.get('/resale/mine').then((r) => setMine(r.data || [])).catch(() => setMine([]));
  // A person with no offers yet starts on the catalogue (owner 2026-11-10: easy to find).
  useEffect(() => {
    loadMine().then(() => {}).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once on open
  useEffect(() => {
    if (!startTab && !supplierId && Array.isArray(mine) && mine.length === 0) setTab('open');
  }, [mine]); // eslint-disable-line react-hooks/exhaustive-deps -- only when the offers first arrive

  const share = async (o) => {
    const link = resaleLink({ id: o.productId, name: o.name }, o.id);
    try { if (navigator.share) { await navigator.share({ title: o.name, url: link }); return; } } catch { return; }
    try { await navigator.clipboard?.writeText(link); setMsg('Kiungo kimenakiliwa.'); } catch { setMsg(link); }
  };
  const stop = async (o) => {
    try { await api.delete(`/resale/offers/${o.id}`); loadMine(); } catch (e) { setMsg(e?.response?.data?.message || 'Imeshindikana.'); }
  };

  const tabBtn = (key, text) => (
    <button type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
      style={{ position: 'relative', height: 48, padding: '0 14px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
        fontSize: 15, fontWeight: tab === key ? 700 : 500, color: tab === key ? DK : GR }}>
      {text}
      {tab === key && <span style={{ position: 'absolute', left: 14, right: 14, bottom: 0, height: 4, borderRadius: 2, backgroundColor: B }} />}
    </button>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: WH, color: DK, maxWidth: 640, margin: '0 auto', paddingBottom: 96 }}>
      <header style={{ padding: '16px 16px 4px' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Uza tena</h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: GR, lineHeight: 1.45 }}>
          Uza bidhaa za maduka kwa bei yako. Duka linafikisha na linapokea malipo, kisha linakulipa faida yako. Hakuna ada ya kujiunga.
        </p>
        <button type="button" onClick={() => onNavigate('UzaTena')}
          style={{ marginTop: 6, padding: 0, border: 'none', background: 'none', color: B, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          Inavyofanya kazi na maswali
        </button>
      </header>
      <div role="tablist" style={{ display: 'flex', borderBottom: `1px solid ${LINE}`, padding: '0 4px' }}>
        {tabBtn('open', 'Bidhaa za kuuza')}
        {tabBtn('mine', 'Ofa zangu')}
        {tabBtn('profits', 'Faida zangu')}
        {(supplier?.items?.length > 0 || summary?.products > 0 || startTab === 'supplier') && tabBtn('supplier', 'Wauzaji wangu')}
      </div>
      {msg && <div role="status" style={{ margin: 16, fontSize: 14, color: '#166534', fontWeight: 600, overflowWrap: 'anywhere' }}>{msg}</div>}

      {tab === 'mine' && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} data-testid="resale-mine">
          {mine === null && <li style={{ padding: 16, color: GR }}>Inapakia...</li>}
          {mine?.length === 0 && (
            <li style={{ padding: 16, color: GR, fontSize: 15 }}>
              Huna ofa bado. <button type="button" onClick={() => setTab('open')} style={{ padding: 0, border: 'none', background: 'none', color: B, fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>Tafuta bidhaa za kuuza</button>
            </li>
          )}
          {(mine || []).map((o) => (
            <li key={o.id} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${LINE}`, opacity: o.isActive ? 1 : 0.6 }}>
              {o.image ? <img src={o.image} alt="" style={thumb} /> : <span style={thumb} />}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button type="button" onClick={() => onNavigate(`ProductDetail-${o.productId}`)}
                  style={{ padding: 0, border: 'none', background: 'none', textAlign: 'left', fontSize: 15, fontWeight: 700, color: DK, cursor: 'pointer', fontFamily: 'inherit' }}>{o.name}</button>
                <div style={{ fontSize: 14, color: GR }}>Bei yako {tzs(o.price)} · faida {tzs(o.profitEach)} kila moja · oda {o.orders}</div>
                {o.needsNewPrice && <div style={{ fontSize: 13, color: '#b45309', fontWeight: 600 }}>Duka limepandisha bei. Badilisha bei yako kabla ya kuuza.</div>}
                {!o.isActive && <div style={{ fontSize: 13, color: GR }}>Imesimamishwa</div>}
                {o.isActive && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button type="button" onClick={() => share(o)} style={small(B)}>Shiriki</button>
                    <button type="button" data-testid={`status-${o.id}`} style={small('#16a34a')}
                      onClick={async () => {
                        const r = await shareToStatus({ product: { id: o.productId, name: o.name, image: o.image }, offer: o, resellerName: currentUser?.name || null });
                        if (STATUS_DONE[r]) setMsg(STATUS_DONE[r]);
                      }}>Weka Status</button>
                    <button type="button" onClick={() => stop(o)} style={small(WH, DK)}>Simamisha</button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {tab === 'profits' && (
        <div data-testid="resale-profits">
          {profits && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, padding: 16 }}>
              {[['Inakuja', profits.totals?.coming], ['Unadai', profits.totals?.owed], ['Umepokea', profits.totals?.received]].map(([k, v]) => (
                <div key={k} style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: 10 }}>
                  <div style={{ fontSize: 13, color: GR }}>{k}</div>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{tzs(v)}</div>
                </div>
              ))}
            </div>
          )}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {profits === null && <li style={{ padding: 16, color: GR }}>Inapakia...</li>}
            {profits?.items?.length === 0 && <li style={{ padding: 16, color: GR, fontSize: 15 }}>Bado hakuna oda kutoka kwenye viungo vyako.</li>}
            {(profits?.items || []).map((o) => (
              <li key={o.orderId} style={{ padding: '12px 16px', borderBottom: `1px solid ${LINE}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <b style={{ fontSize: 15 }}>{o.product} · oda #{o.orderId}</b>
                  <b style={{ fontSize: 15, flexShrink: 0 }}>{tzs(o.profit)}</b>
                </div>
                <div style={{ fontSize: 14, color: GR }}>{o.supplierName}{o.supplierPhone ? ` · ${o.supplierPhone}` : ''} · {o.quantity} x {tzs(o.sellingPrice)}</div>
                <StateTag state={o.state} />
                {o.state === 'paid' && (
                  <>
                    <div style={{ fontSize: 14, color: DK }}>Muamala: {o.paidRef}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" data-testid={`confirm-${o.orderId}`} onClick={() => confirmPaid(o)} style={small('#166534')}>Nimepokea</button>
                      <button type="button" data-testid={`dispute-${o.orderId}`} onClick={() => dispute(o)} style={small(WH, DK)}>Sijapokea</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'supplier' && summary?.products > 0 && <SupplierBulk summary={summary} onDone={loadSummary} />}
      {tab === 'supplier' && (
        <div data-testid="resale-supplier">
          <p style={{ margin: 16, fontSize: 14, color: GR, lineHeight: 1.45 }}>
            Mlipe muuzaji faida yake ndani ya siku 3 baada ya mteja kupokea. Ukichelewa siku 7, oda mpya za wauzaji kwako zinasimama mpaka ulipe.
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {supplier === null && <li style={{ padding: 16, color: GR }}>Inapakia...</li>}
            {supplier?.items?.length === 0 && <li style={{ padding: 16, color: GR }}>Hakuna oda za wauzaji bado.</li>}
            {(supplier?.items || []).map((o) => (
              <li key={o.orderId} style={{ padding: '12px 16px', borderBottom: `1px solid ${LINE}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <b style={{ fontSize: 15 }}>{o.product} · oda #{o.orderId}</b>
                  <b style={{ fontSize: 15, flexShrink: 0 }}>{tzs(o.profit)}</b>
                </div>
                <div style={{ fontSize: 14, color: GR }}>{o.resellerName}{o.resellerPhone ? ` · ${o.resellerPhone}` : ''} · aliuza {o.quantity} x {tzs(o.sellingPrice)}</div>
                <StateTag state={o.state} />
                {o.paidRef && <div style={{ fontSize: 14, color: DK }}>Muamala: {o.paidRef}{o.disputeNote ? ` · ${o.disputeNote}` : ''}</div>}
                {['owed', 'late', 'disputed'].includes(o.state) && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={refs[o.orderId] || ''} onChange={(e) => setRefs((r) => ({ ...r, [o.orderId]: e.target.value }))}
                      placeholder="Namba ya muamala (M-Pesa)" aria-label={`Namba ya muamala oda ${o.orderId}`} data-testid={`ref-${o.orderId}`}
                      style={{ flex: 1, minWidth: 0, height: 36, padding: '0 10px', borderRadius: 10, border: '1px solid #cfd9de', fontSize: 15, fontFamily: 'inherit' }} />
                    <button type="button" data-testid={`paid-${o.orderId}`} onClick={() => markPaid(o)} style={small(DK)}>Nimelipa</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'open' && member === false && <JoinResale onJoined={(m) => { setMember(!!m?.member); setMsg('Karibu Uza tena.'); }} />}
      {tab === 'open' && member && <ResaleCatalogue onNavigate={onNavigate} supplierId={supplierId || null} onSaved={loadMine} resellerName={currentUser?.name || null} />}
    </div>
  );
}
