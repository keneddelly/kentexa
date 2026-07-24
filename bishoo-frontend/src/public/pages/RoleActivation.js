/**
 * RoleActivation.js — Guided flow for users to activate new roles
 * Place at: src/public/pages/RoleActivation.js
 *
 * Every user starts as Buyer. This page guides them to activate:
 * Seller, Agent, Super Agent, or Transport Provider.
 */
import React, { useState } from 'react';
import Navbar   from '../components/Navbar';
import BackBar  from '../components/BackBar';
import Footer   from '../components/Footer';

const B = '#2563EB';

const ROLES = [
  {
    key:      'seller',
    icon:     '🏪',
    title:    'Muuzaji',
    tagline:  'Uza bidhaa au huduma',
    desc:     'Fungua duka lako, uze bidhaa, simamia maagizo, na kupata malipo kupitia KenteXa.',
    perks:    ['Duka lako la mtandaoni', 'Maagizo na malipo', 'Uchambuzi wa mauzo', 'Timu ya wafanyakazi'],
    needs:    ['Simu iliyothibitishwa', 'Jina la biashara', 'Aina ya bidhaa'],
    page:     'BecomeSellerInfo',
    color:    '#EFF6FF', accent: B,
  },
  {
    key:      'agent',
    icon:     '🏍️',
    title:    'Agent wa Utoaji',
    tagline:  'Toa vifurushi na pata pesa',
    desc:     'Kuwa sehemu ya mtandao wa mawakala wa KenteXa. Kazi zinakuletea moja kwa moja.',
    perks:    ['Kazi karibu nawe', 'Pata malipo haraka', 'Kadi ya ufanikishaji', 'Ukanda unaokua'],
    needs:    ['Simu iliyothibitishwa', 'Nambari ya usajili', 'Aina ya usafiri (boda/gari)'],
    page:     'BecomeAgent',
    color:    '#FDF2F8', accent: '#A21CAF',
  },
  {
    key:      'super_agent',
    icon:     '🏢',
    title:    'Super Agent (Hub)',
    tagline:  'Simamia kituo cha mji wako',
    desc:     'Dhibiti vifurushi, wasimamia mawakala wa ndani, na panga usafiri baina ya miji.',
    perks:    ['Kituo chako cha biashara', 'Tuma mara nyingi', 'Mapato makubwa', 'Msimamizi wa eneo'],
    needs:    ['Uzoefu wa logistics', 'Eneo la kituo', 'Uwezo wa kuendesha timu'],
    page:     'BecomeSuperAgent',
    color:    '#F5F3FF', accent: '#7C3AED',
  },
  {
    key:      'transport_provider',
    icon:     '🚌',
    title:    'Msafirishaji',
    tagline:  'Chapisha safari zako, pata mizigo',
    desc:     'Una basi, van, au gari? Jiunge na mtandao wa wasafirishaji wa KenteXa Tanzania nzima.',
    perks:    ['Nafasi zilizobaki zinauzwa', 'Malipo kabla ya safari', 'Uwazi kamili', 'Dashboard ya safari'],
    needs:    ['Leseni ya usafirishaji', 'Aina ya gari', 'Njia za kawaida'],
    page:     'BecomeTransportProvider',
    color:    '#FEF3C7', accent: '#D97706',
  },
  {
    key:      'service_provider',
    icon:     '🔧',
    title:    'Mtoa Huduma',
    tagline:  'Toa ujuzi wako, pata wateja',
    desc:     'Fundi, msafi, mwalimu, mpishi — weka tangazo lako na wateja wakupate.',
    perks:    ['Tangazo la bure', 'Wateja wa karibu nawe', 'Ukadiriaji unaokua', 'Akaunti ya malipo'],
    needs:    ['Aina ya huduma', 'Eneo unalofanya kazi', 'Bei au aina ya bei'],
    page:     'PostService',
    color:    '#F0FDF4', accent: '#16A34A',
  },
];

const RoleActivation = ({ onNavigate, isLoggedIn, onLogout, userRole, currentUser }) => {
  const [selected, setSelected] = useState(null);

  const role  = selected ? ROLES.find(r => r.key === selected) : null;
  const activeRoles = currentUser?.activeRoles || [currentUser?.role || 'user'];

  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#f8fafc',
      fontFamily:'Manrope,Inter,-apple-system,sans-serif', display:'flex', flexDirection:'column' }}>
      <Navbar currentPage="RoleActivation" onNavigate={onNavigate}
        isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => onNavigate('CommerceProfile')} title="Ongeza Jukumu" />

      <div style={{ flex:1, maxWidth:760, margin:'0 auto', width:'100%',
        padding:'20px 16px 80px', boxSizing:'border-box' }}>

        {/* Hero */}
        <div style={{ background:'linear-gradient(135deg,#1e1b4b,#1d4ed8)',
          borderRadius:20, padding:'24px 28px', marginBottom:24, color:'#fff' }}>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.7)',
            marginBottom:6, fontWeight:700 }}>
            AKAUNTI MOJA • MAJUKUMU MENGI
          </div>
          <div style={{ fontSize:20, fontWeight:900, marginBottom:8 }}>
            Ongeza Jukumu Jipya
          </div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)', lineHeight:1.6 }}>
            Akaunti yako inaweza kufanya zaidi. Ongeza jukumu jipya 
            bila kuunda akaunti nyingine.
          </div>

          {/* Active roles */}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:14 }}>
            {activeRoles.map(r => (
              <span key={r} style={{ fontSize:11, fontWeight:800,
                backgroundColor:'rgba(255,255,255,0.2)',
                color:'#fff', padding:'3px 10px', borderRadius:100 }}>
                ✓ {r === 'user' ? 'Mnunuzi' : r === 'seller' ? 'Muuzaji' :
                   r === 'agent' ? 'Agent' : r === 'super_agent' ? 'Super Agent' :
                   r === 'transport_provider' ? 'Msafirishaji' : r}
              </span>
            ))}
          </div>
        </div>

        {/* Role cards */}
        {!selected ? (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ fontSize:14, fontWeight:800, color:'#1e293b', marginBottom:4 }}>
              Chagua jukumu unalotaka kuongeza:
            </div>
            {ROLES.map(r => {
              const isActive = activeRoles.includes(r.key);
              return (
                <div key={r.key}
                  onClick={() => !isActive && setSelected(r.key)}
                  style={{ backgroundColor: isActive ? '#f8fafc' : r.color,
                    borderRadius:16, padding:'18px 20px',
                    cursor: isActive ? 'default' : 'pointer',
                    border: isActive ? '1.5px solid #e2e8f0' : `1.5px solid ${r.accent}20`,
                    opacity: isActive ? 0.7 : 1,
                    display:'flex', alignItems:'center', gap:16 }}>
                  <span style={{ fontSize:32, flexShrink:0 }}>{r.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                      <span style={{ fontSize:15, fontWeight:900, color:'#1e293b' }}>
                        {r.title}
                      </span>
                      {isActive && (
                        <span style={{ fontSize:10, backgroundColor:'#dcfce7',
                          color:'#16a34a', padding:'2px 8px', borderRadius:100, fontWeight:700 }}>
                          ✓ Tayari una jukumu hili
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize:12, color:'#64748b' }}>{r.tagline}</div>
                  </div>
                  {!isActive && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                      stroke={r.accent} strokeWidth="2.5">
                      <polyline points="9,18 15,12 9,6"/>
                    </svg>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Role detail + activate */
          <div>
            <button onClick={() => setSelected(null)}
              style={{ background:'none', border:'none', cursor:'pointer',
                color:'#64748b', fontSize:13, fontWeight:700,
                marginBottom:16, display:'flex', alignItems:'center', gap:4 }}>
              ← Rudi
            </button>

            <div style={{ backgroundColor:role.color, borderRadius:20,
              padding:'24px 20px', marginBottom:16,
              border:`1.5px solid ${role.accent}30` }}>
              <div style={{ fontSize:40, marginBottom:12 }}>{role.icon}</div>
              <div style={{ fontSize:22, fontWeight:900, color:'#1e293b', marginBottom:4 }}>
                {role.title}
              </div>
              <div style={{ fontSize:14, color:'#475569', lineHeight:1.6 }}>
                {role.desc}
              </div>
            </div>

            {/* Perks */}
            <div style={{ backgroundColor:'#fff', borderRadius:16, padding:20,
              marginBottom:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize:13, fontWeight:800, color:'#1e293b', marginBottom:12 }}>
                ✨ Utakachopata
              </div>
              {role.perks.map(p => (
                <div key={p} style={{ display:'flex', gap:10, padding:'8px 0',
                  borderBottom:'1px solid #f8fafc', alignItems:'center' }}>
                  <div style={{ width:22, height:22, borderRadius:'50%',
                    backgroundColor:role.color, display:'flex',
                    alignItems:'center', justifyContent:'center',
                    fontSize:12, flexShrink:0 }}>✓</div>
                  <span style={{ fontSize:13, color:'#475569' }}>{p}</span>
                </div>
              ))}
            </div>

            {/* Requirements */}
            <div style={{ backgroundColor:'#fff', borderRadius:16, padding:20,
              marginBottom:24, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize:13, fontWeight:800, color:'#1e293b', marginBottom:12 }}>
                📋 Utakachohitaji
              </div>
              {role.needs.map(n => (
                <div key={n} style={{ display:'flex', gap:10, padding:'8px 0',
                  borderBottom:'1px solid #f8fafc', alignItems:'center' }}>
                  <div style={{ width:22, height:22, borderRadius:'50%',
                    backgroundColor:'#fef3c7', display:'flex',
                    alignItems:'center', justifyContent:'center',
                    fontSize:12, flexShrink:0 }}>📌</div>
                  <span style={{ fontSize:13, color:'#475569' }}>{n}</span>
                </div>
              ))}
            </div>

            <button onClick={() => onNavigate(role.page)}
              style={{ width:'100%',
                background:`linear-gradient(135deg,${role.accent},${role.accent}cc)`,
                color:'#fff', border:'none', borderRadius:14,
                padding:'16px 0', cursor:'pointer',
                fontSize:16, fontWeight:900,
                boxShadow:`0 4px 16px ${role.accent}40` }}>
              {role.icon} Anza Usajili wa {role.title}
            </button>
          </div>
        )}
      </div>
      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default RoleActivation;