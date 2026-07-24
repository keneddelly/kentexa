/**
 * BecomeSellerInfo.js
 * Shown to logged-in buyers who tap "Tuma Kifurushi"
 * Explains benefits of selling on KenteXa and guides them to apply
 *
 * Place at: src/public/pages/BecomeSellerInfo.js
 */
import React from 'react';
import BackBar from '../components/BackBar';

const BENEFITS = [
  { icon: '📦', title: 'Tuma Bidhaa Popote Tanzania',   desc: 'Unafilisi bidhaa kwa usalama — kutoka Dar hadi Mwanza, Songea, Tunduma.' },
  { icon: '📍', title: 'Ufuatiliaji wa Wakati Halisi',  desc: 'Mnunuzi anajua kifurushi kiko wapi wakati wote. Kupunguza maswali na wasiwasi.' },
  { icon: '💬', title: 'WhatsApp Otomatiki',            desc: 'KenteXa inatuma SMS na WhatsApp kwa mnunuzi bila kufanya chochote wewe.' },
  { icon: '💰', title: 'Malipo Salama',                 desc: 'Pesa zinashikiliwa salama hadi mnunuzi athibitishe kupokea bidhaa.' },
  { icon: '🤝', title: 'Wakala wa KenteXa Karibu Nawe', desc: 'Super Agents wako katika miji mingi — wanaomba malipo na kupeleka bidhaa.' },
  { icon: '📊', title: 'Dashboard ya Mauzo',            desc: 'Ona mapato, maagizo, na hali ya vifurushi vyote mahali pamoja.' },
];

const BecomeSellerInfo = ({ onNavigate }) => {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <BackBar title="Kuwa Muuzaji" onBack={() => onNavigate('back')} />

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 16px 40px' }}>

        {/* Hero */}
        <div style={{ background: 'linear-gradient(135deg,#1d4ed8,#7c3aed)',
          borderRadius: 20, padding: 28, marginBottom: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏪</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 8 }}>
            Tuma Bidhaa kwa KenteXa
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6 }}>
            Jiunge na wauzaji wanaotumia KenteXa kupeleka bidhaa kwa usalama katika Tanzania nzima
          </div>
        </div>

        {/* Benefits */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', marginBottom: 16 }}>
            Kwa nini KenteXa? ✨
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {BENEFITS.map((b, i) => (
              <div key={i} style={{ backgroundColor: '#fff', borderRadius: 12, padding: '14px 16px',
                display: 'flex', gap: 14, alignItems: 'flex-start',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: 24, flexShrink: 0 }}>{b.icon}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 3 }}>
                    {b.title}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{b.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Fee info */}
        <div style={{ backgroundColor: '#eff6ff', borderRadius: 14, padding: 16, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1d4ed8', marginBottom: 6 }}>
            💡 Ada ya Kufuatilia
          </div>
          <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
            <span style={{ fontWeight: 700 }}>TZS 1,000</span> kwa kila kifurushi unachotuma — 
            namba ya kufuatilia, SMS kwa mnunuzi, na usalama wote umejumuishwa.
            Hakuna ada nyingine za siri.
          </div>
        </div>

        {/* Steps */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a', marginBottom: 14 }}>
            Jinsi ya Kuanza 🚀
          </div>
          {[
            { step: '1', text: 'Omba kuwa Muuzaji — chapisha fomu rahisi' },
            { step: '2', text: 'Tunathibitisha akaunti yako (kawaida saa 24)' },
            { step: '3', text: 'Anza kutuma bidhaa na kufuatilia wakati halisi' },
          ].map(s => (
            <div key={s.step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%',
                backgroundColor: '#1d4ed8', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 900, flexShrink: 0 }}>
                {s.step}
              </div>
              <div style={{ fontSize: 13, color: '#475569', paddingTop: 5, lineHeight: 1.5 }}>
                {s.text}
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button onClick={() => onNavigate('BecomeAgent')}
          style={{ width: '100%', background: 'linear-gradient(135deg,#1d4ed8,#7c3aed)',
            color: '#fff', border: 'none', padding: '16px 20px', borderRadius: 14,
            fontSize: 16, fontWeight: 900, cursor: 'pointer', marginBottom: 12 }}>
          🏪 Omba Kuwa Muuzaji
        </button>

        <button onClick={() => onNavigate('back')}
          style={{ width: '100%', backgroundColor: '#f1f5f9', color: '#64748b',
            border: 'none', padding: '12px 20px', borderRadius: 14,
            fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          Rudi Nyuma
        </button>

        {/* Already seller */}
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
            Tayari una akaunti ya muuzaji?
          </div>
          <button onClick={() => onNavigate('StoreSettings')}
            style={{ background: 'none', border: 'none', color: '#1d4ed8',
              fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Nenda Mipangilio ya Duka →
          </button>
        </div>

      </div>
    </div>
  );
};

export default BecomeSellerInfo;