/**
 * KentexaFee.js — "Ada ya KenteXa" (owner approved 2026-11-03, sketch "KenteXa Fee Plan").
 * Rule: only the one who made money through KenteXa pays.
 *   ofisi  TZS 500 per parcel (owner 2026-11-17; never more than the parcel earned) after 20 free parcels
 *   wakala 10% of the delivery fee (min 100, cap 5,000) after 20 free deliveries
 *   muuzaji 2% of a marketplace order; POS and own sales are free
 * Work goes on with a debt; at TZS 50,000+ with part older than 30 days new work stops until it
 * is paid (owner 2026-11-17). Paying: KenteXa's Lipa Namba, then the screenshot;
 * KenteXa confirms. Every number comes from GET /kentexa-fee/mine (the records); nothing here
 * is computed or guessed in the browser.
 * Ankara (owner approved 2026-11-17): on the 1st of each month last month's fees become one
 * invoice with a number and a due date; "Lipa ankara hii" fills in what is left on it. Which
 * invoices are paid is worked out on the server (payments pay the oldest first).
 */
import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/api';
import { ApplyPage, ErrorText, Field, K, Note, Section, inputStyle, pillStyle } from '../components/ApplyKit';
import GetAppStrip from '../components/GetAppStrip';

const tzs = (n) => `TZS ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const WHAT = { office: 'Vifurushi', agent: 'Safari zilizokamilika', seller: 'Maagizo ya KenteXa' };
const EARNED = { office: 'Ada za usafirishaji ulizopata', agent: 'Ada za safari', seller: 'Mauzo kupitia KenteXa' };
const TITLE = { office: 'Ofisi', agent: 'Wakala', seller: 'Muuzaji' };
const STATUS = { waiting: 'Inasubiri kuthibitishwa', confirmed: 'Imethibitishwa', rejected: 'Haikukubaliwa' };
const dateOf = (d) => (d ? new Date(String(d).length === 10 ? `${d}T12:00:00+03:00` : d).toLocaleDateString('en-GB') : '');

/** Paid / part / not paid, and late when past the due date. */
export const invoiceTag = (inv) => {
  if (inv.status === 'paid') return { text: 'Imelipwa', bg: '#dcfce7', fg: '#166534' };
  if (inv.late) return { text: 'Imechelewa', bg: '#fee2e2', fg: '#991b1b' };
  if (inv.status === 'part') return { text: 'Imelipwa sehemu', bg: '#fef3c7', fg: '#92400e' };
  return { text: 'Haijalipwa', bg: '#e0f2fe', fg: '#075985' };
};

export const InvoiceTag = ({ inv }) => {
  const t = invoiceTag(inv);
  return <span style={{ background: t.bg, color: t.fg, fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>{t.text}</span>;
};

export const ruleText = (as, rule) => {
  if (!rule) return '';
  if (as === 'seller') return `${rule.rate}% ya bei ya bidhaa kwa kila agizo la KenteXa. Mauzo ya POS na yako mwenyewe ni bure.`;
  // A flat fee (owner 2026-11-17: ofisi TZS 500 per parcel) is min = cap.
  if (rule.cap && rule.min === rule.cap) {
    const what = as === 'office' ? 'kifurushi' : 'safari';
    return `${tzs(rule.min)} kwa kila ${what}. Ukitoza chini ya hapo, unalipa ulichotoza tu; ${as === 'office' ? 'kifurushi cha bure' : 'safari ya bure'} hakilipiwi.`;
  }
  const what = as === 'office' ? 'ada ya usafirishaji uliyotoza' : 'ada ya safari';
  const cap = rule.cap ? `, isizidi ${tzs(rule.cap)}` : '';
  return `${rule.rate}% ya ${what}, angalau ${tzs(rule.min)}${cap}. Kifurushi cha bure hakilipiwi.`;
};

const Row = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: `1px solid ${K.LINE}`, fontSize: 15 }}>
    <span style={{ color: K.MUTED }}>{label}</span><span style={{ fontWeight: 700, textAlign: 'right' }}>{value}</span>
  </div>
);

export default function KentexaFee({ onNavigate, isLoggedIn, navParams, as: asProp }) {
  const as = ['office', 'agent', 'seller'].includes(asProp) ? asProp : (navParams?.as || 'seller');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [payError, setPayError] = useState('');
  const [sent, setSent] = useState(false);
  const [openInvoice, setOpenInvoice] = useState(null);
  const [invoiceData, setInvoiceData] = useState(null);
  const [invoiceError, setInvoiceError] = useState('');

  const load = useCallback(() => {
    setError('');
    api.get('/kentexa-fee/mine', { params: { as } })
      .then((r) => setData(r.data))
      .catch((e) => setError(e?.response?.data?.message || 'Ada haikupakia. Jaribu tena.'));
  }, [as]);

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    load();
  }, [isLoggedIn, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    const n = Math.round(Number(String(amount).replace(/[^\d]/g, '')));
    if (!n || n < 100) { setPayError('Andika kiasi ulicholipa.'); return; }
    if (!file) { setPayError('Weka picha ya ujumbe wa malipo.'); return; }
    setSending(true); setPayError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const up = await api.post('/upload/payment-proof', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      await api.post('/kentexa-fee/payments', { as, amount: n, proofRef: up.data?.proofId, reference: reference.trim() || undefined });
      setSent(true); setPaying(false); setAmount(''); setReference(''); setFile(null);
      load();
    } catch (e) {
      setPayError(e?.response?.data?.message || 'Malipo hayakutumwa. Jaribu tena.');
    } finally { setSending(false); }
  };

  const showInvoice = (id) => {
    if (openInvoice === id) { setOpenInvoice(null); return; }
    setOpenInvoice(id); setInvoiceData(null); setInvoiceError('');
    Promise.resolve()
      .then(() => api.get(`/kentexa-fee/invoices/${id}`, { params: { as } }))
      .then((r) => setInvoiceData(r?.data || null))
      .catch((e) => setInvoiceError(e?.response?.data?.message || 'Ankara haikupakia.'));
  };

  const payInvoice = (inv) => {
    setPaying(true); setSent(false); setAmount(String(inv.left || ''));
    window.scrollTo?.({ top: 0, behavior: 'smooth' });
  };

  const back = () => onNavigate('back');
  if (error) {
    return (
      <ApplyPage onBack={back} backTitle="Ada ya KenteXa" title="Ada ya KenteXa">
        <ErrorText>{error}</ErrorText>
        <button type="button" onClick={load} style={pillStyle(false)}>Jaribu tena</button>
      </ApplyPage>
    );
  }
  if (!data) return <ApplyPage onBack={back} backTitle="Ada ya KenteXa" title="Ada ya KenteXa"><p style={{ color: K.MUTED, margin: 0 }}>Inapakia…</p></ApplyPage>;
  if (!data.ready) {
    return (
      <ApplyPage onBack={back} backTitle="Ada ya KenteXa" title="Ada ya KenteXa">
        <Note>Ada ya KenteXa bado haijawashwa.</Note>
      </ApplyPage>
    );
  }

  return (
    <ApplyPage onBack={back} backTitle="Ada ya KenteXa" title="Ada ya KenteXa" desc={`${TITLE[as]}${data.name ? ` · ${data.name}` : ''}`}>
      <section data-testid="fee-owed" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 14, color: K.MUTED }}>Deni la sasa</span>
        <span style={{ fontSize: 34, fontWeight: 800 }}>{tzs(data.owed)}</span>
        {data.waiting > 0 && <span style={{ fontSize: 14, color: K.MUTED }}>{tzs(data.waiting)} inasubiri kuthibitishwa</span>}
      </section>
      {data.locked && (
        <Note tone="red">
          <span data-testid="fee-locked">{`Kazi mpya zimesimama: deni limefika ${tzs(data.lockAmount)} na sehemu yake imepita siku 30. Kazi zilizopo zinaendelea. Lipa deni; kazi mpya zinarudi mara tukithibitisha malipo.`}</span>
        </Note>
      )}
      {!data.locked && data.lockWarn && (
        <Note tone="amber">
          <span data-testid="fee-lock-warn">{`Lipa sasa: deni likikaa zaidi ya siku 30 na kuwa ${tzs(data.lockAmount)} au zaidi, kazi mpya zinasimama mpaka ulipe.`}</span>
        </Note>
      )}
      {!data.locked && <Note tone={data.inArrears ? 'amber' : 'green'}>
        {data.inArrears
          ? 'Kazi yako haisimami. Kuna ada iliyopita siku 30 bila kulipwa: kazi mpya kutoka KenteXa zinawafikia waliolipa kwanza.'
          : 'Kazi yako haisimami. Ukilipa kwa wakati, kazi mpya kutoka KenteXa zinakuja kwako kwanza.'}
      </Note>}
      {sent && <Note tone="blue">Tumepokea picha ya malipo. Tunathibitisha ndani ya saa 24; deni linashuka tukithibitisha.</Note>}

      {!paying && data.owed > 0 && (
        <button type="button" data-testid="fee-pay" onClick={() => { setPaying(true); setSent(false); setAmount(String(Math.max(0, data.owed - (data.waiting || 0)) || '')); }} style={pillStyle()}>Lipa deni</button>
      )}

      {paying && (
        <Section title="Lipa deni" testId="fee-pay-form">
          <span style={{ fontSize: 14, color: K.MUTED }}>1. Lipa kwa Lipa Namba ya KenteXa</span>
          <div>
            <Row label={`Lipa Namba (${data.lipa?.bank || ''})`} value={data.lipa?.number} />
            <Row label="Jina" value={data.lipa?.name} />
          </div>
          <span style={{ fontSize: 14, color: K.MUTED }}>2. Tuma picha ya ujumbe wa malipo</span>
          <Field label="Kiasi ulicholipa (TZS)">
            <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} data-testid="fee-amount" />
          </Field>
          <Field label="Namba ya muamala (si lazima)">
            <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} style={inputStyle} />
          </Field>
          <Field label="Picha ya ujumbe wa malipo">
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ fontSize: 14 }} data-testid="fee-proof" />
          </Field>
          <ErrorText>{payError}</ErrorText>
          <button type="button" onClick={send} disabled={sending} style={pillStyle(true, sending)}>{sending ? 'Inatuma…' : 'Tuma'}</button>
          <button type="button" onClick={() => setPaying(false)} style={pillStyle(false)}>Ghairi</button>
        </Section>
      )}

      {data.invoices?.length > 0 && (
        <Section title="Ankara" testId="fee-invoices">
          <span style={{ fontSize: 13, color: K.MUTED }}>Kila tarehe 1 ada ya mwezi uliopita inakuwa ankara moja. Lipa ndani ya siku 30.</span>
          <div>
            {data.invoices.map((inv) => (
              <div key={inv.id} style={{ borderBottom: `1px solid ${K.LINE}` }}>
                <button type="button" data-testid={`fee-invoice-${inv.id}`} onClick={() => showInvoice(inv.id)}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 0', border: 'none',
                    background: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: K.INK }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <b style={{ fontSize: 15 }}>{inv.month}</b>
                    <span style={{ fontSize: 13, color: K.MUTED }}>{inv.number} · lipa kabla ya {dateOf(inv.dueAt)}</span>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <b style={{ fontSize: 15 }}>{tzs(inv.amount)}</b>
                    <InvoiceTag inv={inv} />
                  </span>
                </button>
                {openInvoice === inv.id && (
                  <div data-testid="fee-invoice-detail" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 0 14px' }}>
                    <Row label={WHAT[as]} value={inv.jobs} />
                    {inv.freeJobs > 0 && <Row label="Za bure" value={inv.freeJobs} />}
                    <Row label="Ada" value={tzs(inv.amount)} />
                    <Row label="Umelipa" value={tzs(inv.paid)} />
                    <Row label="Imebaki" value={tzs(inv.left)} />
                    <ErrorText>{invoiceError}</ErrorText>
                    {!invoiceData && !invoiceError && <span style={{ fontSize: 13, color: K.MUTED }}>Inapakia kazi za mwezi…</span>}
                    {invoiceData?.jobs?.length > 0 && (
                      <div style={{ maxHeight: 260, overflowY: 'auto', fontSize: 13 }}>
                        {invoiceData.jobs.map((j) => (
                          <div key={j.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', color: K.MUTED }}>
                            <span>{dateOf(j.doneAt)} · {j.sourceRef || `#${j.id}`} · {tzs(j.baseAmount)}</span>
                            <span style={{ color: K.INK, fontWeight: 700 }}>{j.freeJob ? 'Bure' : tzs(j.fee)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {inv.left > 0 && (
                      <button type="button" data-testid="fee-pay-invoice" onClick={() => payInvoice(inv)} style={pillStyle()}>Lipa ankara hii ({tzs(inv.left)})</button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Mwezi huu">
        <div>
          <Row label={WHAT[as]} value={data.month.jobs} />
          <Row label={EARNED[as]} value={tzs(data.month.earned)} />
          <Row label={`Ada ya KenteXa${data.rule ? ` (${data.rule.cap && data.rule.min === data.rule.cap ? `${tzs(data.rule.min)} kila moja` : `${data.rule.rate}%`})` : ''}`} value={tzs(data.month.fee)} />
          {as !== 'seller' && <Row label="Vya bure vilivyobaki" value={data.freeLeft} />}
          {data.legacy > 0 && <Row label="Deni la zamani (TZS 1,000 kwa agizo)" value={tzs(data.legacy)} />}
        </div>
        <span style={{ fontSize: 13, color: K.MUTED }}>{ruleText(as, data.rule)}</span>
      </Section>

      {data.payments?.length > 0 && (
        <Section title="Malipo yako">
          <div>
            {data.payments.map((p) => (
              <Row key={p.id} label={`${new Date(p.createdAt).toLocaleDateString('en-GB')} · ${STATUS[p.status] || p.status}${p.reason ? `: ${p.reason}` : ''}`} value={tzs(p.amount)} />
            ))}
          </div>
        </Section>
      )}

      {data.recent?.length > 0 && (
        <Section title="Kazi za karibuni">
          <div>
            {data.recent.map((r) => (
              <Row key={r.id} label={`${r.sourceRef || `#${r.id}`} · ${tzs(r.baseAmount)}`} value={r.freeJob ? 'Bure' : tzs(r.fee)} />
            ))}
          </div>
        </Section>
      )}
      <GetAppStrip text="Fuatilia ada na ankara zako kwenye app ya KenteXa" />
    </ApplyPage>
  );
}
