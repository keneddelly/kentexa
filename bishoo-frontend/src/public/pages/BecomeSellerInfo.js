/**
 * BecomeSellerInfo.js
 * Shown to logged-in buyers who tap "Tuma Kifurushi"
 * Explains benefits of selling on KenteXa and guides them to apply
 *
 * Place at: src/public/pages/BecomeSellerInfo.js
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';

const getBenefits = (t) => [
  { icon: '📦', title: t('become_seller_info.benefit1_title'), desc: t('become_seller_info.benefit1_desc') },
  { icon: '📍', title: t('become_seller_info.benefit2_title'), desc: t('become_seller_info.benefit2_desc') },
  { icon: '💬', title: t('become_seller_info.benefit3_title'), desc: t('become_seller_info.benefit3_desc') },
  { icon: '💰', title: t('become_seller_info.benefit4_title'), desc: t('become_seller_info.benefit4_desc') },
  { icon: '🤝', title: t('become_seller_info.benefit5_title'), desc: t('become_seller_info.benefit5_desc') },
  { icon: '📊', title: t('become_seller_info.benefit6_title'), desc: t('become_seller_info.benefit6_desc') },
];

const BecomeSellerInfo = ({ onNavigate }) => {
  const { t } = useTranslation();
  const BENEFITS = getBenefits(t);
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <BackBar title={t('become_seller_info.page_title')} onBack={() => onNavigate('back')} />

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 16px 40px' }}>

        {/* Hero */}
        <div style={{ background: 'linear-gradient(135deg,#1d4ed8,#7c3aed)',
          borderRadius: 20, padding: 28, marginBottom: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏪</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 8 }}>
            {t('become_seller_info.hero_title')}
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6 }}>
            {t('become_seller_info.hero_desc')}
          </div>
        </div>

        {/* Benefits */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', marginBottom: 16 }}>
            {t('become_seller_info.benefits_title')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {BENEFITS.map((b, i) => (
              <div key={i} style={{ backgroundColor: '#fff', borderRadius: 12, padding: '14px 16px',
                display: 'flex', gap: 14, alignItems: 'flex-start',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: 24, flexShrink: 0 }}>{b.icon}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 3 }}>
                    {b.title}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{b.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Fee info */}
        <div style={{ backgroundColor: '#eff6ff', borderRadius: 14, padding: 16, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1d4ed8', marginBottom: 6 }}>
            {t('become_seller_info.fee_title')}
          </div>
          <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
            <span style={{ fontWeight: 700 }}>{t('become_seller_info.fee_amount')}</span>{t('become_seller_info.fee_desc')}
          </div>
        </div>

        {/* Steps */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a', marginBottom: 14 }}>
            {t('become_seller_info.steps_title')}
          </div>
          {[
            { step: '1', text: t('become_seller_info.step1') },
            { step: '2', text: t('become_seller_info.step2') },
            { step: '3', text: t('become_seller_info.step3') },
          ].map(s => (
            <div key={s.step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%',
                backgroundColor: '#1d4ed8', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 900, flexShrink: 0 }}>
                {s.step}
              </div>
              <div style={{ fontSize: 13, color: '#475569', paddingTop: 5, lineHeight: 1.5 }}>
                {s.text}
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button onClick={() => onNavigate('BecomeSeller')}
          style={{ width: '100%', background: 'linear-gradient(135deg,#1d4ed8,#7c3aed)',
            color: '#fff', border: 'none', padding: '16px 20px', borderRadius: 14,
            fontSize: 16, fontWeight: 900, cursor: 'pointer', marginBottom: 12 }}>
          {t('become_seller_info.apply_button')}
        </button>

        <button onClick={() => onNavigate('back')}
          style={{ width: '100%', backgroundColor: '#f1f5f9', color: '#64748b',
            border: 'none', padding: '12px 20px', borderRadius: 14,
            fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          {t('become_seller_info.back_button')}
        </button>

        {/* Already seller */}
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
            {t('become_seller_info.already_seller_label')}
          </div>
          <button onClick={() => onNavigate('StoreSettings')}
            style={{ background: 'none', border: 'none', color: '#1d4ed8',
              fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {t('become_seller_info.go_to_store_settings')}
          </button>
        </div>

      </div>
    </div>
  );
};

export default BecomeSellerInfo;