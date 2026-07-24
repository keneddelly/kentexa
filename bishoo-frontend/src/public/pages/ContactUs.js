import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import BackBar from '../components/BackBar';
import api from '../../api/api';

const FAQS = [
  {
    q: 'Je, KenteXa ni nini?',
    a: 'KenteXa ni soko la mtandaoni la Tanzania linalokuruhusu kununua na kuuza bidhaa kwa usalama. Tunatumia mfumo wa malipo salama (escrow) ambapo pesa zako zinabaki salama hadi uthibitishe kupokea bidhaa.',
  },
  {
    q: 'How do I become a seller on KenteXa?',
    a: 'Tap the ➕ button on the navbar and select "Open Your Store". Fill in your business details and you can start listing products immediately — no fees to apply.',
  },
  {
    q: 'Ni njia gani za malipo zinazokubalika?',
    a: 'Tunakubali M-Pesa, Airtel Money, Tigo Pesa, na malipo ya pesa taslimu kupitia mawakala wetu (KenteXa Agents) karibu nawe.',
  },
  {
    q: 'How long does delivery take?',
    a: 'Delivery time depends on the shipping method and distance. Via KenteXa Super Agent network, most deliveries within the same region take 1-3 days. Cross-region deliveries typically take 3-7 days.',
  },
  {
    q: 'Je, pesa zangu ziko salama nikinunua?',
    a: 'Ndiyo. Pesa zako zinabaki kwenye akaunti yetu ya escrow hadi uthibitishe umepokea bidhaa yako kwa hali nzuri. Muuzaji halipwi mpaka wewe uthibitishe.',
  },
  {
    q: 'How do I become a KenteXa Agent?',
    a: 'Tap the ➕ button and select "Become an Agent". You\'ll earn 2.5%-5% commission processing payments for customers near you.',
  },
  {
    q: 'Nikiwa na tatizo na agizo langu, nifanye nini?',
    a: 'Unaweza kupiga rufaa (raise a dispute) kwenye ukurasa wa "My Orders" ndani ya saa 24 baada ya kupokea bidhaa. Timu yetu itashughulikia ndani ya saa 24.',
  },
];

const ContactUs = ({ onNavigate, currentUser, isLoggedIn, onLogout, userRole }) => {
  const [form, setForm]       = useState({ name: '', email: '', phone: '', subject: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError]     = useState('');
  const [openFaq, setOpenFaq] = useState(null);

  const handleSubmit = async () => {
    if (!form.name.trim())    { setError('Please enter your name'); return; }
    if (!form.email.trim())   { setError('Please enter your email'); return; }
    if (!form.subject.trim()) { setError('Please enter a subject'); return; }
    if (!form.message.trim()) { setError('Please enter your message'); return; }

    try {
      setLoading(true); setError('');
      await api.post('/contact', form);
      setSuccess('✅ Message sent! We will get back to you within 24 hours.');
      setForm({ name: '', email: '', phone: '', subject: '', message: '' });
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to send message. Try again.');
    } finally { setLoading(false); }
  };

  const inputStyle = {
    width: '100%', padding: '12px 14px', borderRadius: 10,
    border: '2px solid #e2e8f0', fontSize: 14,
    boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <Navbar currentPage="ContactUs" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => onNavigate('Home')} title="Contact Us" />

      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg,#1e1b4b,#1d4ed8)', padding: '28px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>💬</div>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '0 0 6px', fontFamily: 'Manrope,sans-serif' }}>We're Here to Help</h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', margin: 0 }}>Tutapenda kusikia kutoka kwako</p>
      </div>

      {/* Quick contact options */}
      <div style={{ padding: '16px 16px 0', maxWidth: 700, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <a href="https://wa.me/255700000000" target="_blank" rel="noreferrer"
            style={{ backgroundColor: '#dcfce7', borderRadius: 14, padding: '16px 12px', textAlign: 'center', textDecoration: 'none', display: 'block' }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>💬</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#16a34a' }}>WhatsApp</div>
            <div style={{ fontSize: 11, color: '#166534', marginTop: 2 }}>Chat with us</div>
          </a>
          <a href="mailto:support@kentexa.com"
            style={{ backgroundColor: '#eff6ff', borderRadius: 14, padding: '16px 12px', textAlign: 'center', textDecoration: 'none', display: 'block' }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>📧</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1d4ed8' }}>Email</div>
            <div style={{ fontSize: 11, color: '#1e40af', marginTop: 2 }}>support@kentexa.com</div>
          </a>
        </div>
      </div>

      <div style={{ padding: '0 16px 32px', maxWidth: 700, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* Contact Form */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', margin: '0 0 16px' }}>📝 Send Us a Message</h2>

          {success && (
            <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '12px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
              <span>{success}</span>
              <button onClick={() => setSuccess('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontWeight: 'bold' }}>×</button>
            </div>
          )}
          {error && (
            <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
              <span>❌ {error}</span>
              <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 'bold' }}>×</button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 5, fontWeight: 600 }}>Full Name *</label>
                <input type="text" placeholder="John Msomi" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 5, fontWeight: 600 }}>Phone (optional)</label>
                <input type="tel" placeholder="255712345678" value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 5, fontWeight: 600 }}>Email Address *</label>
              <input type="email" placeholder="you@example.com" value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 5, fontWeight: 600 }}>Subject *</label>
              <input type="text" placeholder="e.g. Order issue, Seller question..." value={form.subject}
                onChange={e => setForm({ ...form, subject: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 5, fontWeight: 600 }}>Message *</label>
              <textarea placeholder="Tell us how we can help..." value={form.message} rows={5}
                onChange={e => setForm({ ...form, message: e.target.value })}
                style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <button onClick={handleSubmit} disabled={loading}
              style={{ width: '100%', background: loading ? '#93c5fd' : 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 14, borderRadius: 12, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 800, boxShadow: '0 4px 14px rgba(29,78,216,0.3)' }}>
              {loading ? '⏳ Sending...' : '📤 Send Message'}
            </button>
          </div>
        </div>

        {/* FAQ Section */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', margin: '0 0 16px' }}>❓ Frequently Asked Questions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {FAQS.map((faq, i) => (
              <div key={i} style={{ border: '1px solid #f1f5f9', borderRadius: 12, overflow: 'hidden' }}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', backgroundColor: openFaq === i ? '#eff6ff' : '#f8fafc', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', paddingRight: 10 }}>{faq.q}</span>
                  <span style={{ fontSize: 16, color: '#1d4ed8', flexShrink: 0, transform: openFaq === i ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
                </button>
                {openFaq === i && (
                  <div style={{ padding: '14px 16px', fontSize: 13, color: '#475569', lineHeight: 1.6, backgroundColor: '#fff' }}>
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default ContactUs;