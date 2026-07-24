import React from 'react';

const Footer = ({ onNavigate }) => {
  return (
    <footer style={{ backgroundColor: '#0f172a', color: '#94a3b8', marginTop: 'auto' }}>

      {/* Main footer */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 16px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 24 }}>

        {/* Brand */}
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 0, marginBottom: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#fff', fontFamily: 'Manrope,sans-serif' }}>Kente</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#3b82f6', fontFamily: 'Manrope,sans-serif' }}>Xa</span>
          </div>
          <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.7, margin: '0 0 12px' }}>
            Tanzania's #1 trusted marketplace. Buy, sell and pay securely anywhere.
          </p>
          <div style={{ fontSize: 11, color: '#475569' }}>🇹🇿 Made in Tanzania</div>
        </div>

        {/* Marketplace */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#fff', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Marketplace</div>
          {[
            { label: 'Browse Stores', page: 'Stores' },
            { label: 'Classifieds', page: 'ClassifiedsPublic' },
            { label: 'All Listings', page: 'Listings' },
            { label: 'Pay Invoice', page: 'PayInvoice' },
            { label: 'Track Parcel', page: 'TrackParcel' },
          ].map(l => (
            <div key={l.page} onClick={() => onNavigate(l.page)}
              style={{ fontSize: 13, color: '#64748b', marginBottom: 8, cursor: 'pointer', transition: 'color 0.2s' }}
              onMouseEnter={e => e.target.style.color = '#fff'}
              onMouseLeave={e => e.target.style.color = '#64748b'}>
              {l.label}
            </div>
          ))}
        </div>

        {/* Sellers & Agents */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#fff', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Sell & Earn</div>
          {[
            { label: 'Become a Seller', page: 'BecomeSeller' },
            { label: 'Become an Agent', page: 'BecomeAgent' },
            { label: 'Become Super Agent', page: 'BecomeSuperAgentInfo' },
            { label: 'Seller Dashboard', page: 'SellerDashboard' },
            { label: 'Agent Dashboard', page: 'AgentDashboard' },
          ].map(l => (
            <div key={l.page} onClick={() => onNavigate(l.page)}
              style={{ fontSize: 13, color: '#64748b', marginBottom: 8, cursor: 'pointer' }}
              onMouseEnter={e => e.target.style.color = '#fff'}
              onMouseLeave={e => e.target.style.color = '#64748b'}>
              {l.label}
            </div>
          ))}
        </div>

        {/* Company */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#fff', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Company</div>
          {[
            { label: 'About Us', page: 'AboutUs' },
            { label: 'How It Works', page: 'HowItWorks' },
            { label: 'Terms & Conditions', page: 'Terms' },
            { label: 'Privacy Policy', page: 'Privacy' },
            { label: 'Contact Us', page: 'ContactUs' },
          ].map(l => (
            <div key={l.page} onClick={() => onNavigate(l.page)}
              style={{ fontSize: 13, color: '#64748b', marginBottom: 8, cursor: 'pointer' }}
              onMouseEnter={e => e.target.style.color = '#fff'}
              onMouseLeave={e => e.target.style.color = '#64748b'}>
              {l.label}
            </div>
          ))}
        </div>

        {/* Contact */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#fff', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Contact</div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>📧 support@kentexa.com</div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>🌐 kentexa.com</div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>🏢 Bishoo Intelligence Systems</div>
          {/* Social */}
          <div style={{ display: 'flex', gap: 10 }}>
            <a href="https://wa.me/255788075633" target="_blank" rel="noreferrer"
              style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, textDecoration: 'none' }}>💬</a>
            <a href="mailto:support@kentexa.com"
              style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, textDecoration: 'none' }}>📧</a>
          </div>
        </div>
      </div>

      {/* Payment badges */}
      <div style={{ borderTop: '1px solid #1e293b', padding: '16px', textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: '#475569', marginBottom: 10 }}>Accepted Payments</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
          {['📱 M-Pesa', '📱 Airtel', '📱 Tigo', '📱 HaloPesa', '🤝 Agent'].map(p => (
            <span key={p} style={{ fontSize: 11, backgroundColor: '#1e293b', color: '#94a3b8', padding: '4px 10px', borderRadius: 6, fontWeight: 600 }}>{p}</span>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ borderTop: '1px solid #1e293b', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 12, color: '#475569' }}>
          © 2026 KenteXa · Bishoo Intelligence Systems (BiS) · All rights reserved
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <span onClick={() => onNavigate('Terms')} style={{ fontSize: 12, color: '#475569', cursor: 'pointer' }}>Terms</span>
          <span onClick={() => onNavigate('Privacy')} style={{ fontSize: 12, color: '#475569', cursor: 'pointer' }}>Privacy</span>
          <span onClick={() => onNavigate('AboutUs')} style={{ fontSize: 12, color: '#475569', cursor: 'pointer' }}>About</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;