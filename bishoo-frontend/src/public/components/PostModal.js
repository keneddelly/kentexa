/**
 * PostModal.js — Context-aware ➕ posting modal
 * Place at: src/public/components/PostModal.js
 *
 * Shows role-aware posting options when user taps ➕
 * One person, one button, all their capabilities
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

const PostModal = ({ onNavigate, onClose, currentUser, userRole, onOpenMoment }) => {
  const { t } = useTranslation();
  const role = userRole || currentUser?.role || 'user';
  const isSeller = ['seller', 'admin', 'manager'].includes(role);
  const [showListChoice, setShowListChoice] = useState(false);

  // Build action list based on roles
  const actions = [
    // Moments — open to every user, drives daily engagement.
    // One tile only: the modal itself has a Selling / Looking For toggle inside.
    {
      icon: '📸',
      title: t('post_modal.action_moment_title'),
      sub: t('post_modal.action_moment_sub'),
      mode: 'selling',
      color: '#EFF6FF',
      accent: '#2563EB',
      roles: ['all'],
    },
    // Everyone can list something — sellers get an extra choice (see below)
    {
      icon: '🏷️',
      title: t('post_modal.action_listing_title'),
      sub: isSeller
        ? t('post_modal.action_listing_sub_seller')
        : t('post_modal.action_listing_sub_buyer'),
      key: 'list',
      color: '#F5F3FF',
      accent: '#7C3AED',
      roles: ['all'],
    },
    // Everyone can offer a service
    {
      icon: '🔧',
      title: t('post_modal.action_service_title'),
      sub: t('post_modal.action_service_sub'),
      page: 'PostService',
      color: '#F0FDF4',
      accent: '#16A34A',
      roles: ['all'],
    },
    // Sellers post to followers
    {
      icon: '📢',
      title: t('post_modal.action_update_title'),
      sub: t('post_modal.action_update_sub'),
      page: 'CommerceProfile',
      color: '#FFF7ED',
      accent: '#EA580C',
      roles: ['seller', 'admin', 'manager'],
    },
    // Agents toggle availability
    {
      icon: '🏍️',
      title: t('post_modal.action_online_title'),
      sub: t('post_modal.action_online_sub'),
      page: 'AgentDashboard',
      color: '#FDF2F8',
      accent: '#A21CAF',
      roles: ['agent'],
    },
    // Transport providers publish availability
    {
      icon: '🚌',
      title: t('post_modal.action_route_title'),
      sub: t('post_modal.action_route_sub'),
      page: 'TransportProviderDashboard',
      color: '#FEF3C7',
      accent: '#D97706',
      roles: ['transport_provider'],
    },
    // Sellers and super agents create shipments
    {
      icon: '📦',
      title: t('post_modal.action_shipment_title'),
      sub: t('post_modal.action_shipment_sub'),
      page: 'SellerShipment',
      color: '#F5F3FF',
      accent: '#7C3AED',
      roles: ['seller', 'admin', 'manager', 'super_agent'],
    },
  ];

  // Filter by role
  const visibleActions = actions.filter(a =>
    a.roles.includes('all') ||
    a.roles.includes(role) ||
    (role === 'admin')
  );

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 2000,
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Sheet */}
      <div style={{
        position:        'fixed',
        bottom:          0,
        left:            0,
        right:           0,
        zIndex:          2001,
        backgroundColor: '#fff',
        borderRadius:    '20px 20px 0 0',
        padding:         '20px 20px 40px',
        boxShadow:       '0 -8px 32px rgba(0,0,0,0.15)',
        animation:       'slideUp 0.25s ease',
      }}>
        <style>{`
          @keyframes slideUp {
            from { transform: translateY(100%); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
        `}</style>

        {/* Handle */}
        <div style={{
          width: 36, height: 4, borderRadius: 100,
          backgroundColor: '#e2e8f0', margin: '0 auto 20px',
        }} />

        <div style={{ fontSize: 16, fontWeight: 900, color: '#1e293b', marginBottom: 4 }}>
          {showListChoice ? t('post_modal.header_add_listing') : t('post_modal.header_post')}
        </div>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
          {showListChoice ? t('post_modal.sub_what_listing') : t('post_modal.sub_choose_action')}
        </div>

        {showListChoice ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => { onNavigate('SellerClassifieds'); onClose(); }}
              style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px',
                backgroundColor: '#EFF6FF', borderRadius: 14, border: 'none',
                cursor: 'pointer', textAlign: 'left', width: '100%' }}>
              <span style={{ fontSize: 32, flexShrink: 0 }}>🏷️</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>{t('post_modal.casual_listing_title')}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {t('post_modal.casual_listing_desc')}
                </div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="#2563EB" strokeWidth="2.5" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                <polyline points="9,18 15,12 9,6"/>
              </svg>
            </button>
            <button
              onClick={() => { onNavigate('SellerProducts'); onClose(); }}
              style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px',
                backgroundColor: '#F5F3FF', borderRadius: 14, border: 'none',
                cursor: 'pointer', textAlign: 'left', width: '100%' }}>
              <span style={{ fontSize: 32, flexShrink: 0 }}>🛍️</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>{t('post_modal.shop_product_title')}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {t('post_modal.shop_product_desc')}
                </div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="#7C3AED" strokeWidth="2.5" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                <polyline points="9,18 15,12 9,6"/>
              </svg>
            </button>
            <button onClick={() => setShowListChoice(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                color: '#64748b', fontSize: 13, fontWeight: 700, padding: '8px 0' }}>
              {t('common.back')}
            </button>
          </div>
        ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visibleActions.map(a => (
            <button
              key={a.page || a.mode || a.key}
              onClick={() => {
                if (a.mode) { onOpenMoment?.(a.mode); onClose(); return; }
                if (a.key === 'list') {
                  if (isSeller) { setShowListChoice(true); return; }
                  onNavigate('SellerClassifieds'); onClose(); return;
                }
                onNavigate(a.page); onClose();
              }}
              style={{
                display:         'flex',
                alignItems:      'center',
                gap:             16,
                padding:         '14px 16px',
                backgroundColor: a.color,
                borderRadius:    14,
                border:          'none',
                cursor:          'pointer',
                textAlign:       'left',
                width:           '100%',
              }}
            >
              <span style={{ fontSize: 32, flexShrink: 0 }}>{a.icon}</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>{a.title}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{a.sub}</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke={a.accent} strokeWidth="2.5" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                <polyline points="9,18 15,12 9,6"/>
              </svg>
            </button>
          ))}
        </div>
        )}
      </div>
    </>
  );
};

export default PostModal;