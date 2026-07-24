/**
 * ProfileCompletion.js — Profile completion progress bar component
 * Place at: src/public/components/ProfileCompletion.js
 *
 * Shows as a banner on CommerceProfile and homepage
 * when user has incomplete profile fields
 */
import React, { useState } from 'react';

const B = '#2563EB';

const getSteps = (user, role) => {
  const steps = [
    {
      key: 'phone',
      label: 'Thibitisha simu',
      icon: '📱',
      done: !!user?.isVerified,
      page: null, // happens via OTP at registration
    },
    {
      key: 'name',
      label: 'Weka jina lako kamili',
      icon: '👤',
      done: !!(user?.name && user.name.trim().length > 2),
      page: 'CustomerProfile',
    },
    {
      key: 'photo',
      label: 'Weka picha ya wasifu',
      icon: '📸',
      done: !!(user?.logo || user?.avatar),
      page: 'CustomerProfile',
    },
    {
      key: 'location',
      label: 'Weka mji wako',
      icon: '📍',
      done: !!(user?.businessLocation || user?.city),
      page: 'CustomerProfile',
    },
    {
      key: 'bio',
      label: 'Andika maelezo mafupi',
      icon: '✏️',
      done: !!(user?.storeDescription || user?.bio),
      page: 'CustomerProfile',
    },
  ];

  // Seller-specific
  if (['seller', 'admin', 'manager'].includes(role)) {
    steps.push({
      key: 'store',
      label: 'Kamilisha wasifu wa duka',
      icon: '🏪',
      done: !!(user?.storeName && user?.storeDescription),
      page: 'StoreSettings',
    });
  }

  return steps;
};

const ProfileCompletion = ({ currentUser, userRole, onNavigate, compact = false }) => {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !currentUser) return null;

  const steps  = getSteps(currentUser, userRole);
  const done   = steps.filter(s => s.done).length;
  const total  = steps.length;
  const pct    = Math.round((done / total) * 100);
  const nextStep = steps.find(s => !s.done);

  // Don't show if 100% complete
  if (pct === 100) return null;

  if (compact) {
    return (
      <div style={{ backgroundColor:'#fff', borderRadius:12, padding:'12px 16px',
        marginBottom:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display:'flex', justifyContent:'space-between',
          alignItems:'center', marginBottom:8 }}>
          <span style={{ fontSize:13, fontWeight:800, color:'#1e293b' }}>
            Wasifu wako: {pct}% kamili
          </span>
          <span style={{ fontSize:12, color:'#64748b' }}>{done}/{total}</span>
        </div>
        <div style={{ height:6, backgroundColor:'#f1f5f9', borderRadius:100 }}>
          <div style={{ height:'100%', borderRadius:100, backgroundColor:B,
            width:`${pct}%`, transition:'width 0.5s' }} />
        </div>
        {nextStep && (
          <button onClick={() => nextStep.page && onNavigate(nextStep.page)}
            style={{ marginTop:8, background:'none', border:'none',
              cursor:'pointer', color:B, fontSize:12, fontWeight:700,
              padding:0 }}>
            {nextStep.icon} {nextStep.label} →
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ backgroundColor:'#eff6ff', borderRadius:16,
      padding:'16px 20px', marginBottom:16,
      border:'1px solid #bfdbfe', position:'relative' }}>

      <button onClick={() => setDismissed(true)}
        style={{ position:'absolute', top:12, right:12,
          background:'none', border:'none', cursor:'pointer',
          color:'#94a3b8', fontSize:18, lineHeight:1 }}>×</button>

      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
        <div style={{ fontSize:20 }}>👤</div>
        <div>
          <div style={{ fontSize:14, fontWeight:900, color:'#1e293b' }}>
            Kamilisha Wasifu Wako — {pct}%
          </div>
          <div style={{ fontSize:12, color:'#64748b' }}>
            Wasifu kamili unaongeza imani kwa wateja
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height:8, backgroundColor:'#dbeafe', borderRadius:100, marginBottom:12 }}>
        <div style={{ height:'100%', borderRadius:100, backgroundColor:B,
          width:`${pct}%`, transition:'width 0.5s' }} />
      </div>

      {/* Steps */}
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {steps.map(s => (
          <div key={s.key}
            onClick={() => !s.done && s.page && onNavigate(s.page)}
            style={{ display:'flex', alignItems:'center', gap:10,
              cursor: s.done || !s.page ? 'default' : 'pointer' }}>
            <div style={{ width:20, height:20, borderRadius:'50%', flexShrink:0,
              backgroundColor: s.done ? '#16a34a' : '#e2e8f0',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:11, color: s.done ? '#fff' : '#94a3b8' }}>
              {s.done ? '✓' : s.icon}
            </div>
            <span style={{ fontSize:12,
              color: s.done ? '#64748b' : '#1e293b',
              fontWeight: s.done ? 400 : 700,
              textDecoration: s.done ? 'line-through' : 'none' }}>
              {s.label}
            </span>
            {!s.done && s.page && (
              <span style={{ fontSize:10, color:B, fontWeight:700, marginLeft:'auto' }}>
                Fanya →
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProfileCompletion;