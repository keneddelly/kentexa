import React, { useEffect, useState } from 'react';

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.app.bishoo';
const SESSION_KEY = 'kentexa_native_app_promo_seen';

export default function AndroidAppPromo({ languagePickerOpen, pwaPromptVisible, page }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (languagePickerOpen || pwaPromptVisible || sessionStorage.getItem(SESSION_KEY)) return undefined;

    const ua = navigator.userAgent || '';
    const isAndroidChrome = /Android/i.test(ua) && /Chrome\//i.test(ua) &&
      !/EdgA|OPR|SamsungBrowser|Firefox|CriOS/i.test(ua);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    const publicPage = page === 'Home' ||
      /^(AboutUs|ContactUs|HowItWorks|Privacy|PrivacyPolicy|Terms|TermsAndConditions|FlashSales|PickupPoints|Listings|Stores|ClassifiedsPublic|Services|BecomeSeller|BecomeSellerInfo|BecomeAgent|BecomeSuperAgentInfo|VerifyReceipt|PayInvoice)$/.test(page) ||
      /^(ProductDetail|ClassifiedDetail|ServiceDetail|TrackParcel|TrackOrder|Search|Category)-/.test(page);

    if (!isAndroidChrome || isStandalone || !publicPage) return undefined;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      // Best-effort only: Android requires a verified Digital Asset Links
      // association before Chrome can reliably report an installed native app.
      if (typeof navigator.getInstalledRelatedApps === 'function') {
        try {
          const apps = await navigator.getInstalledRelatedApps();
          if (cancelled || apps.some(app => app.id === 'com.app.bishoo')) return;
        } catch (_) {
          // Continue with the promotion if the browser cannot perform this check.
        }
      }
      if (cancelled || sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, '1');
      setVisible(true);
    }, 10000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [languagePickerOpen, pwaPromptVisible, page]);

  if (!visible) return null;

  const language = localStorage.getItem('kentexa_lang') || 'sw';
  const isEnglish = language === 'en';
  const title = isEnglish ? 'Take KenteXa with you' : 'Beba KenteXa kila mahali';
  const description = isEnglish
    ? 'Shop, connect with businesses, resell products and track parcels directly from the KenteXa app.'
    : 'Nunua, ungana na biashara, uza tena upate faida na fuatilia mizigo kupitia app ya KenteXa.';
  const install = isEnglish ? 'Get it on Google Play' : 'Pakua Google Play';
  const later = isEnglish ? 'Maybe later' : 'Labda baadaye';

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="kentexa-app-promo-title"
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(3, 7, 18, .72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380, borderRadius: 24, overflow: 'hidden',
        background: '#fff', boxShadow: '0 24px 80px rgba(0,0,0,.38)', textAlign: 'center' }}>
        <div style={{ padding: '28px 24px 24px', color: '#fff',
          background: 'linear-gradient(145deg, #07152f 0%, #123f91 58%, #1672e8 100%)' }}>
          <img src="/icons/icon-192x192.png" alt="KenteXa" width="76" height="76"
            style={{ borderRadius: 19, objectFit: 'cover', background: '#fff', padding: 5 }} />
          <div style={{ marginTop: 13, fontSize: 12, letterSpacing: 2, fontWeight: 800, opacity: .82 }}>
            KENTEXA
          </div>
          <h2 id="kentexa-app-promo-title" style={{ margin: '8px 0 0', fontSize: 23,
            lineHeight: 1.2, fontWeight: 900 }}>{title}</h2>
        </div>
        <div style={{ padding: '22px 24px 24px' }}>
          <p style={{ margin: '0 0 22px', color: '#475569', fontSize: 15, lineHeight: 1.55 }}>
            {description}
          </p>
          <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer"
            style={{ display: 'block', padding: '15px 18px', borderRadius: 13,
              background: '#1459c7', color: '#fff', textDecoration: 'none',
              fontSize: 15, fontWeight: 800 }}>
            {install}
          </a>
          <button type="button" onClick={() => setVisible(false)}
            style={{ marginTop: 13, padding: 10, border: 0, background: 'transparent',
              color: '#64748b', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            {later}
          </button>
        </div>
      </div>
    </div>
  );
}
