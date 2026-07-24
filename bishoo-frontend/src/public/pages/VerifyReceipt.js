import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import api from '../../api/api';

const VerifyReceipt = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const [receiptNumber, setReceiptNumber] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const handleVerify = async () => {
    if (!receiptNumber.trim()) {
      setError('Please enter a receipt number');
      return;
    }
    try {
      setLoading(true);
      setError('');
      setResult(null);
      setSearched(true);
      const res = await api.get(`/invoices/verify/${receiptNumber.trim()}`);
      setResult(res.data);
    } catch (err) {
      setError('Failed to verify receipt. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') handleVerify();
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
      <Navbar
        currentPage="VerifyReceipt"
        onNavigate={onNavigate}
        isLoggedIn={isLoggedIn}
        onLogout={onLogout}
        userRole={userRole}
      />

      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 50%, #667eea 100%)',
        padding: '60px 32px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: '-60px', left: '-60px', width: '200px', height: '200px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.08)' }} />
        <div style={{ position: 'absolute', bottom: '-80px', right: '-40px', width: '280px', height: '280px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.06)' }} />

        <div style={{ position: 'relative' }}>
          <div style={{
            width: '72px', height: '72px',
            backgroundColor: 'rgba(255,255,255,0.2)',
            borderRadius: '20px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '36px', margin: '0 auto 20px',
            border: '2px solid rgba(255,255,255,0.3)',
          }}>
            🔍
          </div>
          <h1 style={{ fontSize: '40px', fontWeight: '900', color: '#fff', margin: '0 0 12px' }}>
            Verify Receipt
          </h1>
          <p style={{ fontSize: '17px', color: 'rgba(255,255,255,0.9)', marginBottom: '36px', maxWidth: '500px', margin: '0 auto 36px' }}>
            Verify the authenticity of your Kentexa payment receipt instantly
          </p>

          {/* Search Box */}
          <div style={{ maxWidth: '560px', margin: '0 auto', display: 'flex', gap: '12px' }}>
            <input
              type="text"
              placeholder="Enter receipt number e.g. KNT-RCP-2026-00001"
              value={receiptNumber}
              onChange={e => setReceiptNumber(e.target.value.toUpperCase())}
              onKeyPress={handleKeyPress}
              style={{
                flex: 1, padding: '16px 20px',
                borderRadius: '12px', border: 'none',
                fontSize: '15px', outline: 'none',
                boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                letterSpacing: '1px',
              }}
            />
            <button
              onClick={handleVerify}
              disabled={loading}
              style={{
                backgroundColor: '#fff',
                color: '#16a34a',
                border: 'none', padding: '16px 28px',
                borderRadius: '12px', cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '15px', fontWeight: '800',
                boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                whiteSpace: 'nowrap',
              }}
            >
              {loading ? '⏳' : '✅ Verify'}
            </button>
          </div>

          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginTop: '12px' }}>
            Format: KNT-RCP-YYYY-XXXXX
          </p>
        </div>
      </div>

      <div style={{ padding: '40px 32px', maxWidth: '800px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '14px 16px', borderRadius: '10px', marginBottom: '24px', fontSize: '14px', fontWeight: '600' }}>
            ❌ {error}
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: '48px', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
            <p style={{ color: '#64748b', fontSize: '15px' }}>Verifying receipt...</p>
          </div>
        )}

        {!loading && result && result.valid && (
          <div>
            <div style={{
              background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
              borderRadius: '16px', padding: '28px',
              textAlign: 'center', marginBottom: '24px',
              boxShadow: '0 8px 24px rgba(67,233,123,0.3)',
            }}>
              <div style={{ fontSize: '56px', marginBottom: '12px' }}>✅</div>
              <h2 style={{ fontSize: '26px', fontWeight: '900', color: '#fff', margin: '0 0 8px' }}>
                Receipt Verified!
              </h2>
              <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.9)', margin: 0 }}>
                This is an authentic Kentexa payment receipt
              </p>
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '32px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', paddingBottom: '24px', borderBottom: '2px dashed #e2e8f0' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '22px' }}>⚡</span>
                    <span style={{ fontSize: '20px', fontWeight: '900', color: '#7c3aed', letterSpacing: '1px' }}>KENTEXA</span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>Marketplace Tanzania</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>Receipt Number</div>
                  <div style={{ fontSize: '16px', fontWeight: '900', color: '#7c3aed', letterSpacing: '1px' }}>
                    {result.receiptNumber}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                {[
                  { label: 'Invoice Number', value: result.invoiceNumber, icon: '📄' },
                  { label: 'Order ID', value: `#${result.orderId}`, icon: '🛒' },
                  { label: 'Payment Method', value: result.paymentMethod || 'N/A', icon: '💳' },
                  { label: 'Paid On', value: result.paidAt ? new Date(result.paidAt).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A', icon: '📅' },
                ].map(item => (
                  <div key={item.label} style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', marginBottom: '6px' }}>
                      {item.icon} {item.label}
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '14px', padding: '20px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', marginBottom: '4px' }}>Amount Paid</div>
                  <div style={{ fontSize: '32px', fontWeight: '900', color: '#fff' }}>
                    TZS {Number(result.amount).toLocaleString()}
                  </div>
                </div>
                <div style={{
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  borderRadius: '12px', padding: '12px 20px',
                  color: '#fff', fontSize: '14px', fontWeight: '800',
                  border: '2px solid rgba(255,255,255,0.3)',
                }}>
                  ✅ PAID
                </div>
              </div>
            </div>

            <div style={{
              backgroundColor: '#fff', borderRadius: '16px', padding: '20px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
              display: 'flex', alignItems: 'center', gap: '16px',
            }}>
              <div style={{
                width: '52px', height: '52px', flexShrink: 0,
                background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
                borderRadius: '14px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '24px',
              }}>
                🛡️
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: '#1e293b', marginBottom: '4px' }}>
                  Verified by Kentexa Payment System
                </div>
                <div style={{ fontSize: '13px', color: '#64748b' }}>
                  This receipt is authentic and recorded in the Kentexa system. Keep it safe for your records.
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <a
                href={`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/invoices/receipt/${result.receiptNumber}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: '#fff', textDecoration: 'none',
                  padding: '14px 32px', borderRadius: '12px',
                  fontSize: '15px', fontWeight: '800',
                  boxShadow: '0 4px 16px rgba(102,126,234,0.4)',
                }}
              >
                📄 Download Receipt PDF
              </a>
            </div>
          </div>
        )}

        {!loading && searched && result && !result.valid && (
          <div style={{
            backgroundColor: '#fff', borderRadius: '16px', padding: '48px',
            textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          }}>
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>❌</div>
            <h2 style={{ fontSize: '22px', fontWeight: '900', color: '#dc2626', marginBottom: '8px' }}>
              Receipt Not Valid
            </h2>
            <p style={{ color: '#64748b', fontSize: '15px', marginBottom: '24px' }}>
              {result.message || 'This receipt number was not found or is not valid.'}
            </p>
            <div style={{ backgroundColor: '#fef2f2', borderRadius: '12px', padding: '16px', marginBottom: '24px', fontSize: '14px', color: '#991b1b' }}>
              ⚠️ If you believe this is an error, please contact Kentexa support with your order details.
            </div>
            <button
              onClick={() => { setReceiptNumber(''); setResult(null); setSearched(false); }}
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: '#fff', border: 'none', padding: '12px 28px',
                borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '700',
              }}
            >
              🔍 Try Again
            </button>
          </div>
        )}

        {!searched && !loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
            {[
              { icon: '🔒', title: 'Secure Verification', desc: 'Every receipt is cryptographically linked to its transaction in our secure system.', color: '#667eea' },
              { icon: '⚡', title: 'Instant Results', desc: 'Get verification results in seconds. No login required.', color: '#f7971e' },
              { icon: '📄', title: 'Download PDF', desc: 'Download an official PDF copy of your verified receipt anytime.', color: '#43e97b' },
              { icon: '🛡️', title: 'Fraud Prevention', desc: 'Protect yourself from fake receipts by always verifying on Kentexa.', color: '#f093fb' },
            ].map(card => (
              <div key={card.title} style={{
                backgroundColor: '#fff', borderRadius: '14px', padding: '24px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                borderTop: `4px solid ${card.color}`,
              }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>{card.icon}</div>
                <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#1e293b', margin: '0 0 8px' }}>{card.title}</h3>
                <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: '1.6' }}>{card.desc}</p>
              </div>
            ))}
          </div>
        )}

        {!searched && (
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginTop: '24px' }}>
            <h3 style={{ fontSize: '17px', fontWeight: '800', color: '#1e293b', margin: '0 0 20px' }}>
              📋 Where to find your receipt number?
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {[
                { step: '1', title: 'From SMS', desc: 'After payment, you receive an SMS with your receipt number starting with KNT-RCP-' },
                { step: '2', title: 'From My Orders', desc: 'Go to My Orders → Select your order → Find the receipt number in order details' },
                { step: '3', title: 'From PDF Receipt', desc: 'Open your downloaded PDF receipt and find the receipt number at the top' },
                { step: '4', title: 'From Email', desc: 'Check your email for the Kentexa payment confirmation email' },
              ].map(item => (
                <div key={item.step} style={{ display: 'flex', gap: '14px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
                  <div style={{
                    width: '36px', height: '36px', flexShrink: 0,
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    borderRadius: '10px', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '16px', fontWeight: '900', color: '#fff',
                  }}>
                    {item.step}
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>{item.title}</div>
                    <div style={{ fontSize: '13px', color: '#64748b', lineHeight: '1.5' }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {searched && result && (
          <div style={{ textAlign: 'center', marginTop: '24px' }}>
            <button
              onClick={() => { setReceiptNumber(''); setResult(null); setSearched(false); setError(''); }}
              style={{
                backgroundColor: '#f1f5f9', color: '#64748b',
                border: 'none', padding: '12px 28px', borderRadius: '10px',
                cursor: 'pointer', fontSize: '14px', fontWeight: '700',
              }}
            >
              🔍 Verify Another Receipt
            </button>
          </div>
        )}

      </div>

      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default VerifyReceipt;