import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/Navbar';

const PrivacyPolicy = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const { t } = useTranslation();
  const [openSection, setOpenSection] = useState(null);

  const sections = Array.from({ length: 10 }, (_, i) => ({
    title: t(`privacy_policy.section${i + 1}_title`),
    content: t(`privacy_policy.section${i + 1}_content`),
  }));

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <Navbar currentPage="Privacy" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />

      <div style={{ background: 'linear-gradient(135deg,#0f172a,#1e1b4b)', padding: '40px 16px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: '#fff', margin: '0 0 10px', fontFamily: 'Manrope,sans-serif' }}>{t('privacy_policy.page_title')}</h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: 0 }}>{t('privacy_policy.page_subtitle')}</p>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', width: '100%', padding: '20px 16px 40px' }}>
        <div style={{ backgroundColor: '#dcfce7', borderRadius: 12, padding: '14px 16px', marginBottom: 20, border: '1px solid #86efac' }}>
          <p style={{ fontSize: 13, color: '#15803d', margin: 0, lineHeight: 1.6 }}>
            {t('privacy_policy.intro_banner')}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sections.map((section, i) => (
            <div key={i} style={{ backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <button onClick={() => setOpenSection(openSection === i ? null : i)}
                style={{ width: '100%', padding: '16px 18px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{section.title}</span>
                <span style={{ fontSize: 18, color: '#64748b', flexShrink: 0 }}>{openSection === i ? '−' : '+'}</span>
              </button>
              {openSection === i && (
                <div style={{ padding: '0 18px 18px', borderTop: '1px solid #f1f5f9' }}>
                  <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.8, margin: '14px 0 0', whiteSpace: 'pre-line' }}>{section.content}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default PrivacyPolicy;