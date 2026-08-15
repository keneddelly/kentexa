/**
 * AgentScorecard.js — Agent performance dashboard
 * Place at: src/public/pages/AgentScorecard.js
 *
 * Shows: earnings breakdown, delivery stats, rating, tier,
 * completion rate, and what it takes to reach next tier.
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar  from '../components/BackBar';
import api      from '../../api/api';

const fmt  = n => Number(n||0).toLocaleString();
const pct  = (a, b) => b > 0 ? Math.round((a/b)*100) : 0;

// Tier definitions
const getTiers = (t) => [
  { name: t('agent_scorecard.tier_new'),     min: 0,   color: '#94a3b8', bg: '#f1f5f9',  icon: '🌱', next: 10  },
  { name: t('agent_scorecard.tier_regular'), min: 10,  color: '#16a34a', bg: '#dcfce7',  icon: '⭐', next: 50  },
  { name: t('agent_scorecard.tier_good'),   min: 50,  color: '#1d4ed8', bg: '#dbeafe',  icon: '🌟', next: 150 },
  { name: t('agent_scorecard.tier_excellent'),    min: 150, color: '#7c3aed', bg: '#ede9fe',  icon: '💎', next: 500 },
  { name: t('agent_scorecard.tier_master'),    min: 500, color: '#dc2626', bg: '#fee2e2',  icon: '🏆', next: null },
];

const getTier = (deliveries, tiers) => {
  return [...tiers].reverse().find(t => deliveries >= t.min) || tiers[0];
};

const AgentScorecard = ({ onNavigate }) => {
  const { t } = useTranslation();
  const TIERS = getTiers(t);
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
      <BackBar onBack={() => onNavigate('AgentDashboard')} title={t('agent_scorecard.page_title')} top={0} />
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ textAlign:'center', color:'#94a3b8' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🏍️</div>
          <div>{t('agent_scorecard.loading')}</div>
        </div>
      </div>
    </div>
  );

  if (!profile) return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', backgroundColor:'#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('AgentDashboard')} title={t('agent_scorecard.page_title')} top={0} />
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:64, marginBottom:16 }}>🏍️</div>
          <div style={{ fontSize:18, fontWeight:900, color:'#1e293b', marginBottom:8 }}>
            {t('agent_scorecard.not_registered_title')}
          </div>
          <button onClick={() => onNavigate('BecomeAgent')}
            style={{ backgroundColor:'#1d4ed8', color:'#fff', border:'none',
              borderRadius:12, padding:'12px 24px', cursor:'pointer',
              fontSize:14, fontWeight:700 }}>
            {t('agent_scorecard.join_now_button')}
          </button>
        </div>
      </div>
    </div>
  );

  const tier            = getTier(profile.totalDeliveriesCompleted || 0, TIERS);
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
    { icon:'📦', label:t('agent_scorecard.stat_delivered'),    value: fmt(deliveries),     color:'#1d4ed8', bg:'#eff6ff' },
    { icon:'⭐', label:t('agent_scorecard.stat_rating'),       value: `${Number(profile.rating||0).toFixed(1)}/5.0`, color:'#d97706', bg:'#fef3c7' },
    { icon:'✅', label:t('agent_scorecard.stat_completion_rate'), value:`${completionRate}%`, color:'#16a34a', bg:'#dcfce7' },
    { icon:'💳', label:t('agent_scorecard.stat_payments_processed'), value: fmt(profile.totalPaymentsProcessed||0), color:'#7c3aed', bg:'#ede9fe' },
  ];

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', backgroundColor:'#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('AgentDashboard')} title={t('agent_scorecard.page_title')} top={0} />

      <div style={{ flex:1, padding:'16px 16px 40px', maxWidth:720,
        margin:'0 auto', width:'100%', boxSizing:'border-box' }}>

        {/* Tier hero */}
        <div style={{ background:`linear-gradient(135deg, #0f172a, #1e3a8a)`,
          borderRadius:20, padding:24, marginBottom:20, color:'#fff' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.6)',
                fontWeight:700, letterSpacing:1, marginBottom:6 }}>
                {t('agent_scorecard.your_tier_label')}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
                <span style={{ fontSize:36 }}>{tier.icon}</span>
                <div>
                  <div style={{ fontSize:26, fontWeight:900 }}>{t('agent_scorecard.agent_prefix', { tier: tier.name })}</div>
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
                {t('agent_scorecard.total_earnings_label')}
              </div>
            </div>
          </div>

          {/* Tier progress bar */}
          {nextTier && (
            <div style={{ marginTop:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between',
                fontSize:11, color:'rgba(255,255,255,0.6)', marginBottom:6 }}>
                <span>{tier.icon} {tier.name}</span>
                <span>{t('agent_scorecard.more_to_go', { count: toNextTier })} {nextTier.icon} {nextTier.name}</span>
              </div>
              <div style={{ height:8, backgroundColor:'rgba(255,255,255,0.2)', borderRadius:100 }}>
                <div style={{ height:'100%', borderRadius:100,
                  background:'linear-gradient(90deg,#60a5fa,#a78bfa)',
                  width:`${tierProgress}%`, transition:'width 0.6s' }} />
              </div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginTop:4 }}>
                {t('agent_scorecard.progress_hint', { count: toNextTier })}
              </div>
            </div>
          )}
          {!nextTier && (
            <div style={{ marginTop:16, fontSize:13, color:'rgba(255,255,255,0.8)',
              fontWeight:700 }}>
              {t('agent_scorecard.top_tier_reached')}
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
            { key:'overview',  label:t('agent_scorecard.tab_overview')   },
            { key:'delivery',  label:t('agent_scorecard.tab_delivery')   },
            { key:'tips',      label:t('agent_scorecard.tab_tips')  },
          ].map(tabItem => (
            <button key={tabItem.key} onClick={() => setTab(tabItem.key)}
              style={{ flex:1, padding:'9px 4px', border:'none', cursor:'pointer',
                borderRadius:9, fontSize:12, fontWeight:700,
                backgroundColor: tab === tabItem.key ? '#1d4ed8' : 'transparent',
                color: tab === tabItem.key ? '#fff' : '#64748b' }}>
              {tabItem.label}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {tab === 'overview' && (
          <div style={{ backgroundColor:'#fff', borderRadius:16, padding:20,
            boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize:14, fontWeight:800, color:'#1e293b', marginBottom:16 }}>
              {t('agent_scorecard.earnings_breakdown_title')}
            </div>
            {[
              { label:t('agent_scorecard.earning_deliveries'),       value: earnings.deliveries,  icon:'🏍️', color:'#1d4ed8' },
              { label:t('agent_scorecard.earning_payments'),    value: earnings.payments,    icon:'💳', color:'#16a34a' },
              { label:t('agent_scorecard.earning_collections'),    value: earnings.collections, icon:'📦', color:'#7c3aed' },
              { label:t('agent_scorecard.earning_pending'),     value: earnings.pending,     icon:'⏳', color:'#d97706' },
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
              <span style={{ fontSize:13, fontWeight:700, color:'#64748b' }}>{t('agent_scorecard.total_label')}</span>
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
              {t('agent_scorecard.delivery_stats_title')}
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
                    fontSize="9" fill="#64748b">{t('agent_scorecard.completing_label')}</text>
                </svg>
              </div>
            </div>

            {[
              [t('agent_scorecard.row_completed'),   deliveries,  '#16a34a'],
              [t('agent_scorecard.row_failed'),    failed,      '#dc2626'],
              [t('agent_scorecard.row_total_attempts'), totalAttempts, '#1d4ed8'],
              [t('agent_scorecard.row_collections'),      profile.totalCollectionsCompleted||0, '#7c3aed'],
              [t('agent_scorecard.row_rating'),       `${Number(profile.rating||0).toFixed(1)} / 5.0`, '#d97706'],
              [t('agent_scorecard.row_complaints'),       profile.totalComplaints||0, '#dc2626'],
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
              {t('agent_scorecard.tips_title')}
            </div>
            {[
              { icon:'⚡', title:t('agent_scorecard.tip1_title'), desc:t('agent_scorecard.tip1_desc') },
              { icon:'⭐', title:t('agent_scorecard.tip2_title'), desc:t('agent_scorecard.tip2_desc') },
              { icon:'📍', title:t('agent_scorecard.tip3_title'), desc:t('agent_scorecard.tip3_desc') },
              { icon:'📱', title:t('agent_scorecard.tip4_title'), desc:t('agent_scorecard.tip4_desc') },
              { icon:'🏆', title:t('agent_scorecard.tip5_title', { tier: nextTier?.name || t('agent_scorecard.default_max_tier') }), desc: nextTier ? t('agent_scorecard.tip5_desc_next', { count: toNextTier }) : t('agent_scorecard.tip5_desc_max') },
            ].map(tip => (
              <div key={tip.title} style={{ display:'flex', gap:14, padding:'14px 0',
                borderBottom:'1px solid #f1f5f9' }}>
                <div style={{ width:40, height:40, borderRadius:10, flexShrink:0,
                  backgroundColor:'#eff6ff',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:20 }}>
                  {tip.icon}
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:800, color:'#1e293b', marginBottom:3 }}>
                    {tip.title}
                  </div>
                  <div style={{ fontSize:12, color:'#64748b', lineHeight:1.5 }}>{tip.desc}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentScorecard;