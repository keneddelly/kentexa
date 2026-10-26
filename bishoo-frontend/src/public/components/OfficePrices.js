import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';
import ChargeRuleSection from './ChargeRuleSection';
import OfficePickupCard from './OfficePickupCard';

// "Bei zangu" (office dashboard menu): every price the office sets, edited in one place
// (owner 2026-10-26: the edit button sent staff to Ofisi yangu, where the prices sat
// under the profile form). How the office charges + route prices (one Save), then
// pickup from the sender / same-city delivery.

const inp = {
  width: '100%', padding: '11px 14px', borderRadius: 10,
  border: '2px solid #e2e8f0', fontSize: 14,
  boxSizing: 'border-box', outline: 'none',
};

// A saved rate row as the form shows it: a saved 0 (no minimum) shows as an empty
// field, so a field shows a number only when the office typed one.
const shown = (v) => (v === '' || v == null || Number(v) === 0 ? '' : String(Number(v)));
const fromServer = (r) => ({ ...r, ratePerKg: shown(r.ratePerKg), minimumCharge: shown(r.minimumCharge) });

const OfficePrices = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState('');
  // ── Bei / route pricing ────────────────────────────────────────────────
  const blankRate = () => ({ destinationCity: '', ratePerKg: '', minimumCharge: '', estimatedDays: 3 });
  const [rates, setRates]         = useState([]);
  const [rateSaving, setRateSaving] = useState(false);
  const [rateMessage, setRateMessage] = useState('');
  const [rateError, setRateError]   = useState('');
  const [regionNames, setRegionNames] = useState([]);
  // How this office charges (value or kg): saved with the routes by the one Save.
  // null = not an active office role (the section is hidden; Save saves routes only).
  const [rule, setRule]           = useState(null);
  const [ruleForm, setRuleForm]   = useState({ chargeMode: 'value', valuePercent: '10', valueMinimum: '5000' });

  useEffect(() => {
    api.get('/super-agents/me/price-rule')
      .then(({ data }) => {
        setRule(data);
        setRuleForm({ chargeMode: data.chargeMode, valuePercent: String(Number(data.valuePercent)), valueMinimum: String(Number(data.valueMinimum)) });
      })
      .catch(() => setRule(null));
  }, []);

  useEffect(() => {
    api.get('/super-agents/my-profile')
      .then(res => {
        const c = res.data?.city || '';
        setCity(c);
        if (c) {
          return api.get(`/super-agents/rates/${encodeURIComponent(c)}`)
            .then(r => setRates(r.data?.length ? r.data.map(fromServer) : [blankRate()]))
            .catch(() => setRates([blankRate()]));
        }
        setRates([blankRate()]);
        return null;
      })
      .catch(() => setRates([blankRate()]))
      .finally(() => setLoading(false));
    // The region list the shipment engine matches a parcel against: a resolved
    // place's regionName (deriveLegacyRoutingCity) is looked up in
    // shipping_rate.destinationCity. The destination is picked from this list
    // so a typo can't save a route no parcel ever matches.
    api.get('/locations/regions')
      .then(r => setRegionNames((r.data || []).map(x => x.name).filter(Boolean)))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateRate = (i, key, val) => {
    setRates(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r));
  };

  // A saved destination the engine can match: the listed region name (any case),
  // or null for an old free-text row, which is kept and flagged until re-picked.
  const regionFor = (city) => {
    const c = (city || '').trim().toLowerCase();
    return c ? regionNames.find(n => n.toLowerCase() === c) || null : null;
  };
  // Route rows are the per-kg prices: shown only "By kg" (or with no charging rule).
  // "By value" hides them; the saved rows stay as they are.
  const showRoutes = !rule || ruleForm.chargeMode === 'kg';

  // One Save for the Bei card: how the office charges (PUT me/price-rule), then the
  // route rows (POST rates). Routes are optional when the charging rule is shown.
  const handleSaveRates = async () => {
    // Only rows on screen with a listed destination are sent; an old free-text row
    // is left untouched (not re-saved, not deleted) until it is re-picked.
    const valid = !showRoutes ? [] : rates.filter(r => regionFor(r.destinationCity) && Number(r.ratePerKg) > 0);
    if (!rule && !valid.length) { setRateError(t('super_agent_settings.rate_validation_error')); return; }
    try {
      setRateSaving(true); setRateError(''); setRateMessage('');
      if (rule) {
        const { data } = await api.put('/super-agents/me/price-rule', {
          chargeMode: ruleForm.chargeMode, valuePercent: Number(ruleForm.valuePercent), valueMinimum: Number(ruleForm.valueMinimum),
        });
        setRule(data);
      }
      if (!valid.length) { setRateMessage(t('office_price_rule.saved')); return; }
      await api.post('/super-agents/rates', {
        rates: valid.map(r => ({
          ...(r.id != null && { id: r.id }),
          destinationCity: r.destinationCity.trim(),
          ratePerKg: Number(r.ratePerKg),
          minimumCharge: Number(r.minimumCharge) || 0,
          estimatedDays: Number(r.estimatedDays) || 3,
        })),
      });
      setRateMessage(t('super_agent_settings.rate_save_success'));
      // Re-fetch so the list reflects exactly what's persisted (ids, any
      // rows silently skipped by the backend for other reasons).
      if (city) {
        const r = await api.get(`/super-agents/rates/${encodeURIComponent(city)}`).catch(() => null);
        if (r?.data?.length) setRates(r.data.map(fromServer));
      }
    } catch (err) {
      setRateError(err?.response?.data?.message || t('super_agent_settings.rate_save_failed'));
    } finally { setRateSaving(false); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳</div>;

  return (
    <>
        {/* ── Bei: one card. How this office charges, then the route prices; one Save ── */}
        {(
          <div data-testid="bei-card" style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginTop: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#1e293b', marginBottom: 12 }}>
              📋 {t('super_agent_settings.rates_title')}
            </div>
            {rule && <ChargeRuleSection rule={rule} form={ruleForm} onChange={setRuleForm} />}
            {showRoutes && (
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
                {t('super_agent_settings.rates_desc', { city: city || '—' })}
              </div>
            )}

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

            {showRoutes && rates.map((r, i) => {
              const region = regionFor(r.destinationCity);
              const legacy = !region && Boolean(r.destinationCity?.trim());
              const taken = new Set(rates.filter((_, j) => j !== i).map(x => regionFor(x.destinationCity)).filter(Boolean));
              return (
              <div key={r.id || `new-${i}`} data-testid="route-row" style={{ display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, marginBottom: 10,
                paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700,
                    color: '#475569', marginBottom: 4 }}>
                    {t('super_agent_settings.rate_destination_label')}
                  </label>
                  <select aria-label={t('super_agent_settings.rate_destination_label')}
                    value={region || ''} onChange={e => updateRate(i, 'destinationCity', e.target.value)}
                    style={{ ...inp, backgroundColor: '#fff', borderColor: legacy ? '#f59e0b' : '#e2e8f0' }}>
                    <option value="" disabled>{t('super_agent_settings.rate_destination_pick')}</option>
                    {regionNames.map(n => <option key={n} value={n} disabled={taken.has(n)}>{n}</option>)}
                  </select>
                  {legacy && (
                    <div data-testid="route-legacy-warning" style={{ fontSize: 11, color: '#b45309',
                      backgroundColor: '#fef3c7', padding: '6px 10px', borderRadius: 8, marginTop: 6 }}>
                      ⚠️ {t('super_agent_settings.rate_destination_unknown', { city: r.destinationCity.trim() })}
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700,
                    color: '#475569', marginBottom: 4 }}>
                    {t('super_agent_settings.rate_per_kg_label')}
                  </label>
                  <input type="number" placeholder="" value={r.ratePerKg}
                    onChange={e => updateRate(i, 'ratePerKg', e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700,
                    color: '#475569', marginBottom: 4 }}>
                    {t('super_agent_settings.rate_minimum_label')}
                  </label>
                  <input type="number" placeholder="" value={r.minimumCharge}
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
              );
            })}

            {showRoutes && <button onClick={() => setRates(prev => [...prev, blankRate()])}
              style={{ width: '100%', background: '#fff', color: '#1d4ed8',
                border: '2px dashed #bfdbfe', padding: 10, borderRadius: 10,
                cursor: 'pointer', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
              + {t('super_agent_settings.rate_add_route')}
            </button>}

            <button onClick={handleSaveRates} disabled={rateSaving}
              style={{ width: '100%', backgroundColor: rateSaving ? '#94a3b8' : '#16a34a',
                color: '#fff', border: 'none', padding: 14, borderRadius: 10,
                cursor: rateSaving ? 'not-allowed' : 'pointer',
                fontSize: 15, fontWeight: 900 }}>
              {rateSaving ? t('super_agent_settings.saving') : t('super_agent_settings.rate_save_button')}
            </button>
          </div>
        )}

        {/* Pickup from the sender: free or the office's own price (shown in the send form). */}
        <OfficePickupCard />
    </>
  );
};

export default OfficePrices;
