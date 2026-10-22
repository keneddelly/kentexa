import React from 'react';
import { useTranslation } from 'react-i18next';

// "How you charge": the top section of the one Bei card in Settings. By value: a percent of
// the goods value with a minimum (default 10%, minimum TZS 5,000). By kg: the office's
// per-destination rates in the Route Pricing form below (each rate is shown once, there).
// Controlled: Settings holds the form and saves it with the routes in one Save.

const inp = { width: '100%', padding: '11px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', outline: 'none' };

const ChargeRuleSection = ({ rule, form, onChange }) => {
  const { t } = useTranslation();
  const set = (patch) => onChange({ ...form, ...patch });

  const choice = (value, label, hint) => (
    <button type="button" role="radio" aria-checked={form.chargeMode === value} onClick={() => set({ chargeMode: value })}
      style={{ flex: 1, textAlign: 'left', padding: 12, borderRadius: 12, cursor: 'pointer', backgroundColor: form.chargeMode === value ? '#eff6ff' : '#fff',
        border: `2px solid ${form.chargeMode === value ? '#1d4ed8' : '#e2e8f0'}` }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{label}</div>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{hint}</div>
    </button>
  );

  return (
    <div data-testid="office-price-rule" style={{ paddingBottom: 14, marginBottom: 14, borderBottom: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>💰 {t('office_price_rule.title')}</div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
        {t('office_price_rule.desc')}
        {rule?.source === 'default' && <> {t('office_price_rule.default_note')}</>}
      </div>
      <div role="radiogroup" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {choice('value', t('office_price_rule.by_value'), t('office_price_rule.by_value_hint'))}
        {choice('kg', t('office_price_rule.by_kg'), t('office_price_rule.by_kg_hint'))}
      </div>
      {form.chargeMode === 'kg' ? (
        <div data-testid="office-kg-note" style={{ fontSize: 12, color: '#1d4ed8', backgroundColor: '#eff6ff', padding: '10px 12px', borderRadius: 8 }}>
          {t('office_price_rule.kg_uses_routes')}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>
            {t('office_price_rule.percent')}
            <input type="number" min="0.01" max="100" step="0.5" value={form.valuePercent}
              onChange={(e) => set({ valuePercent: e.target.value })} style={{ ...inp, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>
            {t('office_price_rule.minimum')}
            <input type="number" min="0" step="100" value={form.valueMinimum}
              onChange={(e) => set({ valueMinimum: e.target.value })} style={{ ...inp, marginTop: 4 }} />
          </label>
        </div>
      )}
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 8, lineHeight: 1.5 }}>
        {form.chargeMode === 'kg' ? t('office_price_rule.kg_rates_note') : t('office_price_rule.value_note')}
        {rule?.isDarEsSalaam && <> {t('office_price_rule.dar_note')}</>}
      </div>
    </div>
  );
};

export default ChargeRuleSection;
