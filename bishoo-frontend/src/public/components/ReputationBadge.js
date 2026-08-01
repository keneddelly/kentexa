/**
 * ReputationBadge.js — Shared commerce identity badge
 * Place at: src/public/components/ReputationBadge.js
 * 
 * Usage:
 *   import ReputationBadge from '../components/ReputationBadge';
 *   <ReputationBadge score={seller.reputationScore} size="sm" />
 */
import React from 'react';
import { useTranslation } from 'react-i18next';

const getTiers = (t) => [
  { min:900, name:t('reputation_badge.tier_elite'),    icon:'🏆', color:'#dc2626', bg:'#fee2e2' },
  { min:600, name:t('reputation_badge.tier_master'),     icon:'💎', color:'#7c3aed', bg:'#ede9fe' },
  { min:300, name:t('reputation_badge.tier_trusted'),icon:'🌟', color:'#1d4ed8', bg:'#dbeafe' },
  { min:100, name:t('reputation_badge.tier_rising'),    icon:'⭐', color:'#16a34a', bg:'#dcfce7' },
  { min:0,   name:t('reputation_badge.tier_new'),     icon:'🌱', color:'#64748b', bg:'#f1f5f9' },
];

const getTier = (s, tiers) => tiers.find(t => Number(s||0) >= t.min) || tiers[4];

/**
 * size: 'xs' | 'sm' | 'md'
 * xs  = just icon + number (inline on cards)
 * sm  = icon + tier name (seller headers)
 * md  = full badge with label (profile pages)
 */
const ReputationBadge = ({ score = 0, size = 'sm', style = {} }) => {
  const { t } = useTranslation();
  const tiers = getTiers(t);
  const tier = getTier(score, tiers);
  const s    = Number(score || 0);

  if (size === 'xs') return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:3,
      fontSize:11, fontWeight:700, color:tier.color,
      backgroundColor:tier.bg, padding:'2px 7px', borderRadius:100, ...style }}>
      {tier.icon} {s}
    </span>
  );

  if (size === 'sm') return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4,
      fontSize:11, fontWeight:700, color:tier.color,
      backgroundColor:tier.bg, padding:'3px 9px', borderRadius:100, ...style }}>
      {tier.icon} {tier.name}
    </span>
  );

  // md
  return (
    <div style={{ backgroundColor:tier.bg, borderRadius:12,
      padding:'10px 14px', textAlign:'center', ...style }}>
      <div style={{ fontSize:24 }}>{tier.icon}</div>
      <div style={{ fontSize:18, fontWeight:900, color:tier.color, lineHeight:1 }}>{s}</div>
      <div style={{ fontSize:10, color:tier.color, fontWeight:700, marginTop:2 }}>{tier.name}</div>
    </div>
  );
};

export default ReputationBadge;