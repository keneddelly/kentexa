import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import BackBar from '../components/BackBar';
import Footer from '../components/Footer';
import api from '../../api/api';
import LocationPicker from '../components/LocationPicker';

const SIZES = [
  { value: 'small',  label: 'Ndogo',  desc: 'Hadi 2kg — bahasha, vitu vidogo' },
  { value: 'medium', label: 'Wastani', desc: '2–10kg — sanduku la kati' },
  { value: 'large',  label: 'Kubwa',   desc: '10kg+ — sanduku kubwa' },
];

const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '2px solid #e2e8f0', fontSize: 14,
  boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
};

const SectionTitle = ({ icon, title }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '20px 0 12px' }}>
    <span style={{ fontSize: 18 }}>{icon}</span>
    <span style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{title}</span>
    <div style={{ flex: 1, height: 1, backgroundColor: '#f1f5f9' }} />
  </div>
);

const Field = ({ label, required, children, hint }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 5 }}>
      {label} {required && <span style={{ color: '#dc2626' }}>*</span>}
    </label>
    {children}
    {hint && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{hint}</div>}
  </div>
);

const SuperAgentParcel = ({ onNavigate, isLoggedIn, currentUser, onLogout, userRole }) => {
  const [recipientLocation, setRecipientLocation] = useState({ regionId: null, regionName: '', districtId: null, districtName: '', wardId: null, wardName: '' });
  React.useEffect(() => {
    if (!currentUser) return;
    setForm(prev => ({
      ...prev,
      senderName:  prev.senderName  || currentUser.name  || '',
      senderPhone: prev.senderPhone || currentUser.phone || '',
    }));
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const [form, setForm] = useState({
    senderName:          '',
    senderPhone:         '',
    recipientName:       '',
    recipientPhone:      '',
    destinationCity:     '',
    deliveryAddress:     '',
    description:         '',
    weightKg:            '',
    parcelSize:          'small',
    shippingFeeCollected: '',
    paymentMethod:       'cash',
    notes:               '',
  });

  const [loading, setLoading]   = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);
  const [error, setError]       = useState('');
  const [result, setResult]     = useState(null);
  const [feePaid, setFeePaid]   = useState(false);
  const [payingFee, setPayingFee] = useState(false);
  const [feePhone, setFeePhone] = useState('');
  const [feeError, setFeeError] = useState('');
  const [agentCity, setAgentCity] = useState('');

  React.useEffect(() => {
    api.get('/super-agents/my-profile')
      .then(res => setAgentCity(res.data?.agent?.city || res.data?.city || ''))
      .catch(() => {});
  }, []);

  const set = (key, value) => {
    setForm(f => ({ ...f, [key]: value }));
    if (key === 'destinationCity' && value) {
      api.get(`/super-agents/route/${encodeURIComponent(agentCity || 'Dar es Salaam')}/${encodeURIComponent(value)}`)
        .then(res => setRouteInfo(res.data))
        .catch(() => setRouteInfo(null));
    }
  };

  const validate = () => {
    if (!form.senderName.trim())          return 'Weka jina la mtumaji';
    if (!form.senderPhone.trim())         return 'Weka simu ya mtumaji';
    if (!form.recipientName.trim())       return 'Weka jina la mpokeaji';
    if (!form.recipientPhone.trim())      return 'Weka simu ya mpokeaji';
    if (!form.destinationCity)            return 'Chagua mji wa mwisho';
    if (!form.deliveryAddress.trim())     return 'Weka anwani ya mpokeaji';
    if (!form.description.trim())         return 'Eleza yaliyomo kwenye kifurushi';
    if (!form.shippingFeeCollected.trim()) return 'Weka ada ya usafirishaji iliyokusanywa';
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    try {
      setLoading(true); setError('');
      const res = await api.post('/super-agents/offline-intercity', {
        ...form,
        weightKg:            form.weightKg ? Number(form.weightKg) : undefined,
        shippingFeeCollected: Number(form.shippingFeeCollected),
      });
      setResult(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kuunda agizo');
    } finally { setLoading(false); }
  };
  const handlePayFee = async () => {
    if (!feePhone.trim()) { setFeeError('Weka namba yako ya simu ya M-Pesa'); return; }
    try {
      setPayingFee(true); setFeeError('');
      const res = await api.post('/payments/invoice/pay', {
        orderId:  result.orderId,
        phone:    feePhone.trim(),
        provider: 'selcom',
        amount:   1000,
        purpose:  'platform_tracking_fee',
      });
      // Poll/mock confirm — in production this comes via M-Pesa callback
      setTimeout(async () => {
        try {
          await api.post(`/payments/agent/mock-confirm/${res.data.providerRequestId}`);
          setFeePaid(true);
        } catch { setFeeError('Malipo yameshindwa. Jaribu tena.'); }
        setPayingFee(false);
      }, 3000);
    } catch (err) {
      setFeeError(err?.response?.data?.message || 'Imeshindwa kuanzisha malipo');
      setPayingFee(false);
    }
  };

  const handleNew = () => {
    setResult(null);
    setForm({
      senderName: '', senderPhone: '', recipientName: '', recipientPhone: '',
      destinationCity: '', deliveryAddress: '', description: '',
      weightKg: '', parcelSize: 'small',
      shippingFeeCollected: '', paymentMethod: 'cash', notes: '',
    });
    setError('');
  };

  // ── Success screen ─────────────────────────────────────────────────────────
  if (result) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <Navbar currentPage="SuperAgentParcel" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => onNavigate('back')} title="Agizo la Mkoa" />

      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {/* Step 1: Pay TZS 1,000 platform tracking fee */}
        {!feePaid ? (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 16 }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📱</div>
              <h3 style={{ fontSize: 17, fontWeight: 900, color: '#1e293b', margin: '0 0 6px' }}>
                Lipa Ada ya Ufuatiliaji
              </h3>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                Lipa TZS 1,000 kupitia M-Pesa ili kuamsha namba ya kufuatilia na SMS kwa mtumaji na mpokeaji
              </p>
            </div>

            {/* What buyer gets */}
            <div style={{ backgroundColor: '#f0fdf4', borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 8 }}>UTAKACHOPATA:</div>
              {[
                '✅ Namba ya kufuatilia (KTX-...)',
                '📱 SMS kwa mtumaji yenye tracking link',
                '📱 SMS kwa mpokeaji ya onyo la kifurushi',
                '🔄 Masasisho ya hali kwa kila hatua',
              ].map(item => (
                <div key={item} style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>{item}</div>
              ))}
            </div>

            <div style={{ backgroundColor: '#fef9c3', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400e', fontWeight: 700, textAlign: 'center' }}>
              💵 Ada ya Ufuatiliaji: TZS 1,000
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>
                Namba ya M-Pesa (255XXXXXXXXX)
              </label>
              <input type="tel" placeholder="255712345678"
                value={feePhone} onChange={e => setFeePhone(e.target.value)}
                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
            </div>

            {feeError && (
              <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>
                ❌ {feeError}
              </div>
            )}

            <button onClick={handlePayFee} disabled={payingFee}
              style={{ width: '100%', background: payingFee ? '#94a3b8' : 'linear-gradient(135deg,#16a34a,#15803d)',
                color: '#fff', border: 'none', padding: 14, borderRadius: 12,
                cursor: payingFee ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 900 }}>
              {payingFee ? '⏳ Inashughulikia M-Pesa...' : '💳 Lipa TZS 1,000 Sasa'}
            </button>
          </div>
        ) : (
          <>
            {/* Step 2: Fee paid — show tracking number */}
            <div style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', borderRadius: 20, padding: 28, textAlign: 'center', color: '#fff', marginBottom: 16 }}>
              <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
              <h2 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 6px' }}>Kifurushi Kimesajiliwa!</h2>
              <p style={{ fontSize: 13, opacity: 0.9, margin: 0 }}>SMS imetumwa kwa mtumaji na mpokeaji</p>
            </div>

        {/* Tracking number — big and prominent */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, marginBottom: 6 }}>
            NAMBA YA KUFUATILIA
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#1d4ed8', fontFamily: 'monospace', letterSpacing: 2 }}>
            {result.trackingNumber}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
            Mpe mtumaji namba hii — atatumia kufuatilia kifurushi chake
          </div>
        </div>

        {/* Summary */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>📋 Muhtasari wa Agizo</div>
          {[
            ['Kutoka', result.originCity],
            ['Kwenda', result.destinationCity],
            ['Mpokeaji', form.recipientName],
            ['Simu ya Mpokeaji', form.recipientPhone],
            ['Ada Iliyokusanywa', `TZS ${Number(result.shippingFeeCollected).toLocaleString()}`],
            ['Hub Inayopokea', result.destinationAgent || 'Itapangiwa'],
            ...(routeInfo?.transitCity ? [['Njia', `Via ${routeInfo.transitCity}`]] : []),
            ...(routeInfo?.estimatedDays ? [['Muda wa Utoaji', `Siku ${routeInfo.estimatedDays}`]] : []),
          ].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f8fafc', fontSize: 13 }}>
              <span style={{ color: '#64748b' }}>{l}</span>
              <span style={{ fontWeight: 700, color: '#1e293b' }}>{v}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleNew}
            style={{ flex: 1, background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 14, borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
            📦 Kifurushi Kipya
          </button>
          <button onClick={() => onNavigate('SuperAgentDashboard')}
            style={{ flex: 1, background: '#fff', color: '#475569', border: '2px solid #e2e8f0', padding: 14, borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
            🏠 Dashibodi
          </button>
        </div>
          </>
        )}
      </div>
      <Footer onNavigate={onNavigate} />
    </div>
  );

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <Navbar currentPage="SuperAgentParcel" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => onNavigate('back')} title="📦 Agizo la Mkoa — Kaunta" />

      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 32 }}>

        <div style={{ backgroundColor: '#eff6ff', borderRadius: 12, padding: '12px 14px', marginBottom: 16, fontSize: 12, color: '#1d4ed8' }}>
          💡 Pokea kifurushi kutoka kwa mtu yeyote — mjumbe, muuzaji, au mtu wa kawaida. Hakuna akaunti ya KenteXa inayohitajika.
        </div>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, fontWeight: 600 }}>
            ❌ {error}
            <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16, fontWeight: 900 }}>×</button>
          </div>
        )}

        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>

          {/* Sender */}
          <SectionTitle icon="👤" title="Mtumaji (Anayeacha Kifurushi)" />
          <Field label="Jina la Mtumaji" required>
            <input type="text" placeholder="e.g. Juma Salehe" value={form.senderName}
              onChange={e => set('senderName', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Simu ya Mtumaji" required hint="Atatumwa SMS na namba ya kufuatilia">
            <input type="tel" placeholder="0712345678" value={form.senderPhone}
              onChange={e => set('senderPhone', e.target.value)} style={inputStyle} />
          </Field>

          {/* Recipient */}
          <SectionTitle icon="📍" title="Mpokeaji (Atakayepokea)" />
          <Field label="Jina la Mpokeaji" required>
            <input type="text" placeholder="e.g. Amina Hassan" value={form.recipientName}
              onChange={e => set('recipientName', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Simu ya Mpokeaji" required hint="Atatumwa SMS wakati kifurushi kikifika">
            <input type="tel" placeholder="0787654321" value={form.recipientPhone}
              onChange={e => set('recipientPhone', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Mji wa Mwisho" required>
            <LocationPicker
              label="Mji wa Mwisho / Kata *"
              value={recipientLocation}
              onChange={loc => {
                setRecipientLocation(loc);
                setForm(f => ({ ...f, destinationCity: loc.districtName || loc.regionName || '' }));
              }}
              required
            />
          </Field>

          {/* ETA and transit info — shown when destination city selected */}
          {form.destinationCity && routeInfo && (
            <div style={{ backgroundColor: '#f0fdf4', borderRadius: 10, padding: '10px 14px', marginBottom: 14, border: '1px solid #86efac' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 6 }}>📦 Maelezo ya Njia</div>
              {routeInfo.transitCity && (
                <div style={{ backgroundColor: '#fef9c3', borderRadius: 6, padding: '5px 8px', marginBottom: 6, fontSize: 11, color: '#92400e' }}>
                  🔄 Via <strong>{routeInfo.transitCity}</strong>
                  {routeInfo.leg1Days && routeInfo.leg2Days && (
                    <span> — Siku {routeInfo.leg1Days} hadi {routeInfo.transitCity}, siku {routeInfo.leg2Days} hadi {form.destinationCity}</span>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: '#64748b' }}>Muda wa kawaida</span>
                <span style={{ fontWeight: 700, color: '#15803d' }}>Siku {routeInfo.estimatedDays ?? 2}</span>
              </div>
              {routeInfo.primaryTransport && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: '#64748b' }}>Usafiri</span>
                  <span style={{ fontWeight: 600, color: '#1e293b' }}>
                    {routeInfo.primaryTransport === 'bus' ? '🚌 Basi' : routeInfo.primaryTransport === 'courier' ? '📦 Courier' : routeInfo.primaryTransport}
                  </span>
                </div>
              )}
              {routeInfo.notes && (
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, fontStyle: 'italic' }}>{routeInfo.notes}</div>
              )}
            </div>
          )}
          {form.destinationCity && !routeInfo && (
            <div style={{ backgroundColor: '#fef9c3', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 11, color: '#92400e' }}>
              ⚠️ Hakuna route iliyowekwa kwa {form.destinationCity}. Muda wa kawaida: siku 2-3.
            </div>
          )}
          <Field label="Anwani ya Mpokeaji" required hint="Mtaa, alama muhimu — wakala atatumia hii kufikia">
            <textarea rows={2} placeholder="e.g. Nyumba ya Rangi ya Bluu, Mtaa wa Geita, karibu na shule ya msingi"
              value={form.deliveryAddress} onChange={e => set('deliveryAddress', e.target.value)}
              style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>

          {/* Parcel */}
          <SectionTitle icon="📦" title="Maelezo ya Kifurushi" />
          <Field label="Yaliyomo" required hint="Eleza kwa ufupi — e.g. nguo, vitabu, vifaa vya simu">
            <input type="text" placeholder="e.g. Nguo za watoto" value={form.description}
              onChange={e => set('description', e.target.value)} style={inputStyle} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <Field label="Uzito (kg)">
              <input type="number" min="0.1" step="0.1" placeholder="e.g. 1.5"
                value={form.weightKg} onChange={e => set('weightKg', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Ukubwa">
              <select value={form.parcelSize} onChange={e => set('parcelSize', e.target.value)} style={inputStyle}>
                {SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
          </div>

          {/* Size guide */}
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
            {SIZES.map(s => (
              <div key={s.value} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, opacity: form.parcelSize === s.value ? 1 : 0.5 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', minWidth: 50 }}>{s.label}</span>
                <span style={{ fontSize: 11, color: '#64748b' }}>{s.desc}</span>
              </div>
            ))}
          </div>

          {/* Payment */}
          <SectionTitle icon="💵" title="Malipo ya Kaunta" />
          <Field label="Ada Iliyokusanywa (TZS)" required hint="Kiasi halisi kilicholipwa na mtumaji">
            <input type="number" min="0" placeholder="e.g. 5000"
              value={form.shippingFeeCollected} onChange={e => set('shippingFeeCollected', e.target.value)}
              style={{ ...inputStyle, fontSize: 18, fontWeight: 800 }} />
          </Field>
          <Field label="Njia ya Malipo">
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { value: 'cash',   label: '💵 Pesa Taslimu' },
                { value: 'mpesa',  label: '📱 M-Pesa' },
                { value: 'airtel', label: '📱 Airtel' },
              ].map(m => (
                <button key={m.value} onClick={() => set('paymentMethod', m.value)}
                  style={{ flex: 1, padding: '10px 6px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                    border: form.paymentMethod === m.value ? '2px solid #1d4ed8' : '2px solid #e2e8f0',
                    backgroundColor: form.paymentMethod === m.value ? '#eff6ff' : '#fff',
                    color: form.paymentMethod === m.value ? '#1d4ed8' : '#64748b' }}>
                  {m.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Maelezo Zaidi (si lazima)">
            <input type="text" placeholder="e.g. Kioo — kushughulikia kwa uangalifu"
              value={form.notes} onChange={e => set('notes', e.target.value)} style={inputStyle} />
          </Field>

          <button onClick={handleSubmit} disabled={loading}
            style={{ width: '100%', background: loading ? '#94a3b8' : 'linear-gradient(135deg,#1d4ed8,#2563eb)',
              color: '#fff', border: 'none', padding: 16, borderRadius: 12,
              cursor: loading ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 900,
              marginTop: 8, boxShadow: '0 4px 12px rgba(29,78,216,0.3)' }}>
            {loading ? '⏳ Inasajili...' : '✅ Sajili Kifurushi'}
          </button>
        </div>
      </div>
      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default SuperAgentParcel;