import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import api from '../../api/api';

const BecomeSeller = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const [form, setForm] = useState({
    businessName: '',
    businessDescription: '',
    address: '',
    phone: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!form.businessName) {
      setError('Business name is required');
      return;
    }
    if (!isLoggedIn) {
      onNavigate('PublicLogin');
      return;
    }
    try {
      setLoading(true);
      await api.post('/seller/apply', form);
      setMessage('Application submitted! We will review and approve your account.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to submit application');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
      <Navbar currentPage="BecomeSeller" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />

      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
        padding: '60px 32px',
        textAlign: 'center',
      }}>
        <h1 style={{ fontSize: '42px', fontWeight: '900', color: '#fff', margin: '0 0 12px' }}>
          🏪 Become a Seller
        </h1>
        <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.85)', marginBottom: '0' }}>
          Join thousands of sellers on Kentexa Tanzania
        </p>
      </div>

      <div style={{ padding: '48px 32px', maxWidth: '1100px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* Benefits */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '48px' }}>
          {[
            { icon: '📦', title: 'List Products', desc: 'Add unlimited products to the Kentexa store', color: '#667eea' },
            { icon: '📋', title: 'Post Classifieds', desc: 'Reach buyers across Tanzania', color: '#f093fb' },
            { icon: '💰', title: 'Earn Revenue', desc: 'Get paid securely via mobile money', color: '#43e97b' },
            { icon: '📊', title: 'Track Sales', desc: 'Monitor orders and revenue in real-time', color: '#f7971e' },
          ].map(benefit => (
            <div key={benefit.title} style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '24px',
              textAlign: 'center',
              boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
              borderTop: `4px solid ${benefit.color}`,
            }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>{benefit.icon}</div>
              <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#1e293b', margin: '0 0 8px' }}>
                {benefit.title}
              </h3>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: '1.5' }}>
                {benefit.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Application Form */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>

          <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#1e293b', margin: '0 0 24px' }}>
              📝 Apply Now
            </h2>

            {message && (
              <div style={{ background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', color: '#fff', padding: '14px 16px', borderRadius: '10px', marginBottom: '20px', fontSize: '14px', fontWeight: '600' }}>
                ✅ {message}
              </div>
            )}
            {error && (
              <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>
                ❌ {error}
              </div>
            )}

            {[
              { label: 'Business Name *', key: 'businessName', placeholder: 'e.g. Dar Tech Solutions', type: 'text' },
              { label: 'Phone Number', key: 'phone', placeholder: '255XXXXXXXXX', type: 'text' },
              { label: 'Business Address', key: 'address', placeholder: 'e.g. Dar es Salaam, Kariakoo', type: 'text' },
            ].map(field => (
              <div key={field.key} style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '6px', fontWeight: '600' }}>
                  {field.label}
                </label>
                <input
                  type={field.type}
                  placeholder={field.placeholder}
                  value={form[field.key]}
                  onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                  style={{
                    width: '100%', padding: '12px',
                    borderRadius: '8px', border: '2px solid #e2e8f0',
                    fontSize: '14px', boxSizing: 'border-box',
                    outline: 'none',
                  }}
                  onFocus={e => e.target.style.border = '2px solid #a78bfa'}
                  onBlur={e => e.target.style.border = '2px solid #e2e8f0'}
                />
              </div>
            ))}

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '6px', fontWeight: '600' }}>
                Business Description
              </label>
              <textarea
                placeholder="Tell us about your business..."
                value={form.businessDescription}
                onChange={e => setForm({ ...form, businessDescription: e.target.value })}
                rows={4}
                style={{
                  width: '100%', padding: '12px',
                  borderRadius: '8px', border: '2px solid #e2e8f0',
                  fontSize: '14px', boxSizing: 'border-box',
                  resize: 'vertical', outline: 'none',
                }}
                onFocus={e => e.target.style.border = '2px solid #a78bfa'}
                onBlur={e => e.target.style.border = '2px solid #e2e8f0'}
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading}
              style={{
                width: '100%',
                background: loading ? '#a5b4fc' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: '#fff', border: 'none',
                padding: '14px', borderRadius: '10px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '15px', fontWeight: '800',
                boxShadow: '0 4px 12px rgba(102,126,234,0.4)',
              }}
            >
              {loading ? 'Submitting...' : '🚀 Submit Application'}
            </button>

            {!isLoggedIn && (
              <p style={{ textAlign: 'center', fontSize: '13px', color: '#64748b', marginTop: '16px' }}>
                You need to{' '}
                <span onClick={() => onNavigate('PublicLogin')} style={{ color: '#7c3aed', cursor: 'pointer', fontWeight: '700' }}>
                  login
                </span>
                {' '}first to apply
              </p>
            )}
          </div>

          {/* How it works */}
          <div>
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 16px rgba(0,0,0,0.06)', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1e293b', margin: '0 0 20px' }}>
                ⚡ How it Works
              </h3>
              {[
                { step: '1', title: 'Submit Application', desc: 'Fill in your business details and submit', color: '#667eea' },
                { step: '2', title: 'Admin Review', desc: 'Our team reviews your application within 24hrs', color: '#f093fb' },
                { step: '3', title: 'Get Approved', desc: 'Receive approval and access seller dashboard', color: '#43e97b' },
                { step: '4', title: 'Start Selling', desc: 'List products and start earning revenue', color: '#f7971e' },
              ].map(item => (
                <div key={item.step} style={{ display: 'flex', gap: '16px', marginBottom: '20px', alignItems: 'flex-start' }}>
                  <div style={{
                    width: '36px', height: '36px', flexShrink: 0,
                    borderRadius: '10px',
                    background: `linear-gradient(135deg, ${item.color}, ${item.color}99)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '16px', fontWeight: '800', color: '#fff',
                  }}>
                    {item.step}
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>{item.title}</div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Already a seller */}
            {isLoggedIn && (
              <div style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '16px', padding: '24px', color: '#fff',
              }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: '800' }}>
                  Already applied?
                </h4>
                <p style={{ margin: '0 0 16px', fontSize: '13px', opacity: 0.85 }}>
                  Check your application status and access your seller dashboard
                </p>
                <button
                  onClick={() => onNavigate('SellerDashboard')}
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    color: '#fff', border: '2px solid rgba(255,255,255,0.4)',
                    padding: '10px 20px', borderRadius: '8px',
                    cursor: 'pointer', fontSize: '13px', fontWeight: '700',
                  }}
                >
                  📊 Go to Seller Dashboard
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default BecomeSeller;