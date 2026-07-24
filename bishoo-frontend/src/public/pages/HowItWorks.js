import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const HowItWorks = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const [activeRole, setActiveRole] = useState('buyer');

  const roles = {
    buyer: {
      icon: '🛒', label: 'Buyer', color: '#1d4ed8',
      steps: [
        { icon: '🔍', title: 'Browse & Discover', desc: 'Search products from verified stores or browse classified ads across Tanzania. Filter by category, location or price.' },
        { icon: '🛒', title: 'Add to Cart', desc: 'Add products to your cart. All prices include delivery — no hidden charges. You see exactly what you pay.' },
        { icon: '📍', title: 'Enter Delivery Details', desc: 'Enter your delivery address and phone number. You can also order as a gift for someone else.' },
        { icon: '💳', title: 'Pay Securely', desc: 'Pay via M-Pesa, Airtel Money, Tigo Pesa or visit a KenteXa Agent near you to pay cash with your invoice number.' },
        { icon: '📦', title: 'Track Your Parcel', desc: 'Your parcel gets a tracking number (e.g. KTX-DAR-MZA-000001). Track it in real-time from pickup to your door.' },
        { icon: '✅', title: 'Confirm & Release Payment', desc: 'When you receive your order, confirm it. Payment is then released to the seller. If there\'s a problem, raise a dispute within 7 days.' },
      ],
    },
    seller: {
      icon: '🏪', label: 'Seller', color: '#16a34a',
      steps: [
        { icon: '📝', title: 'Apply for a Store', desc: 'Register on KenteXa and apply to become a seller. Your store is reviewed and approved within 24 hours.' },
        { icon: '📦', title: 'List Your Products', desc: 'Add products with photos, descriptions, specs and features. Set your price — delivery fee is included automatically.' },
        { icon: '🔔', title: 'Receive Orders', desc: 'Get notified when a buyer places an order. Review the order details including delivery address and quantity.' },
        { icon: '🚚', title: 'Ship via Agent or Direct', desc: 'Hand your parcel to a KenteXa Super Agent (they scan and track it) or ship directly with your own courier.' },
        { icon: '🧾', title: 'Create Invoices', desc: 'For classified ads, create invoices for buyers so they can pay online or via agent. Track all your invoices in one place.' },
        { icon: '💰', title: 'Receive Payment', desc: 'Once the buyer confirms receipt, your payment (minus KenteXa\'s small commission) is released to your account.' },
      ],
    },
    agent: {
      icon: '🤝', label: 'Agent', color: '#7c3aed',
      steps: [
        { icon: '📋', title: 'Apply to Become an Agent', desc: 'Register and apply to become a KenteXa payment agent. Get approved with your NIDA ID and location details.' },
        { icon: '🏪', title: 'Set Up Your Point', desc: 'Your location is listed on KenteXa. Buyers near you can find you to pay cash for their orders.' },
        { icon: '🔍', title: 'Look Up Invoices', desc: 'Buyers bring their invoice number. Enter it in your Agent Dashboard to see the order details and amount due.' },
        { icon: '💵', title: 'Collect Cash', desc: 'Collect cash from the buyer and process the payment via M-Pesa or your registered mobile money account.' },
        { icon: '✅', title: 'Confirm Payment', desc: 'Confirm the payment in your dashboard. The buyer gets a receipt and the seller is notified.' },
        { icon: '💰', title: 'Earn Commission', desc: 'Earn 2.5%-5% commission on every payment you process. Track your earnings in real-time on your dashboard.' },
      ],
    },
    super_agent: {
      icon: '🏢', label: 'Super Agent', color: '#ea580c',
      steps: [
        { icon: '📋', title: 'Apply as Super Agent', desc: 'Super Agents are logistics hubs that receive and dispatch parcels in their city. Apply with your business details.' },
        { icon: '📦', title: 'Receive Parcels', desc: 'Sellers hand parcels to your hub. Scan each order ID to generate a tracking number (KTX-XXX-YYY-000001) automatically.' },
        { icon: '🔍', title: 'Verify & Weigh', desc: 'Verify the parcel contents match the order. Weigh it — if the actual shipping fee differs significantly from the estimate, the system handles the adjustment.' },
        { icon: '🚚', title: 'Dispatch', desc: 'Send the parcel to the destination city. Update the status at each step — dispatched, in transit, arrived at destination hub.' },
        { icon: '🛵', title: 'Last Mile Delivery', desc: 'Assign to a local delivery agent who delivers to the buyer\'s door and marks it delivered.' },
        { icon: '💰', title: 'Earn Shipping Revenue', desc: 'Earn from the shipping fees collected. Transparent earnings tracked in your Super Agent dashboard.' },
      ],
    },
  };

  const current = roles[activeRole];

  const fees = [
    { category: 'Electronics', fee: '10%', note: 'On product price only' },
    { category: 'Fashion', fee: '12%', note: 'On product price only' },
    { category: 'Vehicles', fee: '5%', note: 'On product price only' },
    { category: 'Agriculture', fee: '8%', note: 'On product price only' },
    { category: 'Security', fee: '8%', note: 'On product price only' },
    { category: 'All Others', fee: '10%', note: 'On product price only' },
    { category: 'Property & Services', fee: '0%', note: 'Free — contact seller directly' },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <Navbar currentPage="HowItWorks" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />

      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg,#1e1b4b,#1d4ed8)', padding: '48px 16px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: '#fff', margin: '0 0 12px', fontFamily: 'Manrope,sans-serif' }}>How KenteXa Works</h1>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.8)', maxWidth: 500, margin: '0 auto' }}>
          KenteXa connects buyers, sellers, payment agents and delivery agents in one trusted ecosystem.
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
            {current.icon} For {current.label}s
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
                    Step {i + 1}: {step.title}
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7 }}>{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Methods */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '24px 20px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1e293b', margin: '0 0 16px', fontFamily: 'Manrope,sans-serif' }}>💳 Payment Methods</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
            {[
              { icon: '📱', name: 'M-Pesa', desc: 'Vodacom Tanzania' },
              { icon: '📱', name: 'Airtel Money', desc: 'Airtel Tanzania' },
              { icon: '📱', name: 'Tigo Pesa', desc: 'Tigo Tanzania' },
              { icon: '📱', name: 'HaloPesa', desc: 'Halotel Tanzania' },
              { icon: '🤝', name: 'KenteXa Agent', desc: 'Pay cash nearby' },
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
          <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1e293b', margin: '0 0 6px', fontFamily: 'Manrope,sans-serif' }}>💰 Seller Commission Fees</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>Commission is only charged on the product price — delivery fees go fully to the seller.</p>
          <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', backgroundColor: '#0f172a', padding: '10px 14px' }}>
              <div style={{ flex: 1, fontSize: 12, fontWeight: 800, color: '#fff' }}>Category</div>
              <div style={{ width: 60, fontSize: 12, fontWeight: 800, color: '#fff', textAlign: 'center' }}>Fee</div>
              <div style={{ flex: 1, fontSize: 12, fontWeight: 800, color: '#fff', textAlign: 'right' }}>Note</div>
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
          <h2 style={{ fontSize: 18, fontWeight: 900, color: '#15803d', margin: '0 0 14px', fontFamily: 'Manrope,sans-serif' }}>🛡️ KenteXa Buyer Protection</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              'Your payment is held in escrow — the seller only gets paid after you confirm receipt',
              'Raise a dispute within 7 days if you receive a wrong or damaged item',
              'Full refund if your order is never delivered',
              'Verified sellers only — all stores are reviewed before approval',
              'Real-time tracking so you always know where your parcel is',
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
          <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1e293b', margin: '0 0 8px', fontFamily: 'Manrope,sans-serif' }}>Ready to Get Started?</h2>
          <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 20px' }}>Join thousands of Tanzanians already buying and selling on KenteXa.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => onNavigate('Register')}
              style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: '13px 24px', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 800, fontFamily: 'Manrope,sans-serif' }}>
              🚀 Create Free Account
            </button>
            <button onClick={() => onNavigate('Stores')}
              style={{ backgroundColor: '#f8fafc', color: '#1d4ed8', border: '2px solid #1d4ed8', padding: '13px 24px', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
              🏪 Browse Store
            </button>
          </div>
        </div>
      </div>

      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default HowItWorks;