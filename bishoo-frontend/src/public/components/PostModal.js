/**
 * PostModal.js — the "+" sheet: "Unataka kufanya nini?" (owner 2026-10-26).
 *
 * Every create action lives here (the feed no longer carries the four big buttons):
 * Moment, Weka tangazo, Tuma mzigo, Tangaza huduma, Fungua biashara - for everyone.
 * Below them, "Kazi yako": only the jobs of the profile you are ACTING AS (a hub
 * receives and sends, a transport posts routes, an agent goes online), driven by
 * the active commerce profile's type, never the account's role.
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';

const ICON = {
  moment: 'M4 7h3l2-3h6l2 3h3v12H4zM12 17a4 4 0 100-8 4 4 0 000 8z',
  listing: 'M20 12l-8 8-9-9V3h8zM7.5 9a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  shipment: 'M3 16V7h11v9M14 10h4l3 3v3h-7M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z',
  service: 'M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.5-2.5z',
  business: 'M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6',
  product: 'M6 7h12l1 13H5zM9 7a3 3 0 016 0',
  update: 'M4 5h16v11H8l-4 4z',
  down: 'M12 4v14M6 12l6 6 6-6',
  up: 'M12 20V6M6 12l6-6 6 6',
  route: 'M5 19a2 2 0 100-4 2 2 0 000 4zM19 9a2 2 0 100-4 2 2 0 000 4zM7 17h6a4 4 0 004-4V9',
  online: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 3',
};

const Row = ({ icon, title, sub, onClick, accent = true }) => (
  <button type="button" onClick={onClick}
    style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', minHeight: sub ? 64 : 56, padding: '8px 0',
      border: 'none', borderBottom: `1px solid ${LINE}`, background: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: INK }}>
    <span style={{ width: 44, height: 44, borderRadius: 22, flexShrink: 0, background: accent ? '#eff6ff' : '#f7f9f9',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={accent ? '#1d4ed8' : INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icon} /></svg>
    </span>
    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 15, fontWeight: 700 }}>{title}</span>
      {sub && <span style={{ fontSize: 13, color: MUTED }}>{sub}</span>}
    </span>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
  </button>
);

const PostModal = ({ onNavigate, onClose, onOpenMoment, activeProfile }) => {
  const { t } = useTranslation();
  const type = activeProfile?.type || 'personal';
  const isBusiness = type === 'business';
  const [showListChoice, setShowListChoice] = useState(false);
  const go = (page) => { onNavigate(page); onClose(); };

  const main = [
    { key: 'moment', icon: ICON.moment, title: 'Moment', sub: 'Picha au habari ya leo kwa wanaokufuata',
      onClick: () => { onOpenMoment?.('moment'); onClose(); } },
    { key: 'list', icon: ICON.listing, title: t('post_modal.action_listing_title'), sub: 'Uza kitu: picha, bei, mahali',
      onClick: () => { if (isBusiness) { setShowListChoice(true); return; } go('CreateClassified'); } },
    { key: 'ship', icon: ICON.shipment, title: 'Tuma mzigo', sub: 'Ofisi na mawakala wanakuletea bei', onClick: () => go('SendShipment') },
    { key: 'service', icon: ICON.service, title: 'Tangaza huduma', sub: 'Fundi, usafi, ushauri na zaidi', onClick: () => go('PostService') },
    { key: 'business', icon: ICON.business, title: 'Fungua biashara', sub: 'Duka, ofisi au huduma yako kwenye KenteXa', onClick: () => go('BecomeBusiness') },
  ];

  // Only the jobs of the profile you are acting as.
  const ROLE = {
    business: [
      { key: 'update', icon: ICON.update, title: t('post_modal.action_update_title'), onClick: () => go('CommerceProfile') },
      { key: 'sship', icon: ICON.shipment, title: t('post_modal.action_shipment_title'), onClick: () => go('SellerShipment') },
    ],
    hub: [
      { key: 'receive', icon: ICON.down, title: 'Pokea mzigo ofisini', onClick: () => go('HubReceive') },
      { key: 'send', icon: ICON.up, title: 'Tuma shehena', onClick: () => go('SuperAgentParcel') },
    ],
    transport_provider: [{ key: 'route', icon: ICON.route, title: t('post_modal.action_route_title'), onClick: () => go('TransportProviderDashboard') }],
    agent: [{ key: 'online', icon: ICON.online, title: t('post_modal.action_online_title'), onClick: () => go('AgentDashboard') }],
  };
  const roleRows = ROLE[type] || [];

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,20,25,0.4)', zIndex: 2000 }} />
      <div role="dialog" aria-label="Tengeneza" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 2001, backgroundColor: '#fff', color: INK,
        borderRadius: '20px 20px 0 0', padding: '8px 16px max(28px, env(safe-area-inset-bottom))', maxWidth: 560, margin: '0 auto',
        maxHeight: '88vh', overflowY: 'auto', animation: 'slideUp 0.25s ease', boxSizing: 'border-box',
      }}>
        <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
        <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#cfd9de', margin: '0 auto 14px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 20, fontWeight: 800 }}>{showListChoice ? t('post_modal.header_add_listing') : 'Unataka kufanya nini?'}</span>
          <button type="button" aria-label="Funga" onClick={onClose}
            style={{ width: 40, height: 40, borderRadius: 20, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {showListChoice ? (
          <>
            <div style={{ fontSize: 15, color: MUTED, marginBottom: 6 }}>{t('post_modal.sub_what_listing')}</div>
            <Row icon={ICON.listing} title={t('post_modal.casual_listing_title')} sub={t('post_modal.casual_listing_desc')} onClick={() => go('SellerClassifieds')} />
            <Row icon={ICON.product} title={t('post_modal.shop_product_title')} sub={t('post_modal.shop_product_desc')} onClick={() => go('SellerProducts')} />
            <button type="button" onClick={() => setShowListChoice(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 15, padding: '12px 0', fontFamily: 'inherit' }}>
              {t('common.back')}
            </button>
          </>
        ) : (
          <>
            {main.map((a) => <Row key={a.key} icon={a.icon} title={a.title} sub={a.sub} onClick={a.onClick} />)}
            {roleRows.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: MUTED, letterSpacing: '0.04em', margin: '16px 0 2px' }}>KAZI YAKO</div>
                {roleRows.map((a) => <Row key={a.key} icon={a.icon} title={a.title} onClick={a.onClick} accent={false} />)}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
};

export default PostModal;
