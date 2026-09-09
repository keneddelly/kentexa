/**
 * ProfileSwitcherSheet.js — switch the server-authoritative AccountRole.
 *
 * One account, several independent public identities (personal + any
 * approved business/hub/agent/transport profiles). This is the single
 * place that switches between them — never re-authenticates, just
 * Presentation profiles only enrich the AccountRole labels and artwork.
 *
 * Business-First Frontend Stage 1: the user's mental model is now
 * "Personal / My Businesses", not a flat "switch role" list. Grouping is
 * pure presentation (businessGrouping.js) over the exact same
 * server-issued roleOptions this component always received — a capability
 * row still only ever calls onSwitch(accountRoleId), the same atomic,
 * server-validated switch as before. Tapping a Business's own name (not
 * one of its capability rows) opens Business Home instead of switching
 * anything, via onOpenBusiness — a Business is a navigation grouping
 * here, never an authority the frontend asserts.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { groupProfilesForSwitcher } from '../../context/businessGrouping';

const B  = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';

const TYPE_META = {
  personal:           { icon: '👤', label: 'profile_switcher.type_personal' },
  business:           { icon: '🏪', label: 'profile_switcher.type_business' },
  hub:                { icon: '🏢', label: 'profile_switcher.type_hub' },
  transport_provider: { icon: '🚌', label: 'profile_switcher.type_transport' },
  agent:              { icon: '🏍️', label: 'profile_switcher.type_agent' },
  service_provider:   { icon: '🔧', label: 'profile_switcher.type_service' },
};

// Capability-domain label for a role grouped under a Business — deliberately
// NOT the same as TYPE_META's generic type label (e.g. "Business"/"Hub"),
// so a Business's capability rows read as "Commerce"/"Transport"/"Super
// Agent" per the approved Business-First presentation, not backend role
// terminology repeated under itself.
const CAPABILITY_LABEL_BY_ROLE = {
  seller: 'business_home.tile_commerce',
  transport_provider: 'business_home.tile_transport',
  super_agent: 'business_home.tile_super_agent',
  service_provider: 'profile_switcher.type_service',
};

const ProfileRow = ({ profile, isActive, disabled, onClick, label, icon, translatedActiveLabel }) => (
  <button onClick={onClick} disabled={disabled}
    style={{ width:'100%', display:'flex', alignItems:'center', gap:12,
      padding:'12px 10px', borderRadius:14, marginBottom:6,
      border: isActive ? `2px solid ${B}` : '2px solid transparent',
      backgroundColor: isActive ? '#EFF6FF' : WH,
      cursor: disabled ? 'default' : 'pointer', opacity: disabled && !isActive ? 0.55 : 1, textAlign:'left' }}>
    <div style={{ width:40, height:40, borderRadius:12, flexShrink:0,
      backgroundColor:'#F1F5F9', overflow:'hidden', display:'flex',
      alignItems:'center', justifyContent:'center', fontSize:19 }}>
      {profile?.photoUrl
        ? <img src={profile.photoUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
        : icon}
    </div>
    <div style={{ flex:1, minWidth:0 }}>
      <div style={{ fontSize:13, fontWeight:800, color:DK,
        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {label}
      </div>
      {profile?.status && profile.status !== 'active' && (
        <div style={{ fontSize:10, color:GR, marginTop:1 }}>{profile.status}</div>
      )}
    </div>
    {isActive && <span style={{ fontSize:11, fontWeight:800, color:B }}>{translatedActiveLabel}</span>}
  </button>
);

const ProfileSwitcherSheet = ({ profiles, activeAccountRoleId, onSwitch, onClose, onNavigate, onOpenBusiness, switching, error }) => {
  const { t } = useTranslation();
  const { personal, businesses, other } = groupProfilesForSwitcher(profiles || []);

  const isActive = (p) => Number(p.accountRoleId) === Number(activeAccountRoleId);
  const rowDisabled = (p) => isActive(p) || p.switchable !== true || switching;

  return (
    <div onClick={onClose}
      style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.5)',
        zIndex:4000, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width:'100%', maxWidth:480, backgroundColor:WH,
          borderRadius:'20px 20px 0 0', maxHeight:'75vh', display:'flex',
          flexDirection:'column', fontFamily:'Manrope,Inter,-apple-system,sans-serif' }}>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'16px 16px 12px', borderBottom:'1px solid #F1F5F9', flexShrink:0 }}>
          <div style={{ fontSize:15, fontWeight:900, color:DK }}>
            {t('profile_switcher.title')}
          </div>
          <button onClick={onClose}
            style={{ background:'none', border:'none', cursor:'pointer',
              fontSize:20, color:GR }}>×</button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'8px 16px 16px' }}>
          {error && <div role="alert" style={{ margin:'4px 0 10px', padding:'9px 10px', borderRadius:10,
            backgroundColor:'#FEE2E2', color:'#B91C1C', fontSize:11, fontWeight:700 }}>{error}</div>}

          {personal && (
            <ProfileRow profile={personal} isActive={isActive(personal)} disabled={rowDisabled(personal)}
              onClick={() => onSwitch(personal.accountRoleId)}
              label={personal.displayName || t('profile_switcher.type_personal')}
              icon={TYPE_META.personal.icon} translatedActiveLabel={t('profile_switcher.active_label')} />
          )}

          {businesses.length > 0 && (
            <div style={{ fontSize:10, fontWeight:800, color:GR, letterSpacing:0.6, margin:'14px 4px 6px' }}>
              {t('profile_switcher.my_businesses_header')}
            </div>
          )}
          {businesses.map((group) => (
            <div key={group.businessId} style={{ marginBottom: 8 }}>
              <button onClick={() => onOpenBusiness?.(group.businessId)}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'6px 10px',
                  border:'none', background:'none', cursor:'pointer', textAlign:'left' }}>
                <span style={{ fontSize:14 }}>🏢</span>
                <span style={{ fontSize:13, fontWeight:800, color:DK }}>
                  {group.businessName || t('profile_switcher.unnamed_business')}
                </span>
                <span style={{ marginLeft:'auto', fontSize:14, color:'#CBD5E1' }}>›</span>
              </button>
              <div style={{ paddingLeft: 12 }}>
                {group.capabilities.map((p) => (
                  <ProfileRow key={p.accountRoleId} profile={p} isActive={isActive(p)} disabled={rowDisabled(p)}
                    onClick={() => onSwitch(p.accountRoleId)}
                    label={t(CAPABILITY_LABEL_BY_ROLE[p.roleType] || TYPE_META[p.type]?.label || 'profile_switcher.type_business')}
                    icon={(TYPE_META[p.type] || TYPE_META.business).icon} translatedActiveLabel={t('profile_switcher.active_label')} />
                ))}
              </div>
            </div>
          ))}

          {other.length > 0 && (
            <div style={{ fontSize:10, fontWeight:800, color:GR, letterSpacing:0.6, margin:'14px 4px 6px' }}>
              {t('profile_switcher.other_roles_header')}
            </div>
          )}
          {other.map((p) => (
            <ProfileRow key={p.accountRoleId} profile={p} isActive={isActive(p)} disabled={rowDisabled(p)}
              onClick={() => onSwitch(p.accountRoleId)}
              label={p.displayName}
              icon={(TYPE_META[p.type] || TYPE_META.personal).icon} translatedActiveLabel={t('profile_switcher.active_label')} />
          ))}

          <button onClick={() => { onClose(); onNavigate('MyBusinesses'); }}
            style={{ width:'100%', display:'flex', alignItems:'center', gap:12,
              padding:'12px 10px', borderRadius:14, marginTop:8,
              border:'1.5px dashed #93C5FD', backgroundColor:'#F8FAFC',
              cursor:'pointer', textAlign:'left' }}>
            <div style={{ width:40, height:40, borderRadius:12, flexShrink:0,
              backgroundColor:'#EFF6FF', display:'flex', alignItems:'center',
              justifyContent:'center', fontSize:20, color:B }}>+</div>
            <div style={{ fontSize:13, fontWeight:700, color:B }}>
              {t('profile_switcher.add_business')}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileSwitcherSheet;
