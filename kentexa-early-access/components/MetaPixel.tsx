'use client';

import Script from 'next/script';

// Pixel IDs aren't secrets — they're meant to sit in public page source, so
// baking in the real default here is fine (unlike an API key). Overridable
// via NEXT_PUBLIC_META_PIXEL_ID on Render if the Pixel ever changes.
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || '2121808898594408';

export default function MetaPixel() {
  if (!PIXEL_ID) return null;

  return (
    <>
      <Script id="meta-pixel-base" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${PIXEL_ID}');
          fbq('track', 'PageView');
        `}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}

/** Fire a Meta Pixel standard event (PageView, CompleteRegistration, ...) from a client component. */
export function trackMetaEvent(event: string, params?: Record<string, unknown>) {
  if (!PIXEL_ID) return;
  if (typeof window === 'undefined') return;
  const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq;
  fbq?.('track', event, params);
}

// Non-standard event names (anything Meta doesn't recognize as one of its
// built-in event types) must go through trackCustom, not track — fbq
// silently no-ops standard-event calls for unrecognized names otherwise.
// Used for 'EarlyAccessRegistration' specifically, so registration
// completions are visible in Ads Manager as their own named event, distinct
// from PageView/LinkClick and from the standard CompleteRegistration event
// fired alongside it.
export function trackMetaCustomEvent(event: string, params?: Record<string, unknown>) {
  if (!PIXEL_ID) return;
  if (typeof window === 'undefined') return;
  const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq;
  fbq?.('trackCustom', event, params);
}
