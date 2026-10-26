import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import BackBar from '../components/BackBar';
import { VEHICLE_LABEL, GOODS_LABEL, page, body, card, label, input, primary, chip, MUTED } from './quoteShared';

/**
 * "Omba bei" (owner 2026-10-26): a customer or an office asks for prices -
 *   Gari zima:      hire a whole vehicle; transporters with that vehicle reply;
 *   Mzigo mkubwa / Kontena: offices in the sender's town that take it reply.
 * The prices come to "Maombi yangu ya bei"; the asker picks one and pays them directly.
 */
export default function QuoteRequest({ onNavigate, currentUser, kind: startKind }) {
  const [kind, setKind] = useState(startKind === 'goods' ? 'goods' : 'vehicle');
  const [vehicleType, setVehicleType] = useState('');
  const [goodsType, setGoodsType] = useState('');
  const [regions, setRegions] = useState([]);
  const [fromCity, setFromCity] = useState('');
  const [fromText, setFromText] = useState('');
  const [toCity, setToCity] = useState('');
  const [toText, setToText] = useState('');
  const [travelDate, setTravelDate] = useState('');
  const [description, setDescription] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [phone, setPhone] = useState(() => {
    const d = String(currentUser?.phone || '').replace(/[^0-9]/g, '');
    return d.startsWith('255') && d.length === 12 ? `0${d.slice(3)}` : d;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/locations/regions').then((r) => setRegions((r.data || []).map((x) => x.name).filter(Boolean))).catch(() => {});
  }, []);

  const typeOk = kind === 'vehicle' ? !!vehicleType : !!goodsType;
  const ok = typeOk && fromCity && toCity && description.trim().length >= 3 && phone.replace(/[^0-9]/g, '').length >= 10;

  const send = async () => {
    if (!ok || busy) return;
    setBusy(true); setError('');
    try {
      await api.post('/quote-requests', {
        kind, vehicleType: kind === 'vehicle' ? vehicleType : undefined, goodsType: kind === 'goods' ? goodsType : undefined,
        fromCity, fromText: fromText.trim() || undefined, toCity, toText: toText.trim() || undefined,
        travelDate: travelDate || undefined, description: description.trim(), weightKg: weightKg || undefined, phone,
      });
      onNavigate('MyQuoteRequests');
    } catch (e) {
      setError(e?.response?.data?.message || 'Imeshindwa kutuma ombi. Jaribu tena.');
    } finally { setBusy(false); }
  };

  const place = (id, title, city, setCity, text, setText) => (
    <div style={{ marginBottom: 14 }}>
      <label htmlFor={id} style={label}>{title}</label>
      <select id={id} value={city} onChange={(e) => setCity(e.target.value)} style={{ ...input, marginBottom: 8 }}>
        <option value="">Chagua mkoa</option>
        {regions.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <input aria-label={`${title}: mahali hasa`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Mahali hasa (si lazima)" style={input} />
    </div>
  );

  return (
    <div style={page}>
      <BackBar onBack={() => onNavigate('back')} title="Omba bei" top={0} />
      <div style={body}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }} role="tablist">
          <button type="button" role="tab" aria-selected={kind === 'vehicle'} onClick={() => setKind('vehicle')} style={{ ...chip(kind === 'vehicle'), flex: 1 }}>Kodi gari zima</button>
          <button type="button" role="tab" aria-selected={kind === 'goods'} onClick={() => setKind('goods')} style={{ ...chip(kind === 'goods'), flex: 1 }}>Mzigo mkubwa / Kontena</button>
        </div>

        <div style={card}>
          <p style={{ margin: '0 0 14px', fontSize: 15, color: MUTED, lineHeight: '20px' }}>
            {kind === 'vehicle'
              ? 'Wasafirishaji wenye gari la aina hii watakutumia bei zao. Utachagua mmoja na kumlipa moja kwa moja.'
              : 'Ofisi za mji unaotoka zinazopokea mzigo huu zitakutumia bei zao. Utachagua moja na kuilipa moja kwa moja.'}
          </p>

          <div style={label}>{kind === 'vehicle' ? 'Aina ya gari' : 'Aina ya mzigo'}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {kind === 'vehicle'
              ? Object.entries(VEHICLE_LABEL).map(([k, v]) => (
                <button key={k} type="button" aria-pressed={vehicleType === k} onClick={() => setVehicleType(k)} style={chip(vehicleType === k)}>{v}</button>))
              : Object.entries(GOODS_LABEL).map(([k, v]) => (
                <button key={k} type="button" aria-pressed={goodsType === k} onClick={() => setGoodsType(k)} style={chip(goodsType === k)}>{v}</button>))}
          </div>

          {place('from', 'Unatoka wapi?', fromCity, setFromCity, fromText, setFromText)}
          {place('to', 'Unakwenda wapi?', toCity, setToCity, toText, setToText)}

          <div style={{ marginBottom: 14 }}>
            <label htmlFor="desc" style={label}>Mzigo ni nini?</label>
            <textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              placeholder={kind === 'vehicle' ? 'Mfano: kuhama nyumba, vitu vya vyumba 2' : 'Mfano: mabati 200, au kontena la futi 20'}
              style={{ ...input, height: 'auto', padding: 12, resize: 'vertical' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 14 }}>
            <div>
              <label htmlFor="date" style={label}>Siku</label>
              <input id="date" type="date" value={travelDate} onChange={(e) => setTravelDate(e.target.value)} style={input} />
            </div>
            <div>
              <label htmlFor="kg" style={label}>Uzito (kg)</label>
              <input id="kg" inputMode="decimal" value={weightKg} onChange={(e) => setWeightKg(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Si lazima" style={input} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="phone" style={label}>Simu yako</label>
            <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712345678" style={input} />
            <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>Itaonekana tu kwa yule utakayemchagua.</div>
          </div>

          {error && <div role="alert" style={{ color: '#b91c1c', fontSize: 15, marginBottom: 12 }}>{error}</div>}
          <button type="button" onClick={send} disabled={!ok || busy} data-testid="quote-send"
            style={{ ...primary, opacity: ok && !busy ? 1 : 0.5, cursor: ok && !busy ? 'pointer' : 'not-allowed' }}>
            {busy ? 'Inatuma…' : 'Omba bei'}
          </button>
        </div>
      </div>
    </div>
  );
}
