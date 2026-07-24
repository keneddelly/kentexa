import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const TermsAndConditions = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const [openSection, setOpenSection] = useState(null);

  const sections = [
    {
      title: '1. Acceptance of Terms',
      content: `By accessing or using KenteXa ("the Platform"), you agree to be bound by these Terms and Conditions. If you do not agree, please do not use the platform.

These terms apply to all users including buyers, sellers, payment agents, super agents and visitors.`,
    },
    {
      title: '2. Eligibility',
      content: `You must be at least 18 years old to use KenteXa. By registering, you confirm that:
- You are legally capable of entering into binding contracts
- You will provide accurate and truthful information
- You are a resident of Tanzania or conducting business in Tanzania`,
    },
    {
      title: '3. User Accounts',
      content: `You are responsible for maintaining the confidentiality of your account credentials. You agree to:
- Provide accurate registration information
- Notify us immediately of any unauthorized account access
- Not share your account with others
- Not create multiple accounts for fraudulent purposes

KenteXa reserves the right to suspend or terminate accounts that violate these terms.`,
    },
    {
      title: '4. Buyer Responsibilities',
      content: `As a buyer on KenteXa, you agree to:
- Pay for orders you place using valid payment methods
- Provide accurate delivery addresses and contact information
- Confirm receipt of goods honestly — false confirmation to fraudulently release escrow funds is prohibited
- Raise disputes within 7 days of delivery if there is a genuine issue
- Not attempt to reverse payments after confirming receipt`,
    },
    {
      title: '5. Seller Responsibilities',
      content: `As a seller on KenteXa, you agree to:
- List only genuine products with accurate descriptions and photos
- Not sell counterfeit, illegal, prohibited or dangerous goods
- Fulfill orders within the stated timeframe
- Ship products in good condition matching the listing
- Respond to buyer disputes honestly and promptly
- Accept KenteXa's commission deduction from each sale

KenteXa reserves the right to remove any listing that violates these terms.`,
    },
    {
      title: '6. Prohibited Items',
      content: `The following items are strictly prohibited on KenteXa:
- Counterfeit or replica goods
- Illegal weapons, drugs or controlled substances
- Stolen goods
- Adult content or pornographic material
- Products that infringe intellectual property rights
- Goods prohibited by Tanzanian law

Violation will result in immediate account termination and may be reported to relevant authorities.`,
    },
    {
      title: '7. Payments & Escrow',
      content: `KenteXa uses an escrow system to protect both buyers and sellers:
- Buyer's payment is held securely by KenteXa
- Payment is released to the seller only after the buyer confirms receipt
- If no confirmation is made within 14 days of delivery, funds are auto-released to the seller
- Disputes freeze the escrow until resolved by KenteXa's team

KenteXa is not a bank and does not hold funds beyond the transaction period.`,
    },
    {
      title: '8. Commission & Fees',
      content: `KenteXa charges sellers a commission on each completed sale:
- Commission rates range from 5% to 12% depending on product category
- Commission is applied to the product base price only — not the delivery fee
- Delivery fees are paid in full to the seller/super agent
- Agent commission is 2.5%-5% on each payment processed
- There are no listing fees — you only pay when you sell`,
    },
    {
      title: '9. Delivery & Shipping',
      content: `KenteXa operates a Super Agent delivery network across Tanzania:
- Sellers are responsible for handing parcels to a Super Agent hub
- Super Agents generate tracking numbers and dispatch parcels
- KenteXa is not liable for delays caused by force majeure, weather or third-party couriers
- Buyers should inspect parcels before confirming receipt
- Lost or damaged parcels must be reported within 48 hours of the expected delivery date`,
    },
    {
      title: '10. Disputes & Refunds',
      content: `If you have a dispute:
- Raise a dispute within 7 days of delivery via the Order page
- Provide clear evidence (photos, descriptions) of the issue
- KenteXa's team will review the dispute within 3-5 business days
- Decisions are final and binding on both parties
- Refunds are processed within 7 business days of a dispute resolution in the buyer's favour`,
    },
    {
      title: '11. Privacy & Data',
      content: `KenteXa collects personal data including name, phone number, email and location for the purpose of facilitating transactions. We:
- Do not sell your personal data to third parties
- Use data only for platform operations, order fulfillment and communication
- Store data securely in compliance with applicable Tanzanian laws
- May share data with payment processors and delivery agents as required

For full details, see our Privacy Policy.`,
    },
    {
      title: '12. Limitation of Liability',
      content: `KenteXa is a marketplace platform and is not the buyer or seller in any transaction. We are not liable for:
- The quality, safety or legality of listed items
- Losses arising from buyer-seller disputes
- Payment failures caused by mobile network issues
- Delays in delivery by third-party couriers

Our maximum liability in any case is limited to the transaction value of the disputed order.`,
    },
    {
      title: '13. Changes to Terms',
      content: `KenteXa may update these terms at any time. We will notify users of significant changes via email or platform notification. Continued use of the platform after changes constitutes acceptance of the new terms.`,
    },
    {
      title: '14. Governing Law',
      content: `These terms are governed by the laws of the United Republic of Tanzania. Any disputes arising from these terms shall be subject to the jurisdiction of Tanzanian courts.`,
    },
    {
      title: '15. Contact Us',
      content: `For questions about these terms, contact us at:
📧 support@kentexa.com
🌐 kentexa.com
🏢 Bishoo Intelligence Systems (BiS), Tanzania`,
    },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <Navbar currentPage="Terms" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />

      <div style={{ background: 'linear-gradient(135deg,#0f172a,#1e1b4b)', padding: '40px 16px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: '#fff', margin: '0 0 10px', fontFamily: 'Manrope,sans-serif' }}>Terms & Conditions</h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: 0 }}>Last updated: June 2026 · Effective immediately</p>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', width: '100%', padding: '20px 16px 40px' }}>
        <div style={{ backgroundColor: '#eff6ff', borderRadius: 12, padding: '14px 16px', marginBottom: 20, border: '1px solid #bfdbfe' }}>
          <p style={{ fontSize: 13, color: '#1d4ed8', margin: 0, lineHeight: 1.6 }}>
            📋 Please read these terms carefully before using KenteXa. By creating an account or placing an order, you agree to these terms.
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

export default TermsAndConditions;