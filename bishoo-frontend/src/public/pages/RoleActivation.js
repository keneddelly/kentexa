/**
 * RoleActivation.js — Guided flow for users to activate new roles
 * Place at: src/public/pages/RoleActivation.js
 *
 * Every user starts as Buyer. This page guides them to activate:
 * Seller, Agent, Super Agent, or Transport Provider.
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar  from '../components/BackBar';

const B = '#2563EB';

const getRoles = (t) => [
  {
    key:      'seller',
    icon:     '🏪',
    title:    t('role_activation.seller_title'),
    tagline:  t('role_activation.seller_tagline'),
    desc:     t('role_activation.seller_desc'),
    perks:    [t('role_activation.seller_perk1'), t('role_activation.seller_perk2'), t('role_activation.seller_perk3'), t('role_activation.seller_perk4')],
    needs:    [t('role_activation.seller_need1'), t('role_activation.seller_need2'), t('role_activation.seller_need3')],
    page:     'BecomeSellerInfo',
    color:    '#EFF6FF', accent: B,
  },
  {
    key:      'agent',
    icon:     '🏍️',
    title:    t('role_activation.agent_title'),
    tagline:  t('role_activation.agent_tagline'),
    desc:     t('role_activation.agent_desc'),
    perks:    [t('role_activation.agent_perk1'), t('role_activation.agent_perk2'), t('role_activation.agent_perk3'), t('role_activation.agent_perk4')],
    needs:    [t('role_activation.agent_need1'), t('role_activation.agent_need2'), t('role_activation.agent_need3')],
    page:     'BecomeAgent',
    color:    '#FDF2F8', accent: '#A21CAF',
  },
  {
    key:      'super_agent',
    icon:     '🏢',
    title:    t('role_activation.super_agent_title'),
    tagline:  t('role_activation.super_agent_tagline'),
    desc:     t('role_activation.super_agent_desc'),
    perks:    [t('role_activation.super_agent_perk1'), t('role_activation.super_agent_perk2'), t('role_activation.super_agent_perk3'), t('role_activation.super_agent_perk4')],
    needs:    [t('role_activation.super_agent_need1'), t('role_activation.super_agent_need2'), t('role_activation.super_agent_need3')],
    page:     'BecomeSuperAgentInfo',
    color:    '#F5F3FF', accent: '#7C3AED',
  },
  {
    key:      'transport_provider',
    icon:     '🚌',
    title:    t('role_activation.transport_provider_title'),
    tagline:  t('role_activation.transport_provider_tagline'),
    desc:     t('role_activation.transport_provider_desc'),
    perks:    [t('role_activation.transport_provider_perk1'), t('role_activation.transport_provider_perk2'), t('role_activation.transport_provider_perk3'), t('role_activation.transport_provider_perk4')],
    needs:    [t('role_activation.transport_provider_need1'), t('role_activation.transport_provider_need2'), t('role_activation.transport_provider_need3')],
    page:     'BecomeTransportProvider',
    color:    '#FEF3C7', accent: '#D97706',
  },
  {
    key:      'service_provider',
    icon:     '🔧',
    title:    t('role_activation.service_provider_title'),
    tagline:  t('role_activation.service_provider_tagline'),
    desc:     t('role_activation.service_provider_desc'),
    perks:    [t('role_activation.service_provider_perk1'), t('role_activation.service_provider_perk2'), t('role_activation.service_provider_perk3'), t('role_activation.service_provider_perk4')],
    needs:    [t('role_activation.service_provider_need1'), t('role_activation.service_provider_need2'), t('role_activation.service_provider_need3')],
    page:     'PostService',
    color:    '#F0FDF4', accent: '#16A34A',
  },
];

const RoleActivation = ({ onNavigate, isLoggedIn, onLogout, userRole, currentUser }) => {
  const { t } = useTranslation();
  const ROLES = getRoles(t);
  const [selected, setSelected] = useState(null);

  const role  = selected ? ROLES.find(r => r.key === selected) : null;
  const activeRoles = currentUser?.activeRoles || [currentUser?.role || 'user'];

  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#f8fafc',
      fontFamily:'Manrope,Inter,-apple-system,sans-serif', display:'flex', flexDirection:'column' }}>
      <BackBar onBack={() => onNavigate('CommerceProfile')} title={t('role_activation.page_title')} top={0} />

      <div style={{ flex:1, maxWidth:760, margin:'0 auto', width:'100%',
        padding:'20px 16px 80px', boxSizing:'border-box' }}>

        {/* Hero */}
        <div style={{ background:'linear-gradient(135deg,#1e1b4b,#1d4ed8)',
          borderRadius:20, padding:'24px 28px', marginBottom:24, color:'#fff' }}>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.7)',
            marginBottom:6, fontWeight:700 }}>
            {t('role_activation.eyebrow')}
          </div>
          <div style={{ fontSize:20, fontWeight:900, marginBottom:8 }}>
            {t('role_activation.hero_title')}
          </div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)', lineHeight:1.6 }}>
            {t('role_activation.hero_desc')}
          </div>

          {/* Active roles */}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:14 }}>
            {activeRoles.map(r => (
              <span key={r} style={{ fontSize:11, fontWeight:800,
                backgroundColor:'rgba(255,255,255,0.2)',
                color:'#fff', padding:'3px 10px', borderRadius:100 }}>
                ✓ {r === 'user' ? t('role_activation.role_user') : r === 'seller' ? t('role_activation.role_seller') :
                   r === 'agent' ? t('role_activation.role_agent') : r === 'super_agent' ? t('role_activation.role_super_agent') :
                   r === 'transport_provider' ? t('role_activation.role_transport_provider') : r}
              </span>
            ))}
          </div>
        </div>

        {/* Role cards */}
        {!selected ? (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ fontSize:14, fontWeight:800, color:'#1e293b', marginBottom:4 }}>
              {t('role_activation.choose_role')}
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
                          {t('role_activation.already_have_role')}
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
              {t('role_activation.back')}
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
                {t('role_activation.perks_title')}
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
                {t('role_activation.needs_title')}
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
              {t('role_activation.activate_button', { icon: role.icon, title: role.title })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RoleActivation;