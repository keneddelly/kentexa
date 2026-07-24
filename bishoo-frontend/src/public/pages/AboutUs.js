import React from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const AboutUs = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const team = [
    { name: 'Kened Delly', role: 'Founder & CEO', emoji: '👨‍💼', desc: 'Visionary behind KenteXa — building Tanzania\'s digital commerce future.' },
    { name: 'Tech Team', role: 'Engineering', emoji: '👨‍💻', desc: 'Building and maintaining the platform infrastructure.' },
    { name: 'Support Team', role: 'Customer Success', emoji: '🤝', desc: 'Ensuring every buyer and seller has a great experience.' },
  ];

  const milestones = [
    { year: '2024', event: 'KenteXa idea conceived — solving Tanzania\'s fragmented marketplace problem' },
    { year: '2025', event: 'Platform development begins under Bishoo Intelligence Systems (BiS)' },
    { year: '2026', event: 'KenteXa launches publicly — connecting buyers, sellers and agents nationwide' },
  ];

  const values = [
    { icon: '🛡️', title: 'Trust & Safety', desc: 'Every transaction is protected. Buyers pay securely, sellers receive verified payments.' },
    { icon: '🇹🇿', title: 'Made for Tanzania', desc: 'Built for Tanzanian people — supporting M-Pesa, Airtel, Tigo and local agent networks.' },
    { icon: '🤝', title: 'Community First', desc: 'We empower small businesses, individual sellers and local agents to earn and grow.' },
    { icon: '🚀', title: 'Innovation', desc: 'Continuous improvement — from AI-powered search to real-time parcel tracking.' },
    { icon: '💯', title: 'Transparency', desc: 'Clear fees, honest policies, no hidden charges for buyers or sellers.' },
    { icon: '📦', title: 'Reliability', desc: 'Our Super Agent network ensures your parcel reaches you anywhere in Tanzania.' },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <Navbar currentPage="AboutUs" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />

      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#1d4ed8 100%)', padding: '60px 16px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -80, right: -80, width: 300, height: 300, borderRadius: '50%', backgroundColor: 'rgba(29,78,216,0.15)' }} />
        <div style={{ position: 'absolute', bottom: -60, left: -60, width: 200, height: 200, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.05)' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 0, marginBottom: 16 }}>
            <span style={{ fontSize: 48, fontWeight: 900, color: '#fff', fontFamily: 'Manrope,sans-serif' }}>Kente</span>
            <span style={{ fontSize: 48, fontWeight: 900, color: '#60a5fa', fontFamily: 'Manrope,sans-serif' }}>Xa</span>
          </div>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 20 }}>Tanzania's #1 Marketplace</p>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#fff', margin: '0 0 16px', fontFamily: 'Manrope,sans-serif', lineHeight: 1.3 }}>
            Connecting Tanzania —<br />One Transaction at a Time
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.8)', maxWidth: 560, margin: '0 auto', lineHeight: 1.7 }}>
            KenteXa is a secure digital marketplace built for Tanzania — empowering buyers, sellers, and agents to trade with confidence across all 21 regions.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', width: '100%', padding: '0 16px' }}>

        {/* Mission */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '28px 24px', margin: '24px 0 16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', margin: '0 0 14px', fontFamily: 'Manrope,sans-serif' }}>🎯 Our Mission</h2>
          <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.8, margin: 0 }}>
            To democratize commerce in Tanzania by building a trusted digital marketplace where anyone — from a mama ntilie in Mwanza to a tech seller in Dar es Salaam — can buy and sell safely, pay easily, and receive goods reliably anywhere in the country.
          </p>
        </div>

        {/* Story */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '28px 24px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', margin: '0 0 14px', fontFamily: 'Manrope,sans-serif' }}>📖 Our Story</h2>
          <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.8, marginBottom: 14 }}>
            KenteXa was born from a simple observation — Tanzania has millions of talented sellers, creative entrepreneurs, and hardworking small business owners, but no single trusted platform where they could reach customers safely across the entire country.
          </p>
          <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.8, marginBottom: 14 }}>
            Traditional online marketplaces lacked mobile money integration, local delivery networks, and the trust mechanisms needed for Tanzanian commerce. Buyers feared being scammed. Sellers struggled to get paid. Parcels got lost with no tracking.
          </p>
          <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.8, margin: 0 }}>
            KenteXa solves all of this — with built-in escrow protection, a nationwide Super Agent delivery network, mobile money payments (M-Pesa, Airtel, Tigo), real-time parcel tracking, and a community of verified sellers. Built by Tanzanians, for Tanzania.
          </p>
        </div>

        {/* Values */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '28px 24px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', margin: '0 0 20px', fontFamily: 'Manrope,sans-serif' }}>💎 Our Values</h2>
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
          <h2 style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', margin: '0 0 20px', fontFamily: 'Manrope,sans-serif' }}>🏆 Our Journey</h2>
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
          <h2 style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', margin: '0 0 20px', fontFamily: 'Manrope,sans-serif' }}>👥 The Team</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14 }}>
            {team.map(t => (
              <div key={t.name} style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: '20px 16px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>{t.emoji}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>{t.name}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>{t.role}</div>
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>{t.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div style={{ background: 'linear-gradient(135deg,#1e1b4b,#1d4ed8)', borderRadius: 16, padding: '28px 24px', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: '#fff', margin: '0 0 20px', textAlign: 'center', fontFamily: 'Manrope,sans-serif' }}>KenteXa by the Numbers</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16 }}>
            {[
              { value: '21', label: 'Regions Covered', icon: '🇹🇿' },
              { value: '100%', label: 'Secure Payments', icon: '🔒' },
              { value: '3', label: 'Payment Networks', icon: '💳' },
              { value: '24/7', label: 'Platform Available', icon: '⏰' },
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
          <h2 style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', margin: '0 0 14px', fontFamily: 'Manrope,sans-serif' }}>📬 Get in Touch</h2>
          <p style={{ fontSize: 14, color: '#64748b', marginBottom: 16, lineHeight: 1.7 }}>Have questions, feedback or partnership inquiries? We'd love to hear from you.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { icon: '📧', label: 'Email', value: 'support@kentexa.com', href: 'mailto:support@kentexa.com' },
              { icon: '🌐', label: 'Website', value: 'kentexa.com', href: 'https://kentexa.com' },
              { icon: '🏢', label: 'Company', value: 'Bishoo Intelligence Systems (BiS)', href: null },
              { icon: '🇹🇿', label: 'Location', value: 'Tanzania', href: null },
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

      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default AboutUs;