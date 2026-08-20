/**
 * SuperAgentSettings.js — Hub profile and settings for Super Agent
 * Accessed via ⚙️ gear icon on SuperAgentDashboard
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';
import LocationPicker from '../components/LocationPicker';

const inp = {
  width: '100%', padding: '11px 14px', borderRadius: 10,
  border: '2px solid #e2e8f0', fontSize: 14,
  boxSizing: 'border-box', outline: 'none',
};

const SuperAgentSettings = ({ onNavigate, isLoggedIn }) => {
  const { t } = useTranslation();
  const [profile, setProfile]   = useState(null);
  const [form, setForm]         = useState({
    businessName: '', phone: '', address: '', city: '',
    region: '', description: '', whatsappNumber: '',
  });
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [location, setLocation] = useState({ regionId: null, regionName: '', districtId: null, districtName: '', wardId: null, wardName: '' });
  const [success, setSuccess]   = useState('');
  const [error, setError]       = useState('');

  // ── Bei / route pricing ────────────────────────────────────────────────
  const blankRate = () => ({ destinationCity: '', ratePerKg: '', minimumCharge: '', estimatedDays: 3 });
  const [rates, setRates]         = useState([]);
  const [rateSaving, setRateSaving] = useState(false);
  const [rateMessage, setRateMessage] = useState('');
  const [rateError, setRateError]   = useState('');
  const [regionNames, setRegionNames] = useState([]);

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    api.get('/super-agents/my-profile')
      .then(res => {
        setProfile(res.data);
        setForm({
          businessName:  res.data.businessName  || '',
          phone:         res.data.phone         || '',
          address:       res.data.address       || '',
          city:          res.data.city          || '',
          region:        res.data.region        || '',
          description:   res.data.description   || '',
          whatsappNumber:res.data.whatsappNumber|| '',
        });
        if (res.data.city) {
          api.get(`/super-agents/rates/${encodeURIComponent(res.data.city)}`)
            .then(r => setRates(r.data?.length ? r.data : [blankRate()]))
            .catch(() => setRates([blankRate()]));
        } else {
          setRates([blankRate()]);
        }
      })
      .catch(() => setError(t('super_agent_settings.load_failed')))
      .finally(() => setLoading(false));
    // Real Tanzania location hierarchy — used only as autocomplete
    // suggestions for the destination field below, never a hard whitelist:
    // a Super Agent can still type any real place a hardcoded/region list
    // might be missing.
    api.get('/locations/regions')
      .then(r => setRegionNames((r.data || []).map(x => x.name).filter(Boolean)))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    try {
      setSaving(true); setError(''); setSuccess('');
      await api.patch('/super-agents/my-profile', form);
      setSuccess(t('super_agent_settings.save_success'));
    } catch (err) {
      setError(err?.response?.data?.message || t('super_agent_settings.save_failed'));
    } finally { setSaving(false); }
  };

  const updateRate = (i, key, val) => {
    setRates(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r));
  };

  const handleSaveRates = async () => {
    const valid = rates.filter(r => r.destinationCity?.trim() && Number(r.ratePerKg) > 0);
    if (!valid.length) { setRateError(t('super_agent_settings.rate_validation_error')); return; }
    try {
      setRateSaving(true); setRateError(''); setRateMessage('');
      await api.post('/super-agents/rates', {
        rates: valid.map(r => ({
          destinationCity: r.destinationCity.trim(),
          ratePerKg: Number(r.ratePerKg),
          minimumCharge: Number(r.minimumCharge) || 0,
          estimatedDays: Number(r.estimatedDays) || 3,
        })),
      });
      setRateMessage(t('super_agent_settings.rate_save_success'));
      // Re-fetch so the list reflects exactly what's persisted (ids, any
      // rows silently skipped by the backend for other reasons).
      if (form.city) {
        const r = await api.get(`/super-agents/rates/${encodeURIComponent(form.city)}`).catch(() => null);
        if (r?.data?.length) setRates(r.data);
      }
    } catch (err) {
      setRateError(err?.response?.data?.message || t('super_agent_settings.rate_save_failed'));
    } finally { setRateSaving(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column',
      backgroundColor: '#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('back')} title={t('super_agent_settings.page_title')} top={0} />

      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto',
        width: '100%', boxSizing: 'border-box', paddingBottom: 32 }}>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳</div>
        ) : (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>

            {profile?.agentCode && (
              <div style={{ backgroundColor: '#eff6ff', borderRadius: 10, padding: '10px 14px',
                marginBottom: 20, fontSize: 13, color: '#1d4ed8', fontFamily: 'monospace',
                fontWeight: 800, textAlign: 'center' }}>
                {profile.agentCode}
              </div>
            )}

            {error && (
              <div style={{ color: '#dc2626', backgroundColor: '#fee2e2',
                padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
                ❌ {error}
              </div>
            )}
            {success && (
              <div style={{ color: '#16a34a', backgroundColor: '#dcfce7',
                padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13,
                fontWeight: 700 }}>
                {success}
              </div>
            )}

            {[
              { k: 'businessName',   l: t('super_agent_settings.field_business_name_label'),         ph: 'Geita Express Hub' },
              { k: 'phone',          l: t('super_agent_settings.field_phone_label'),                 ph: '0712345678' },
              { k: 'whatsappNumber', l: t('super_agent_settings.field_whatsapp_label'),               ph: '255712345678' },
              { k: '__location_picker__', isCustom: true },
            { k: 'city',           l: t('super_agent_settings.field_city_label'),                  ph: t('super_agent_settings.field_city_placeholder') },
              { k: 'region',         l: t('super_agent_settings.field_region_label'),                   ph: t('super_agent_settings.field_region_placeholder') },
              { k: 'address',        l: t('super_agent_settings.field_address_label'),          ph: t('super_agent_settings.field_address_placeholder') },
              { k: 'description',    l: t('super_agent_settings.field_description_label'),      ph: t('super_agent_settings.field_description_placeholder') },
            ].map(f => (
              <div key={f.k} style={{ marginBottom: 14 }}>
                {f.isCustom ? (
                  <LocationPicker
                    label={t('super_agent_settings.location_picker_label')}
                    value={location}
                    onChange={loc => {
                      setLocation(loc);
                      setForm(p => ({
                        ...p,
                        city: loc.districtName || p.city,
                        region: loc.regionName || p.region,
                      }));
                    }}
                  />
                ) : (
                  <>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700,
                      color: '#475569', marginBottom: 5 }}>{f.l}</label>
                    <input type="text" placeholder={f.ph} value={form[f.k] || ''}
                      onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))}
                      style={inp} />
                  </>
                )}
              </div>
            ))}

            <button onClick={handleSave} disabled={saving}
              style={{ width: '100%', backgroundColor: saving ? '#94a3b8' : '#1d4ed8',
                color: '#fff', border: 'none', padding: 14, borderRadius: 10,
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: 15, fontWeight: 900, marginTop: 8 }}>
              {saving ? t('super_agent_settings.saving') : t('super_agent_settings.save_button')}
            </button>
          </div>
        )}

        {/* ── Bei / Route Pricing ── */}
        {!loading && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginTop: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#1e293b', marginBottom: 4 }}>
              📋 {t('super_agent_settings.rates_title')}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
              {t('super_agent_settings.rates_desc', { city: form.city || '—' })}
            </div>

            <datalist id="kentexa-region-suggestions">
              {regionNames.map(n => <option key={n} value={n} />)}
            </datalist>

            {rateError && (
              <div style={{ color: '#dc2626', backgroundColor: '#fee2e2',
                padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
                ❌ {rateError}
              </div>
            )}
            {rateMessage && (
              <div style={{ color: '#16a34a', backgroundColor: '#dcfce7',
                padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13,
                fontWeight: 700 }}>
                {rateMessage}
              </div>
            )}

            {rates.map((r, i) => (
              <div key={r.id || `new-${i}`} style={{ display: 'grid',
                gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10,
                paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700,
                    color: '#475569', marginBottom: 4 }}>
                    {t('super_agent_settings.rate_destination_label')}
                  </label>
                  <input type="text" list="kentexa-region-suggestions"
                    placeholder={t('super_agent_settings.rate_destination_placeholder')}
                    value={r.destinationCity} onChange={e => updateRate(i, 'destinationCity', e.target.value)}
                    style={inp} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700,
                    color: '#475569', marginBottom: 4 }}>
                    {t('super_agent_settings.rate_per_kg_label')}
                  </label>
                  <input type="number" placeholder="3000" value={r.ratePerKg}
                    onChange={e => updateRate(i, 'ratePerKg', e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700,
                    color: '#475569', marginBottom: 4 }}>
                    {t('super_agent_settings.rate_minimum_label')}
                  </label>
                  <input type="number" placeholder="5000" value={r.minimumCharge}
                    onChange={e => updateRate(i, 'minimumCharge', e.target.value)} style={inp} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700,
                    color: '#475569', marginBottom: 4 }}>
                    {t('super_agent_settings.rate_days_label')}
                  </label>
                  <input type="number" placeholder="3" value={r.estimatedDays}
                    onChange={e => updateRate(i, 'estimatedDays', e.target.value)} style={inp} />
                </div>
              </div>
            ))}

            <button onClick={() => setRates(prev => [...prev, blankRate()])}
              style={{ width: '100%', background: '#fff', color: '#1d4ed8',
                border: '2px dashed #bfdbfe', padding: 10, borderRadius: 10,
                cursor: 'pointer', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
              + {t('super_agent_settings.rate_add_route')}
            </button>

            <button onClick={handleSaveRates} disabled={rateSaving}
              style={{ width: '100%', backgroundColor: rateSaving ? '#94a3b8' : '#16a34a',
                color: '#fff', border: 'none', padding: 14, borderRadius: 10,
                cursor: rateSaving ? 'not-allowed' : 'pointer',
                fontSize: 15, fontWeight: 900 }}>
              {rateSaving ? t('super_agent_settings.saving') : t('super_agent_settings.rate_save_button')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SuperAgentSettings;