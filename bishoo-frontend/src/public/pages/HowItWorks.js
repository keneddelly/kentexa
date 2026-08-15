import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';

const HowItWorks = ({ onNavigate }) => {
  const { t } = useTranslation();
  const [activeRole, setActiveRole] = useState('buyer');

  const buildSteps = (roleKey, icons) => icons.map((icon, i) => ({
    icon,
    title: t(`how_it_works.${roleKey}_step${i + 1}_title`),
    desc: t(`how_it_works.${roleKey}_step${i + 1}_desc`),
  }));

  const roles = {
    buyer: {
      icon: '🛒', label: t('how_it_works.role_buyer_label'), color: '#1d4ed8',
      steps: buildSteps('buyer', ['🔍', '🛒', '📍', '💳', '📦', '✅']),
    },
    seller: {
      icon: '🏪', label: t('how_it_works.role_seller_label'), color: '#16a34a',
      steps: buildSteps('seller', ['📝', '📦', '🔔', '🚚', '🧾', '💰']),
    },
    agent: {
      icon: '🤝', label: t('how_it_works.role_agent_label'), color: '#7c3aed',
      steps: buildSteps('agent', ['📋', '🏪', '🔍', '💵', '✅', '💰']),
    },
    super_agent: {
      icon: '🏢', label: t('how_it_works.role_super_agent_label'), color: '#ea580c',
      steps: buildSteps('super_agent', ['📋', '📦', '🔍', '🚚', '🛵', '💰']),
    },
  };

  const current = roles[activeRole];

  const fees = [
    { category: t('how_it_works.fee_electronics'), fee: '10%', note: t('how_it_works.note_product_price_only') },
    { category: t('how_it_works.fee_fashion'), fee: '12%', note: t('how_it_works.note_product_price_only') },
    { category: t('how_it_works.fee_vehicles'), fee: '5%', note: t('how_it_works.note_product_price_only') },
    { category: t('how_it_works.fee_agriculture'), fee: '8%', note: t('how_it_works.note_product_price_only') },
    { category: t('how_it_works.fee_security'), fee: '8%', note: t('how_it_works.note_product_price_only') },
    { category: t('how_it_works.fee_all_others'), fee: '10%', note: t('how_it_works.note_product_price_only') },
    { category: t('how_it_works.fee_property_services'), fee: '0%', note: t('how_it_works.note_free_contact_seller') },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <BackBar onBack={() => onNavigate('back')} title={t('how_it_works.page_title', 'How It Works')} top={0} />

      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg,#1e1b4b,#1d4ed8)', padding: '48px 16px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: '#fff', margin: '0 0 12px', fontFamily: 'Manrope,sans-serif' }}>{t('how_it_works.hero_title')}</h1>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.8)', maxWidth: 500, margin: '0 auto' }}>
          {t('how_it_works.hero_desc')}
        </p>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', width: '100%', padding: '0 16px' }}>

        {/* Role selector */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, margin: '24px 0 20px' }}>
          {Object.entries(roles).map(([key, r]) => (
            <button key={key} onClick={() => setActiveRole(key)}
              style={{ padding: '12px 4px', borderRadius: 12, border: '2px solid', borderColor: activeRole === key ? r.color : '#e2e8f0', backgroundColor: activeRole === key ? `${r.color}15` : '#fff', cursor: 'pointer', textAlign: 'center' }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{r.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: activeRole === key ? r.color : '#64748b' }}>{r.label}</div>
            </button>
          ))}
        </div>

        {/* Steps */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '24px 20px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1e293b', margin: '0 0 20px', fontFamily: 'Manrope,sans-serif' }}>
            {current.icon} {t('how_it_works.for_role_title', { role: current.label })}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {current.steps.map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: current.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                    {step.icon}
                  </div>
                  {i < current.steps.length - 1 && <div style={{ width: 2, flex: 1, backgroundColor: '#e2e8f0', margin: '4px 0' }} />}
                </div>
                <div style={{ paddingTop: 8, paddingBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>
                    {t('how_it_works.step_label', { num: i + 1, title: step.title })}
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7 }}>{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Methods */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '24px 20px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1e293b', margin: '0 0 16px', fontFamily: 'Manrope,sans-serif' }}>{t('how_it_works.payment_methods_title')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
            {[
              { icon: '📱', name: 'M-Pesa', desc: t('how_it_works.payment_mpesa_desc') },
              { icon: '📱', name: 'Airtel Money', desc: t('how_it_works.payment_airtel_desc') },
              { icon: '📱', name: 'Tigo Pesa', desc: t('how_it_works.payment_tigo_desc') },
              { icon: '📱', name: 'HaloPesa', desc: t('how_it_works.payment_halopesa_desc') },
              { icon: '🤝', name: t('how_it_works.payment_agent_name'), desc: t('how_it_works.payment_agent_desc') },
            ].map(p => (
              <div key={p.name} style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: '14px 12px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>{p.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>{p.name}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{p.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Commission fees */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '24px 20px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1e293b', margin: '0 0 6px', fontFamily: 'Manrope,sans-serif' }}>{t('how_it_works.commission_title')}</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>{t('how_it_works.commission_desc')}</p>
          <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', backgroundColor: '#0f172a', padding: '10px 14px' }}>
              <div style={{ flex: 1, fontSize: 12, fontWeight: 800, color: '#fff' }}>{t('how_it_works.table_category')}</div>
              <div style={{ width: 60, fontSize: 12, fontWeight: 800, color: '#fff', textAlign: 'center' }}>{t('how_it_works.table_fee')}</div>
              <div style={{ flex: 1, fontSize: 12, fontWeight: 800, color: '#fff', textAlign: 'right' }}>{t('how_it_works.table_note')}</div>
            </div>
            {fees.map((f, i) => (
              <div key={f.category} style={{ display: 'flex', alignItems: 'center', padding: '11px 14px', backgroundColor: i % 2 === 0 ? '#f8fafc' : '#fff', borderTop: '1px solid #e2e8f0' }}>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{f.category}</div>
                <div style={{ width: 60, fontSize: 14, fontWeight: 900, color: '#1d4ed8', textAlign: 'center' }}>{f.fee}</div>
                <div style={{ flex: 1, fontSize: 11, color: '#64748b', textAlign: 'right' }}>{f.note}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Buyer Protection */}
        <div style={{ background: 'linear-gradient(135deg,#dcfce7,#d1fae5)', borderRadius: 16, padding: '24px 20px', marginBottom: 16, border: '1px solid #86efac' }}>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: '#15803d', margin: '0 0 14px', fontFamily: 'Manrope,sans-serif' }}>{t('how_it_works.protection_title')}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              t('how_it_works.protection_point1'),
              t('how_it_works.protection_point2'),
              t('how_it_works.protection_point3'),
              t('how_it_works.protection_point4'),
              t('how_it_works.protection_point5'),
            ].map((point, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 16, flexShrink: 0, color: '#16a34a', fontWeight: 900, marginTop: 1 }}>✓</span>
                <span style={{ fontSize: 14, color: '#166534', lineHeight: 1.6 }}>{point}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '24px 20px', marginBottom: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', textAlign: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1e293b', margin: '0 0 8px', fontFamily: 'Manrope,sans-serif' }}>{t('how_it_works.cta_title')}</h2>
          <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 20px' }}>{t('how_it_works.cta_desc')}</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => onNavigate('Register')}
              style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: '13px 24px', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 800, fontFamily: 'Manrope,sans-serif' }}>
              {t('how_it_works.cta_create_account')}
            </button>
            <button onClick={() => onNavigate('Stores')}
              style={{ backgroundColor: '#f8fafc', color: '#1d4ed8', border: '2px solid #1d4ed8', padding: '13px 24px', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
              {t('how_it_works.cta_browse_store')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HowItWorks;