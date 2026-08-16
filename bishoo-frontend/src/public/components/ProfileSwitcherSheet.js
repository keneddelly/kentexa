/**
 * ProfileSwitcherSheet.js — pick which CommerceProfile the app acts as.
 *
 * One account, several independent public identities (personal + any
 * approved business/hub/agent/transport profiles). This is the single
 * place that switches between them — never re-authenticates, just
 * changes which profile the app shell renders as.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';

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

const ProfileSwitcherSheet = ({ profiles, activeProfileId, onSwitch, onClose, onNavigate }) => {
  const { t } = useTranslation();

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
          {profiles.map(p => {
            const meta = TYPE_META[p.type] || TYPE_META.personal;
            const isActive = p.id === activeProfileId;
            return (
              <button key={p.id} onClick={() => onSwitch(p.id)}
                disabled={isActive}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:12,
                  padding:'12px 10px', borderRadius:14, marginBottom:6,
                  border: isActive ? `2px solid ${B}` : '2px solid transparent',
                  backgroundColor: isActive ? '#EFF6FF' : WH,
                  cursor: isActive ? 'default' : 'pointer', textAlign:'left' }}>
                <div style={{ width:44, height:44, borderRadius:12, flexShrink:0,
                  backgroundColor:'#F1F5F9', overflow:'hidden', display:'flex',
                  alignItems:'center', justifyContent:'center', fontSize:22 }}>
                  {p.photoUrl
                    ? <img src={p.photoUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                    : meta.icon}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:800, color:DK,
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {p.displayName}
                  </div>
                  <div style={{ fontSize:11, color:GR, marginTop:1 }}>
                    {t(meta.label)}
                    {p.status && p.status !== 'active' && ` · ${p.status}`}
                  </div>
                </div>
                {isActive && (
                  <span style={{ fontSize:11, fontWeight:800, color:B }}>
                    {t('profile_switcher.active_label')}
                  </span>
                )}
              </button>
            );
          })}

          <button onClick={() => { onClose(); onNavigate('RoleActivation'); }}
            style={{ width:'100%', display:'flex', alignItems:'center', gap:12,
              padding:'12px 10px', borderRadius:14, marginTop:4,
              border:'1.5px dashed #93C5FD', backgroundColor:'#F8FAFC',
              cursor:'pointer', textAlign:'left' }}>
            <div style={{ width:44, height:44, borderRadius:12, flexShrink:0,
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
