/**
 * AgentScorecard.js — Agent performance dashboard
 * Place at: src/public/pages/AgentScorecard.js
 *
 * Shows: earnings breakdown, delivery stats, rating, tier,
 * completion rate, and what it takes to reach next tier.
 */
import React, { useState, useEffect } from 'react';
import Navbar   from '../components/Navbar';
import BackBar  from '../components/BackBar';
import Footer   from '../components/Footer';
import api      from '../../api/api';

const fmt  = n => Number(n||0).toLocaleString();
const pct  = (a, b) => b > 0 ? Math.round((a/b)*100) : 0;

// Tier definitions
const TIERS = [
  { name: 'Mpya',     min: 0,   color: '#94a3b8', bg: '#f1f5f9',  icon: '🌱', next: 10  },
  { name: 'Kawaida', min: 10,  color: '#16a34a', bg: '#dcfce7',  icon: '⭐', next: 50  },
  { name: 'Mzuri',   min: 50,  color: '#1d4ed8', bg: '#dbeafe',  icon: '🌟', next: 150 },
  { name: 'Bora',    min: 150, color: '#7c3aed', bg: '#ede9fe',  icon: '💎', next: 500 },
  { name: 'Mkuu',    min: 500, color: '#dc2626', bg: '#fee2e2',  icon: '🏆', next: null },
];

const getTier = (deliveries) => {
  return [...TIERS].reverse().find(t => deliveries >= t.min) || TIERS[0];
};

const AgentScorecard = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState('overview');

  useEffect(() => {
    api.get('/agents/my-profile')
      .then(r => setProfile(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', backgroundColor:'#f1f5f9' }}>
      <Navbar currentPage="AgentScorecard" onNavigate={onNavigate}
        isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ textAlign:'center', color:'#94a3b8' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🏍️</div>
          <div>Inapakia takwimu...</div>
        </div>
      </div>
    </div>
  );

  if (!profile) return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', backgroundColor:'#f1f5f9' }}>
      <Navbar currentPage="AgentScorecard" onNavigate={onNavigate}
        isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:64, marginBottom:16 }}>🏍️</div>
          <div style={{ fontSize:18, fontWeight:900, color:'#1e293b', marginBottom:8 }}>
            Hujasajiliwa kama Agent
          </div>
          <button onClick={() => onNavigate('BecomeAgent')}
            style={{ backgroundColor:'#1d4ed8', color:'#fff', border:'none',
              borderRadius:12, padding:'12px 24px', cursor:'pointer',
              fontSize:14, fontWeight:700 }}>
            Jiunge Sasa
          </button>
        </div>
      </div>
      <Footer onNavigate={onNavigate} />
    </div>
  );

  const tier            = getTier(profile.totalDeliveriesCompleted || 0);
  const nextTier        = TIERS[TIERS.indexOf(tier) + 1];
  const deliveries      = profile.totalDeliveriesCompleted || 0;
  const failed          = profile.totalDeliveriesFailed    || 0;
  const totalAttempts   = deliveries + failed;
  const completionRate  = pct(deliveries, totalAttempts);
  const toNextTier      = nextTier ? nextTier.min - deliveries : 0;
  const tierProgress    = nextTier
    ? pct(deliveries - tier.min, nextTier.min - tier.min)
    : 100;

  const earnings = {
    deliveries:   Number(profile.totalEarningsDeliveries   || 0),
    payments:     Number(profile.totalEarningsPayments     || 0),
    collections:  Number(profile.totalEarningsCollections  || 0),
    pending:      Number(profile.pendingEarnings           || 0),
    total:        Number(profile.totalEarnings             || 0),
  };

  const statCards = [
    { icon:'📦', label:'Zilizotolewa',    value: fmt(deliveries),     color:'#1d4ed8', bg:'#eff6ff' },
    { icon:'⭐', label:'Ukadiriaji',       value: `${Number(profile.rating||0).toFixed(1)}/5.0`, color:'#d97706', bg:'#fef3c7' },
    { icon:'✅', label:'Kiwango cha Kukamilisha', value:`${completionRate}%`, color:'#16a34a', bg:'#dcfce7' },
    { icon:'💳', label:'Malipo Yaliyoshughulikiwa', value: fmt(profile.totalPaymentsProcessed||0), color:'#7c3aed', bg:'#ede9fe' },
  ];

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', backgroundColor:'#f1f5f9' }}>
      <Navbar currentPage="AgentScorecard" onNavigate={onNavigate}
        isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => onNavigate('AgentDashboard')} title="📊 Kadi ya Ufanikishaji" />

      <div style={{ flex:1, padding:'16px 16px 40px', maxWidth:720,
        margin:'0 auto', width:'100%', boxSizing:'border-box' }}>

        {/* Tier hero */}
        <div style={{ background:`linear-gradient(135deg, #0f172a, #1e3a8a)`,
          borderRadius:20, padding:24, marginBottom:20, color:'#fff' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.6)',
                fontWeight:700, letterSpacing:1, marginBottom:6 }}>
                UKANDA WAKO
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
                <span style={{ fontSize:36 }}>{tier.icon}</span>
                <div>
                  <div style={{ fontSize:26, fontWeight:900 }}>Agent {tier.name}</div>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,0.6)' }}>
                    {profile.agentCode} · {profile.agentType?.toUpperCase()}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:32, fontWeight:900 }}>
                TZS {fmt(earnings.total)}
              </div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)' }}>
                Jumla ya Mapato
              </div>
            </div>
          </div>

          {/* Tier progress bar */}
          {nextTier && (
            <div style={{ marginTop:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between',
                fontSize:11, color:'rgba(255,255,255,0.6)', marginBottom:6 }}>
                <span>{tier.icon} {tier.name}</span>
                <span>{toNextTier} zaidi → {nextTier.icon} {nextTier.name}</span>
              </div>
              <div style={{ height:8, backgroundColor:'rgba(255,255,255,0.2)', borderRadius:100 }}>
                <div style={{ height:'100%', borderRadius:100,
                  background:'linear-gradient(90deg,#60a5fa,#a78bfa)',
                  width:`${tierProgress}%`, transition:'width 0.6s' }} />
              </div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginTop:4 }}>
                Toa {toNextTier} zaidi ili upande ukanda
              </div>
            </div>
          )}
          {!nextTier && (
            <div style={{ marginTop:16, fontSize:13, color:'rgba(255,255,255,0.8)',
              fontWeight:700 }}>
              🏆 Umefika ukanda wa juu kabisa!
            </div>
          )}
        </div>

        {/* Stat cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, marginBottom:20 }}>
          {statCards.map(s => (
            <div key={s.label} style={{ backgroundColor:s.bg, borderRadius:14, padding:16 }}>
              <div style={{ fontSize:24, marginBottom:8 }}>{s.icon}</div>
              <div style={{ fontSize:24, fontWeight:900, color:s.color }}>{s.value}</div>
              <div style={{ fontSize:12, color:'#64748b', marginTop:4, fontWeight:600 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', backgroundColor:'#fff', borderRadius:12,
          padding:4, marginBottom:16, boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
          {[
            { key:'overview',  label:'💰 Mapato'   },
            { key:'delivery',  label:'📦 Utoaji'   },
            { key:'tips',      label:'💡 Vidokezo'  },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ flex:1, padding:'9px 4px', border:'none', cursor:'pointer',
                borderRadius:9, fontSize:12, fontWeight:700,
                backgroundColor: tab === t.key ? '#1d4ed8' : 'transparent',
                color: tab === t.key ? '#fff' : '#64748b' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {tab === 'overview' && (
          <div style={{ backgroundColor:'#fff', borderRadius:16, padding:20,
            boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize:14, fontWeight:800, color:'#1e293b', marginBottom:16 }}>
              💰 Mgawanyo wa Mapato
            </div>
            {[
              { label:'Utoaji wa Bidhaa',       value: earnings.deliveries,  icon:'🏍️', color:'#1d4ed8' },
              { label:'Ukusanyaji wa Malipo',    value: earnings.payments,    icon:'💳', color:'#16a34a' },
              { label:'Ukusanyaji wa Bidhaa',    value: earnings.collections, icon:'📦', color:'#7c3aed' },
              { label:'Inayosubiri Kulipwa',     value: earnings.pending,     icon:'⏳', color:'#d97706' },
            ].map(e => {
              const share = earnings.total > 0 ? Math.round((e.value/earnings.total)*100) : 0;
              return (
                <div key={e.label} style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between',
                    alignItems:'center', marginBottom:6 }}>
                    <span style={{ fontSize:13, color:'#475569' }}>{e.icon} {e.label}</span>
                    <span style={{ fontSize:14, fontWeight:900, color:e.color }}>
                      TZS {fmt(e.value)}
                    </span>
                  </div>
                  <div style={{ height:6, backgroundColor:'#f1f5f9', borderRadius:100 }}>
                    <div style={{ height:'100%', borderRadius:100,
                      backgroundColor:e.color, width:`${share}%`,
                      transition:'width 0.5s' }} />
                  </div>
                </div>
              );
            })}

            <div style={{ marginTop:20, paddingTop:16, borderTop:'1px solid #f1f5f9',
              display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:13, fontWeight:700, color:'#64748b' }}>Jumla</span>
              <span style={{ fontSize:20, fontWeight:900, color:'#16a34a' }}>
                TZS {fmt(earnings.total)}
              </span>
            </div>
          </div>
        )}

        {/* Delivery tab */}
        {tab === 'delivery' && (
          <div style={{ backgroundColor:'#fff', borderRadius:16, padding:20,
            boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize:14, fontWeight:800, color:'#1e293b', marginBottom:16 }}>
              📦 Takwimu za Utoaji
            </div>

            {/* Completion rate visual */}
            <div style={{ textAlign:'center', marginBottom:24 }}>
              <div style={{ position:'relative', display:'inline-block' }}>
                <svg width="120" height="120" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="50" fill="none"
                    stroke="#f1f5f9" strokeWidth="12" />
                  <circle cx="60" cy="60" r="50" fill="none"
                    stroke={completionRate>=80?'#16a34a':completionRate>=60?'#d97706':'#dc2626'}
                    strokeWidth="12"
                    strokeDasharray={`${(completionRate/100)*314} 314`}
                    strokeLinecap="round"
                    transform="rotate(-90 60 60)" />
                  <text x="60" y="56" textAnchor="middle"
                    fontSize="20" fontWeight="900"
                    fill="#1e293b">{completionRate}%</text>
                  <text x="60" y="72" textAnchor="middle"
                    fontSize="9" fill="#64748b">kukamilisha</text>
                </svg>
              </div>
            </div>

            {[
              ['✅ Zilizokamilika',   deliveries,  '#16a34a'],
              ['❌ Zilizoshindwa',    failed,      '#dc2626'],
              ['📊 Jumla ya Majaribio', totalAttempts, '#1d4ed8'],
              ['📦 Ukusanyaji',      profile.totalCollectionsCompleted||0, '#7c3aed'],
              ['⭐ Ukadiriaji',       `${Number(profile.rating||0).toFixed(1)} / 5.0`, '#d97706'],
              ['😠 Malalamiko',       profile.totalComplaints||0, '#dc2626'],
            ].map(([label, value, color]) => (
              <div key={label} style={{ display:'flex', justifyContent:'space-between',
                padding:'10px 0', borderBottom:'1px solid #f1f5f9' }}>
                <span style={{ fontSize:13, color:'#475569' }}>{label}</span>
                <span style={{ fontSize:14, fontWeight:800, color }}>{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tips tab */}
        {tab === 'tips' && (
          <div style={{ backgroundColor:'#fff', borderRadius:16, padding:20,
            boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize:14, fontWeight:800, color:'#1e293b', marginBottom:16 }}>
              💡 Jinsi ya Kupata Zaidi
            </div>
            {[
              { icon:'⚡', title:'Jibu haraka', desc:'Kukubali kazi ndani ya dakika 5 kunaongeza nafasi ya kupata kazi zaidi.' },
              { icon:'⭐', title:'Dumisha ukadiriaji wa juu', desc:'Ukadiriaji zaidi ya 4.5 unakupa kipaumbele cha kazi mpya.' },
              { icon:'📍', title:'Kaa karibu na kituo', desc:'Agents wanaokuwepo ndani ya km 3 wanapata kazi zaidi.' },
              { icon:'📱', title:'Kuwa mtandaoni', desc:'Weka hali yako kuwa "Mtandaoni" wakati unafanya kazi ili upate maombi.' },
              { icon:'🏆', title:`Fikia ukanda wa ${nextTier?.name||'Mkuu'}`, desc: nextTier ? `Ukitoa ${toNextTier} zaidi, utapata kiwango cha juu na mapato makubwa zaidi.` : 'Umefika kilele! Endelea kudumisha ubora wako.' },
            ].map(t => (
              <div key={t.title} style={{ display:'flex', gap:14, padding:'14px 0',
                borderBottom:'1px solid #f1f5f9' }}>
                <div style={{ width:40, height:40, borderRadius:10, flexShrink:0,
                  backgroundColor:'#eff6ff',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:20 }}>
                  {t.icon}
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:800, color:'#1e293b', marginBottom:3 }}>
                    {t.title}
                  </div>
                  <div style={{ fontSize:12, color:'#64748b', lineHeight:1.5 }}>{t.desc}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default AgentScorecard;