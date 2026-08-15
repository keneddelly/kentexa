import React from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';

const AboutUs = ({ onNavigate }) => {
  const { t } = useTranslation();
  const team = [
    { name: t('about_us.team1_name'), role: t('about_us.team1_role'), emoji: '👨‍💼', desc: t('about_us.team1_desc') },
    { name: t('about_us.team2_name'), role: t('about_us.team2_role'), emoji: '👨‍💻', desc: t('about_us.team2_desc') },
    { name: t('about_us.team3_name'), role: t('about_us.team3_role'), emoji: '🤝', desc: t('about_us.team3_desc') },
  ];

  const milestones = [
    { year: '2024', event: t('about_us.milestone1') },
    { year: '2025', event: t('about_us.milestone2') },
    { year: '2026', event: t('about_us.milestone3') },
  ];

  const values = [
    { icon: '🛡️', title: t('about_us.value1_title'), desc: t('about_us.value1_desc') },
    { icon: '🇹🇿', title: t('about_us.value2_title'), desc: t('about_us.value2_desc') },
    { icon: '🤝', title: t('about_us.value3_title'), desc: t('about_us.value3_desc') },
    { icon: '🚀', title: t('about_us.value4_title'), desc: t('about_us.value4_desc') },
    { icon: '💯', title: t('about_us.value5_title'), desc: t('about_us.value5_desc') },
    { icon: '📦', title: t('about_us.value6_title'), desc: t('about_us.value6_desc') },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <BackBar onBack={() => onNavigate('back')} title="About Us" top={0} />

      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#1d4ed8 100%)', padding: '60px 16px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -80, right: -80, width: 300, height: 300, borderRadius: '50%', backgroundColor: 'rgba(29,78,216,0.15)' }} />
        <div style={{ position: 'absolute', bottom: -60, left: -60, width: 200, height: 200, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.05)' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 0, marginBottom: 16 }}>
            <span style={{ fontSize: 48, fontWeight: 900, color: '#fff', fontFamily: 'Manrope,sans-serif' }}>Kente</span>
            <span style={{ fontSize: 48, fontWeight: 900, color: '#60a5fa', fontFamily: 'Manrope,sans-serif' }}>Xa</span>
          </div>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 20 }}>{t('about_us.hero_tagline')}</p>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#fff', margin: '0 0 16px', fontFamily: 'Manrope,sans-serif', lineHeight: 1.3 }}>
            {t('about_us.hero_title_line1')}<br />{t('about_us.hero_title_line2')}
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.8)', maxWidth: 560, margin: '0 auto', lineHeight: 1.7 }}>
            {t('about_us.hero_desc')}
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', width: '100%', padding: '0 16px' }}>

        {/* Mission */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '28px 24px', margin: '24px 0 16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', margin: '0 0 14px', fontFamily: 'Manrope,sans-serif' }}>{t('about_us.mission_title')}</h2>
          <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.8, margin: 0 }}>
            {t('about_us.mission_desc')}
          </p>
        </div>

        {/* Story */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '28px 24px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', margin: '0 0 14px', fontFamily: 'Manrope,sans-serif' }}>{t('about_us.story_title')}</h2>
          <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.8, marginBottom: 14 }}>
            {t('about_us.story_p1')}
          </p>
          <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.8, marginBottom: 14 }}>
            {t('about_us.story_p2')}
          </p>
          <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.8, margin: 0 }}>
            {t('about_us.story_p3')}
          </p>
        </div>

        {/* Values */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '28px 24px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', margin: '0 0 20px', fontFamily: 'Manrope,sans-serif' }}>{t('about_us.values_title')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 14 }}>
            {values.map(v => (
              <div key={v.title} style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: '16px 14px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{v.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>{v.title}</div>
                <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>{v.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Milestones */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '28px 24px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', margin: '0 0 20px', fontFamily: 'Manrope,sans-serif' }}>{t('about_us.journey_title')}</h2>
          {milestones.map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, marginBottom: i < milestones.length - 1 ? 20 : 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: '#1d4ed8', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, flexShrink: 0 }}>{m.year}</div>
                {i < milestones.length - 1 && <div style={{ width: 2, flex: 1, backgroundColor: '#e2e8f0', margin: '4px 0' }} />}
              </div>
              <div style={{ paddingTop: 10, paddingBottom: 16 }}>
                <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, margin: 0 }}>{m.event}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Team */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '28px 24px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', margin: '0 0 20px', fontFamily: 'Manrope,sans-serif' }}>{t('about_us.team_title')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14 }}>
            {team.map(m => (
              <div key={m.name} style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: '20px 16px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>{m.emoji}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>{m.name}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>{m.role}</div>
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>{m.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div style={{ background: 'linear-gradient(135deg,#1e1b4b,#1d4ed8)', borderRadius: 16, padding: '28px 24px', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: '#fff', margin: '0 0 20px', textAlign: 'center', fontFamily: 'Manrope,sans-serif' }}>{t('about_us.stats_title')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16 }}>
            {[
              { value: '21', label: t('about_us.stat1_label'), icon: '🇹🇿' },
              { value: '100%', label: t('about_us.stat2_label'), icon: '🔒' },
              { value: '3', label: t('about_us.stat3_label'), icon: '💳' },
              { value: '24/7', label: t('about_us.stat4_label'), icon: '⏰' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center', padding: '16px 8px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 }}>
                <div style={{ fontSize: 28 }}>{s.icon}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', fontFamily: 'Manrope,sans-serif' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Contact */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '28px 24px', marginBottom: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', margin: '0 0 14px', fontFamily: 'Manrope,sans-serif' }}>{t('about_us.contact_title')}</h2>
          <p style={{ fontSize: 14, color: '#64748b', marginBottom: 16, lineHeight: 1.7 }}>{t('about_us.contact_desc')}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { icon: '📧', label: t('about_us.contact_email_label'), value: 'support@kentexa.com', href: 'mailto:support@kentexa.com' },
              { icon: '🌐', label: t('about_us.contact_website_label'), value: 'kentexa.com', href: 'https://kentexa.com' },
              { icon: '🏢', label: t('about_us.contact_company_label'), value: t('about_us.contact_company_value'), href: null },
              { icon: '🇹🇿', label: t('about_us.contact_location_label'), value: t('about_us.contact_location_value'), href: null },
            ].map(c => (
              <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', backgroundColor: '#f8fafc', borderRadius: 10 }}>
                <span style={{ fontSize: 20 }}>{c.icon}</span>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{c.label}</div>
                  {c.href
                    ? <a href={c.href} style={{ fontSize: 14, fontWeight: 700, color: '#1d4ed8', textDecoration: 'none' }}>{c.value}</a>
                    : <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{c.value}</div>
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutUs;