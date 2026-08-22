import React from 'react';
import { useTranslation } from 'react-i18next';
import { KENTEXA_SUPPORT } from '../utils/whatsapp-link';

const Footer = ({ onNavigate }) => {
  const { t } = useTranslation();
  return (
    <footer style={{ backgroundColor: '#0f172a', color: '#94a3b8', marginTop: 'auto' }}>

      {/* Main footer */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 16px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 24 }}>

        {/* Brand */}
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 0, marginBottom: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#fff', fontFamily: 'Manrope,sans-serif' }}>Kente</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#3b82f6', fontFamily: 'Manrope,sans-serif' }}>Xa</span>
          </div>
          <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.7, margin: '0 0 12px' }}>
            {t('footer.tagline')}
          </p>
          <div style={{ fontSize: 11, color: '#475569' }}>{t('footer.made_in_tanzania')}</div>
        </div>

        {/* Marketplace */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#fff', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>{t('footer.marketplace_title')}</div>
          {[
            { label: t('footer.link_browse_stores'), page: 'Stores' },
            { label: t('footer.link_classifieds'), page: 'ClassifiedsPublic' },
            { label: t('footer.link_all_listings'), page: 'Listings' },
            { label: t('footer.link_pay_invoice'), page: 'PayInvoice' },
            { label: t('footer.link_track_parcel'), page: 'TrackParcel' },
          ].map(l => (
            <div key={l.page} onClick={() => onNavigate(l.page)}
              style={{ fontSize: 13, color: '#64748b', marginBottom: 8, cursor: 'pointer', transition: 'color 0.2s' }}
              onMouseEnter={e => e.target.style.color = '#fff'}
              onMouseLeave={e => e.target.style.color = '#64748b'}>
              {l.label}
            </div>
          ))}
        </div>

        {/* Sellers & Agents */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#fff', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>{t('footer.sell_earn_title')}</div>
          {[
            { label: t('footer.link_become_seller'), page: 'BecomeSeller' },
            { label: t('footer.link_become_agent'), page: 'BecomeAgent' },
            { label: t('footer.link_become_super_agent'), page: 'BecomeSuperAgentInfo' },
            { label: t('footer.link_seller_dashboard'), page: 'SellerDashboard' },
            { label: t('footer.link_agent_dashboard'), page: 'AgentDashboard' },
          ].map(l => (
            <div key={l.page} onClick={() => onNavigate(l.page)}
              style={{ fontSize: 13, color: '#64748b', marginBottom: 8, cursor: 'pointer' }}
              onMouseEnter={e => e.target.style.color = '#fff'}
              onMouseLeave={e => e.target.style.color = '#64748b'}>
              {l.label}
            </div>
          ))}
        </div>

        {/* Company */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#fff', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>{t('footer.company_title')}</div>
          {[
            { label: t('footer.link_about_us'), page: 'AboutUs' },
            { label: t('footer.link_how_it_works'), page: 'HowItWorks' },
            { label: t('footer.link_terms'), page: 'Terms' },
            { label: t('footer.link_privacy'), page: 'Privacy' },
            { label: t('footer.link_contact_us'), page: 'ContactUs' },
          ].map(l => (
            <div key={l.page} onClick={() => onNavigate(l.page)}
              style={{ fontSize: 13, color: '#64748b', marginBottom: 8, cursor: 'pointer' }}
              onMouseEnter={e => e.target.style.color = '#fff'}
              onMouseLeave={e => e.target.style.color = '#64748b'}>
              {l.label}
            </div>
          ))}
        </div>

        {/* Contact */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#fff', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>{t('footer.contact_title')}</div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>📧 support@kentexa.com</div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>🌐 kentexa.com</div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>{t('footer.contact_company')}</div>
          {/* Social */}
          <div style={{ display: 'flex', gap: 10 }}>
            <a href={`https://wa.me/${KENTEXA_SUPPORT}`} target="_blank" rel="noreferrer"
              style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, textDecoration: 'none' }}>💬</a>
            <a href="mailto:support@kentexa.com"
              style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, textDecoration: 'none' }}>📧</a>
          </div>
        </div>
      </div>

      {/* Payment badges */}
      <div style={{ borderTop: '1px solid #1e293b', padding: '16px', textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: '#475569', marginBottom: 10 }}>{t('footer.accepted_payments')}</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
          {['📱 M-Pesa', '📱 Airtel', '📱 Tigo', '📱 HaloPesa', '🤝 Agent'].map(p => (
            <span key={p} style={{ fontSize: 11, backgroundColor: '#1e293b', color: '#94a3b8', padding: '4px 10px', borderRadius: 6, fontWeight: 600 }}>{p}</span>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ borderTop: '1px solid #1e293b', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 12, color: '#475569' }}>
          {t('footer.copyright')}
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <span onClick={() => onNavigate('Terms')} style={{ fontSize: 12, color: '#475569', cursor: 'pointer' }}>{t('footer.bottom_terms')}</span>
          <span onClick={() => onNavigate('Privacy')} style={{ fontSize: 12, color: '#475569', cursor: 'pointer' }}>{t('footer.bottom_privacy')}</span>
          <span onClick={() => onNavigate('AboutUs')} style={{ fontSize: 12, color: '#475569', cursor: 'pointer' }}>{t('footer.bottom_about')}</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;