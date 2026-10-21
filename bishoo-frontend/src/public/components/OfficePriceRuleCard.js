import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';

// "Bei" page: HOW this office charges for transport — a percent of the goods value with a
// minimum (default 10%, minimum 5,000 TZS), or by kg using the per-destination rates below.
// The counter uses this rule for its price preview, the receipt and the invoice.
// By kg, route prices come only from the office's shipping rates (shown here read-only,
// edited in the rates form below); a town with no rate is refused at the counter.

const inp = { width: '100%', padding: '11px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', outline: 'none' };

const OfficePriceRuleCard = () => {
  const { t } = useTranslation();
  const [rule, setRule] = useState(null);
  const [form, setForm] = useState({ chargeMode: 'value', valuePercent: '10', valueMinimum: '5000' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    api.get('/super-agents/me/price-rule')
      .then(({ data }) => {
        setRule(data);
        setForm({ chargeMode: data.chargeMode, valuePercent: String(Number(data.valuePercent)), valueMinimum: String(Number(data.valueMinimum)) });
      })
      .catch(() => setHidden(true)); // not an active office role: nothing to set here
  }, []);

  if (hidden) return null;

  const save = async () => {
    setSaving(true); setMessage(''); setError('');
    try {
      const { data } = await api.put('/super-agents/me/price-rule', {
        chargeMode: form.chargeMode, valuePercent: Number(form.valuePercent), valueMinimum: Number(form.valueMinimum),
      });
      setRule(data);
      setMessage(t('office_price_rule.saved'));
    } catch (e) {
      setError(e?.response?.data?.message || t('office_price_rule.save_failed'));
    } finally { setSaving(false); }
  };

  const choice = (value, label, hint) => (
    <button type="button" role="radio" aria-checked={form.chargeMode === value} onClick={() => setForm((f) => ({ ...f, chargeMode: value }))}
      style={{ flex: 1, textAlign: 'left', padding: 12, borderRadius: 12, cursor: 'pointer', backgroundColor: form.chargeMode === value ? '#eff6ff' : '#fff',
        border: `2px solid ${form.chargeMode === value ? '#1d4ed8' : '#e2e8f0'}` }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{label}</div>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{hint}</div>
    </button>
  );

  return (
    <div data-testid="office-price-rule" style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginTop: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 900, color: '#1e293b', marginBottom: 4 }}>💰 {t('office_price_rule.title')}</div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
        {t('office_price_rule.desc')}
        {rule?.source === 'default' && <> {t('office_price_rule.default_note')}</>}
      </div>
      <div role="radiogroup" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {choice('value', t('office_price_rule.by_value'), t('office_price_rule.by_value_hint'))}
        {choice('kg', t('office_price_rule.by_kg'), t('office_price_rule.by_kg_hint'))}
      </div>
      {form.chargeMode === 'kg' ? (
        <div data-testid="office-kg-rates">
          {(rule?.rates || []).length === 0 ? (
            <div style={{ fontSize: 12, color: '#b45309', backgroundColor: '#fef3c7', padding: '10px 12px', borderRadius: 8 }}>
              {t('office_price_rule.kg_no_rates')}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: '#64748b', textAlign: 'left' }}>
                  <th style={{ padding: '4px 0' }}>{t('office_price_rule.kg_town')}</th>
                  <th style={{ padding: '4px 0' }}>{t('office_price_rule.kg_rate')}</th>
                  <th style={{ padding: '4px 0' }}>{t('office_price_rule.minimum')}</th>
                </tr>
              </thead>
              <tbody>
                {rule.rates.map((r) => (
                  <tr key={r.destinationCity} style={{ borderTop: '1px solid #e2e8f0', color: '#0f172a' }}>
                    <td style={{ padding: '6px 0', fontWeight: 700 }}>{r.destinationCity}</td>
                    <td style={{ padding: '6px 0' }}>TZS {Number(r.ratePerKg).toLocaleString('en-US')}</td>
                    <td style={{ padding: '6px 0' }}>TZS {Number(r.minimumCharge).toLocaleString('en-US')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>
            {t('office_price_rule.percent')}
            <input type="number" min="0.01" max="100" step="0.5" value={form.valuePercent}
              onChange={(e) => setForm((f) => ({ ...f, valuePercent: e.target.value }))} style={{ ...inp, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>
            {t('office_price_rule.minimum')}
            <input type="number" min="0" step="100" value={form.valueMinimum}
              onChange={(e) => setForm((f) => ({ ...f, valueMinimum: e.target.value }))} style={{ ...inp, marginTop: 4 }} />
          </label>
        </div>
      )}
      <div style={{ fontSize: 11, color: '#64748b', margin: '8px 0 12px', lineHeight: 1.5 }}>
        {form.chargeMode === 'kg' ? t('office_price_rule.kg_rates_note') : t('office_price_rule.value_note')}
        {rule?.isDarEsSalaam && <> {t('office_price_rule.dar_note')}</>}
      </div>
      {error && <div role="alert" style={{ color: '#dc2626', backgroundColor: '#fee2e2', padding: '10px 14px', borderRadius: 8, marginBottom: 10, fontSize: 13 }}>❌ {error}</div>}
      {message && <div role="status" style={{ color: '#16a34a', backgroundColor: '#dcfce7', padding: '10px 14px', borderRadius: 8, marginBottom: 10, fontSize: 13, fontWeight: 700 }}>{message}</div>}
      <button type="button" onClick={save} disabled={saving}
        style={{ width: '100%', background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 13, borderRadius: 12, cursor: 'pointer', fontSize: 15, fontWeight: 900, opacity: saving ? 0.7 : 1 }}>
        {saving ? t('office_price_rule.saving') : t('office_price_rule.save')}
      </button>
    </div>
  );
};

export default OfficePriceRuleCard;
