import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const PrivacyPolicy = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const [openSection, setOpenSection] = useState(null);

  const sections = [
    {
      title: '1. Information We Collect',
      content: `We collect the following information when you use KenteXa:

Personal Information:
- Full name, email address, phone number
- Delivery address and location
- National ID number (for agents and super agents only)

Transaction Information:
- Orders placed, products purchased, payment amounts
- Invoice numbers and transaction references
- Parcel tracking history

Technical Information:
- Device type, browser, IP address
- Pages visited, time spent on platform
- Search queries and browsing history on KenteXa`,
    },
    {
      title: '2. How We Use Your Information',
      content: `We use your information to:
- Process orders and facilitate transactions between buyers and sellers
- Send OTP verification codes and account notifications
- Generate invoices, receipts and tracking numbers
- Show you relevant products and listings
- Prevent fraud and ensure platform security
- Communicate important platform updates
- Improve our services through analytics`,
    },
    {
      title: '3. Information Sharing',
      content: `We share your information only when necessary:

With Sellers: Your delivery address, name and phone number are shared with sellers to fulfill your order.

With Payment Processors: Your phone number is shared with M-Pesa, Airtel, Tigo or other payment providers to process payments.

With Delivery Agents: Your delivery address, name and phone are shared with Super Agents and local agents to deliver your parcel.

With Authorities: We may share information with law enforcement if required by Tanzanian law.

We do NOT sell your personal data to third parties for marketing purposes.`,
    },
    {
      title: '4. Data Security',
      content: `We protect your data using:
- Encrypted database storage
- Secure HTTPS connections for all data transmission
- JWT token-based authentication
- Password hashing (bcrypt) — we never store plain passwords
- Regular security audits

No system is 100% secure. In the event of a data breach, we will notify affected users within 72 hours.`,
    },
    {
      title: '5. Cookies & Tracking',
      content: `KenteXa uses:
- Local storage to keep you logged in between sessions
- Session data to maintain your cart
- Basic analytics to understand how users navigate the platform

We do not use third-party advertising trackers or sell browsing data to advertisers.`,
    },
    {
      title: '6. Your Rights',
      content: `You have the right to:
- Access your personal data at any time via your Profile page
- Update or correct your information
- Request deletion of your account and data
- Withdraw consent for marketing communications

To exercise these rights, contact us at support@kentexa.com`,
    },
    {
      title: '7. Data Retention',
      content: `We retain your data for as long as your account is active. After account deletion:
- Transaction records are kept for 7 years (legal requirement)
- Personal profile data is deleted within 30 days
- Parcel tracking records are kept for 2 years`,
    },
    {
      title: '8. Children\'s Privacy',
      content: `KenteXa is not intended for users under 18 years of age. We do not knowingly collect personal information from minors. If we discover a minor has created an account, we will delete it immediately.`,
    },
    {
      title: '9. Changes to This Policy',
      content: `We may update this Privacy Policy from time to time. We will notify you of significant changes via email or platform notification. Your continued use of KenteXa after changes constitutes acceptance.`,
    },
    {
      title: '10. Contact Us',
      content: `For privacy-related questions or to exercise your data rights:

📧 Email: support@kentexa.com
🌐 Website: kentexa.com
🏢 Company: Bishoo Intelligence Systems (BiS), Tanzania`,
    },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <Navbar currentPage="Privacy" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />

      <div style={{ background: 'linear-gradient(135deg,#0f172a,#1e1b4b)', padding: '40px 16px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: '#fff', margin: '0 0 10px', fontFamily: 'Manrope,sans-serif' }}>Privacy Policy</h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: 0 }}>Last updated: June 2026 · We respect your privacy</p>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', width: '100%', padding: '20px 16px 40px' }}>
        <div style={{ backgroundColor: '#dcfce7', borderRadius: 12, padding: '14px 16px', marginBottom: 20, border: '1px solid #86efac' }}>
          <p style={{ fontSize: 13, color: '#15803d', margin: 0, lineHeight: 1.6 }}>
            🔒 Your privacy matters to us. KenteXa does not sell your personal data. We collect only what is necessary to operate the marketplace safely.
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

      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default PrivacyPolicy;