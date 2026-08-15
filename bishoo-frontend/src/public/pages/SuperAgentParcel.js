import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';
import LocationPicker from '../components/LocationPicker';

const getSizes = (t) => [
  { value: 'small',  label: t('super_agent_parcel.size_small'),  desc: t('super_agent_parcel.size_small_desc') },
  { value: 'medium', label: t('super_agent_parcel.size_medium'), desc: t('super_agent_parcel.size_medium_desc') },
  { value: 'large',  label: t('super_agent_parcel.size_large'),   desc: t('super_agent_parcel.size_large_desc') },
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

const SuperAgentParcel = ({ onNavigate, currentUser }) => {
  const { t } = useTranslation();
  const SIZES = getSizes(t);
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
    if (!form.senderName.trim())          return t('super_agent_parcel.validate_sender_name');
    if (!form.senderPhone.trim())         return t('super_agent_parcel.validate_sender_phone');
    if (!form.recipientName.trim())       return t('super_agent_parcel.validate_recipient_name');
    if (!form.recipientPhone.trim())      return t('super_agent_parcel.validate_recipient_phone');
    if (!form.destinationCity)            return t('super_agent_parcel.validate_destination_city');
    if (!form.deliveryAddress.trim())     return t('super_agent_parcel.validate_recipient_address');
    if (!form.description.trim())         return t('super_agent_parcel.validate_description');
    if (!form.shippingFeeCollected.trim()) return t('super_agent_parcel.validate_shipping_fee');
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
      setError(err?.response?.data?.message || t('super_agent_parcel.create_failed'));
    } finally { setLoading(false); }
  };
  const handlePayFee = async () => {
    if (!feePhone.trim()) { setFeeError(t('super_agent_parcel.fee_phone_required')); return; }
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
        } catch { setFeeError(t('super_agent_parcel.fee_payment_failed_confirm')); }
        setPayingFee(false);
      }, 3000);
    } catch (err) {
      setFeeError(err?.response?.data?.message || t('super_agent_parcel.fee_init_failed'));
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
      <BackBar onBack={() => onNavigate('back')} title={t('super_agent_parcel.success_page_title')} top={0} />

      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {/* Step 1: Pay TZS 1,000 platform tracking fee */}
        {!feePaid ? (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 16 }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📱</div>
              <h3 style={{ fontSize: 17, fontWeight: 900, color: '#1e293b', margin: '0 0 6px' }}>
                {t('super_agent_parcel.pay_tracking_fee_title')}
              </h3>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                {t('super_agent_parcel.pay_tracking_fee_desc')}
              </p>
            </div>

            {/* What buyer gets */}
            <div style={{ backgroundColor: '#f0fdf4', borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 8 }}>{t('super_agent_parcel.what_you_get_label')}</div>
              {[
                t('super_agent_parcel.benefit_tracking_number'),
                t('super_agent_parcel.benefit_sms_sender'),
                t('super_agent_parcel.benefit_sms_recipient'),
                t('super_agent_parcel.benefit_status_updates'),
              ].map(item => (
                <div key={item} style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>{item}</div>
              ))}
            </div>

            <div style={{ backgroundColor: '#fef9c3', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400e', fontWeight: 700, textAlign: 'center' }}>
              {t('super_agent_parcel.tracking_fee_label')}
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>
                {t('super_agent_parcel.mpesa_number_label')}
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
              {payingFee ? t('super_agent_parcel.processing_mpesa') : t('super_agent_parcel.pay_now_button')}
            </button>
          </div>
        ) : (
          <>
            {/* Step 2: Fee paid — show tracking number */}
            <div style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', borderRadius: 20, padding: 28, textAlign: 'center', color: '#fff', marginBottom: 16 }}>
              <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
              <h2 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 6px' }}>{t('super_agent_parcel.parcel_registered_title')}</h2>
              <p style={{ fontSize: 13, opacity: 0.9, margin: 0 }}>{t('super_agent_parcel.parcel_registered_desc')}</p>
            </div>

        {/* Tracking number — big and prominent */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, marginBottom: 6 }}>
            {t('super_agent_parcel.tracking_number_label')}
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#1d4ed8', fontFamily: 'monospace', letterSpacing: 2 }}>
            {result.trackingNumber}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
            {t('super_agent_parcel.give_sender_hint')}
          </div>
        </div>

        {/* Summary */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>{t('super_agent_parcel.summary_title')}</div>
          {[
            [t('super_agent_parcel.summary_from'), result.originCity],
            [t('super_agent_parcel.summary_to'), result.destinationCity],
            [t('super_agent_parcel.summary_recipient'), form.recipientName],
            [t('super_agent_parcel.summary_recipient_phone'), form.recipientPhone],
            [t('super_agent_parcel.summary_fee_collected'), `TZS ${Number(result.shippingFeeCollected).toLocaleString()}`],
            [t('super_agent_parcel.summary_receiving_hub'), result.destinationAgent || t('super_agent_parcel.hub_to_be_assigned')],
            ...(routeInfo?.transitCity ? [[t('super_agent_parcel.summary_route'), t('super_agent_parcel.summary_route_via', { city: routeInfo.transitCity })]] : []),
            ...(routeInfo?.estimatedDays ? [[t('super_agent_parcel.summary_delivery_time'), t('super_agent_parcel.days_value', { count: routeInfo.estimatedDays })]] : []),
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
            {t('super_agent_parcel.new_parcel_button')}
          </button>
          <button onClick={() => onNavigate('SuperAgentDashboard')}
            style={{ flex: 1, background: '#fff', color: '#475569', border: '2px solid #e2e8f0', padding: 14, borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
            {t('super_agent_parcel.dashboard_button')}
          </button>
        </div>
          </>
        )}
      </div>
    </div>
  );

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('back')} title={t('super_agent_parcel.form_title')} top={0} />

      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 32 }}>

        <div style={{ backgroundColor: '#eff6ff', borderRadius: 12, padding: '12px 14px', marginBottom: 16, fontSize: 12, color: '#1d4ed8' }}>
          {t('super_agent_parcel.info_banner')}
        </div>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, fontWeight: 600 }}>
            ❌ {error}
            <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16, fontWeight: 900 }}>×</button>
          </div>
        )}

        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>

          {/* Sender */}
          <SectionTitle icon="👤" title={t('super_agent_parcel.section_sender')} />
          <Field label={t('super_agent_parcel.sender_name_label')} required>
            <input type="text" placeholder="e.g. Juma Salehe" value={form.senderName}
              onChange={e => set('senderName', e.target.value)} style={inputStyle} />
          </Field>
          <Field label={t('super_agent_parcel.sender_phone_label')} required hint={t('super_agent_parcel.sender_phone_hint')}>
            <input type="tel" placeholder="0712345678" value={form.senderPhone}
              onChange={e => set('senderPhone', e.target.value)} style={inputStyle} />
          </Field>

          {/* Recipient */}
          <SectionTitle icon="📍" title={t('super_agent_parcel.section_recipient')} />
          <Field label={t('super_agent_parcel.recipient_name_label')} required>
            <input type="text" placeholder="e.g. Amina Hassan" value={form.recipientName}
              onChange={e => set('recipientName', e.target.value)} style={inputStyle} />
          </Field>
          <Field label={t('super_agent_parcel.recipient_phone_label')} required hint={t('super_agent_parcel.recipient_phone_hint')}>
            <input type="tel" placeholder="0787654321" value={form.recipientPhone}
              onChange={e => set('recipientPhone', e.target.value)} style={inputStyle} />
          </Field>
          <Field label={t('super_agent_parcel.destination_city_label')} required>
            <LocationPicker
              label={t('super_agent_parcel.location_picker_label')}
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
              <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 6 }}>{t('super_agent_parcel.route_details_title')}</div>
              {routeInfo.transitCity && (
                <div style={{ backgroundColor: '#fef9c3', borderRadius: 6, padding: '5px 8px', marginBottom: 6, fontSize: 11, color: '#92400e' }}>
                  🔄 {t('super_agent_parcel.via_label')} <strong>{routeInfo.transitCity}</strong>
                  {routeInfo.leg1Days && routeInfo.leg2Days && (
                    <span>{t('super_agent_parcel.transit_leg_note', { leg1: routeInfo.leg1Days, transit: routeInfo.transitCity, leg2: routeInfo.leg2Days, dest: form.destinationCity })}</span>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: '#64748b' }}>{t('super_agent_parcel.typical_time_label')}</span>
                <span style={{ fontWeight: 700, color: '#15803d' }}>{t('super_agent_parcel.days_value', { count: routeInfo.estimatedDays ?? 2 })}</span>
              </div>
              {routeInfo.primaryTransport && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: '#64748b' }}>{t('super_agent_parcel.transport_label')}</span>
                  <span style={{ fontWeight: 600, color: '#1e293b' }}>
                    {routeInfo.primaryTransport === 'bus' ? t('super_agent_parcel.transport_bus') : routeInfo.primaryTransport === 'courier' ? t('super_agent_parcel.transport_courier') : routeInfo.primaryTransport}
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
              {t('super_agent_parcel.no_route_warning', { city: form.destinationCity })}
            </div>
          )}
          <Field label={t('super_agent_parcel.recipient_address_label')} required hint={t('super_agent_parcel.recipient_address_hint')}>
            <textarea rows={2} placeholder={t('super_agent_parcel.recipient_address_placeholder')}
              value={form.deliveryAddress} onChange={e => set('deliveryAddress', e.target.value)}
              style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>

          {/* Parcel */}
          <SectionTitle icon="📦" title={t('super_agent_parcel.section_parcel')} />
          <Field label={t('super_agent_parcel.contents_label')} required hint={t('super_agent_parcel.contents_hint')}>
            <input type="text" placeholder={t('super_agent_parcel.contents_placeholder')} value={form.description}
              onChange={e => set('description', e.target.value)} style={inputStyle} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <Field label={t('super_agent_parcel.weight_label')}>
              <input type="number" min="0.1" step="0.1" placeholder="e.g. 1.5"
                value={form.weightKg} onChange={e => set('weightKg', e.target.value)} style={inputStyle} />
            </Field>
            <Field label={t('super_agent_parcel.size_label')}>
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
          <SectionTitle icon="💵" title={t('super_agent_parcel.section_payment')} />
          <Field label={t('super_agent_parcel.fee_collected_label')} required hint={t('super_agent_parcel.fee_collected_hint')}>
            <input type="number" min="0" placeholder="e.g. 5000"
              value={form.shippingFeeCollected} onChange={e => set('shippingFeeCollected', e.target.value)}
              style={{ ...inputStyle, fontSize: 18, fontWeight: 800 }} />
          </Field>
          <Field label={t('super_agent_parcel.payment_method_label')}>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { value: 'cash',   label: t('super_agent_parcel.payment_cash') },
                { value: 'mpesa',  label: t('super_agent_parcel.payment_mpesa') },
                { value: 'airtel', label: t('super_agent_parcel.payment_airtel') },
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

          <Field label={t('super_agent_parcel.notes_label')}>
            <input type="text" placeholder={t('super_agent_parcel.notes_placeholder')}
              value={form.notes} onChange={e => set('notes', e.target.value)} style={inputStyle} />
          </Field>

          <button onClick={handleSubmit} disabled={loading}
            style={{ width: '100%', background: loading ? '#94a3b8' : 'linear-gradient(135deg,#1d4ed8,#2563eb)',
              color: '#fff', border: 'none', padding: 16, borderRadius: 12,
              cursor: loading ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 900,
              marginTop: 8, boxShadow: '0 4px 12px rgba(29,78,216,0.3)' }}>
            {loading ? t('super_agent_parcel.registering') : t('super_agent_parcel.register_parcel_button')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SuperAgentParcel;