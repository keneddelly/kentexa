import { useEffect, useRef, useCallback } from 'react';
import api from '../../api/api';

/**
 * useAnalytics — KenteXa self-hosted analytics hook
 *
 * Auto-tracks:
 * - Page views (every page change)
 * - Clicks (every element clicked)
 * - Scroll depth (25%, 50%, 75%, 100%)
 * - Time on page
 * - Search queries
 * - Product views, cart actions, checkout steps
 * - Order events
 * - Session info (browser, device, screen, referrer, UTM)
 *
 * Usage in App.js:
 *   const { track } = useAnalytics({ page, isLoggedIn, userId });
 *
 * Usage anywhere:
 *   track('product_view', { targetId: '5', targetName: 'Samsung A15', category: 'product' });
 */

// ── Session ID — persists for browser session ──────────────────────────────
const getOrCreateSessionId = () => {
  let id = sessionStorage.getItem('kx_session');
  if (!id) {
    id = 'kx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
    sessionStorage.setItem('kx_session', id);
  }
  return id;
};

// ── Parse UTM params from URL ──────────────────────────────────────────────
const getUTMParams = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    utmSource:   params.get('utm_source'),
    utmMedium:   params.get('utm_medium'),
    utmCampaign: params.get('utm_campaign'),
    utmContent:  params.get('utm_content'),
  };
};

// ── Detect device type ─────────────────────────────────────────────────────
const getDeviceType = () => {
  const ua = navigator.userAgent.toLowerCase();
  if (/tablet|ipad|playbook|silk/.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/.test(ua)) return 'mobile';
  return 'desktop';
};

// ── Get browser info ───────────────────────────────────────────────────────
const getBrowserInfo = () => {
  const ua = navigator.userAgent;
  let browser = 'Unknown', version = '';
  if (ua.includes('Chrome') && !ua.includes('Edg'))    { browser = 'Chrome';  version = ua.match(/Chrome\/([\d.]+)/)?.[1] || ''; }
  else if (ua.includes('Firefox'))                      { browser = 'Firefox'; version = ua.match(/Firefox\/([\d.]+)/)?.[1] || ''; }
  else if (ua.includes('Safari') && !ua.includes('Chrome')) { browser = 'Safari'; version = ua.match(/Version\/([\d.]+)/)?.[1] || ''; }
  else if (ua.includes('Edg'))                          { browser = 'Edge';    version = ua.match(/Edg\/([\d.]+)/)?.[1] || ''; }
  else if (ua.includes('OPR') || ua.includes('Opera')) { browser = 'Opera';   version = ua.match(/OPR\/([\d.]+)/)?.[1] || ''; }
  return { browser, browserVersion: version };
};

// ── Get OS info ────────────────────────────────────────────────────────────
const getOS = () => {
  const ua = navigator.userAgent;
  if (ua.includes('Windows'))       return 'Windows';
  if (ua.includes('Mac OS'))        return 'macOS';
  if (ua.includes('Android'))       return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  if (ua.includes('Linux'))         return 'Linux';
  return 'Unknown';
};

// ── Batch events to avoid hammering the server ─────────────────────────────
let eventQueue = [];
let flushTimer = null;

const flushEvents = async () => {
  if (eventQueue.length === 0) return;
  const batch = [...eventQueue];
  eventQueue = [];
  try {
    // Send each event (could batch in future)
    for (const event of batch) {
      await api.post('/analytics/event', event);
    }
  } catch {
    // Silently fail — never break the app for analytics
  }
};

const queueEvent = (event) => {
  eventQueue.push(event);
  if (flushTimer) clearTimeout(flushTimer);
  // Flush after 2 seconds of inactivity, or immediately if queue > 10
  if (eventQueue.length >= 10) {
    flushEvents();
  } else {
    flushTimer = setTimeout(flushEvents, 2000);
  }
};

// ── Main hook ──────────────────────────────────────────────────────────────
export const useAnalytics = ({ page, isLoggedIn, userId } = {}) => {
  const sessionId        = useRef(getOrCreateSessionId());
  const sessionInitiated = useRef(false);
  const pageStartTime    = useRef(Date.now());
  const scrollDepths     = useRef(new Set());
  const clickHandler     = useRef(null);
  const scrollHandler    = useRef(null);

  // ── Build base event ────────────────────────────────────────────────────
  const buildEvent = useCallback((eventType, extra = {}) => ({
    sessionId: sessionId.current,
    userId:    isLoggedIn ? userId : null,
    eventType,
    page,
    pageUrl:   window.location.pathname,
    ...extra,
  }), [page, isLoggedIn, userId]);

  // ── Track function (public API) ─────────────────────────────────────────
  const track = useCallback((eventType, extra = {}) => {
    queueEvent(buildEvent(eventType, {
      timeOnPage: Date.now() - pageStartTime.current,
      ...extra,
    }));
  }, [buildEvent]);

  // ── Init session on first use ───────────────────────────────────────────
  useEffect(() => {
    if (sessionInitiated.current) return;
    sessionInitiated.current = true;

    const { browser, browserVersion } = getBrowserInfo();
    const utm = getUTMParams();

    queueEvent(buildEvent('session_start', {
      eventCategory: 'session',
      sessionInfo: {
        browser,
        browserVersion,
        os:           getOS(),
        device:       getDeviceType(),
        screenWidth:  window.screen.width,
        screenHeight: window.screen.height,
        language:     navigator.language,
        timezone:     Intl.DateTimeFormat().resolvedOptions().timeZone,
        referrer:     document.referrer || null,
        ...utm,
      },
      userAgent: navigator.userAgent,
    }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Track page view on page change ─────────────────────────────────────
  useEffect(() => {
    if (!page) return;
    pageStartTime.current = Date.now();
    scrollDepths.current  = new Set();

    queueEvent(buildEvent('page_view', {
      eventCategory: 'navigation',
      eventLabel:    page,
    }));

    return () => {
      // Track time on page when leaving
      const timeSpent = Date.now() - pageStartTime.current;
      if (timeSpent > 1000) { // Only if spent more than 1 second
        queueEvent(buildEvent('page_exit', {
          eventCategory: 'navigation',
          timeOnPage:    timeSpent,
        }));
      }
    };
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Track clicks ────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      const el = e.target;
      // Walk up DOM to find meaningful element
      const button = el.closest('button, a, [data-track]');
      const label  =
        button?.getAttribute('data-track') ||
        button?.innerText?.trim()?.slice(0, 60) ||
        el.innerText?.trim()?.slice(0, 60) ||
        el.getAttribute('aria-label') ||
        el.className?.toString()?.slice(0, 40) ||
        'unknown';

      queueEvent(buildEvent('click', {
        eventCategory: 'interaction',
        eventLabel:    label,
        targetType:    el.tagName?.toLowerCase(),
        clickX:        Math.round(e.clientX),
        clickY:        Math.round(e.clientY),
        timeOnPage:    Date.now() - pageStartTime.current,
      }));
    };

    clickHandler.current = handler;
    document.addEventListener('click', handler, { passive: true });
    return () => document.removeEventListener('click', handler);
  }, [buildEvent]);

  // ── Track scroll depth ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      const scrolled = window.scrollY;
      const total    = document.documentElement.scrollHeight - window.innerHeight;
      if (total <= 0) return;

      const pct = Math.round((scrolled / total) * 100);
      const milestones = [25, 50, 75, 90, 100];

      for (const m of milestones) {
        if (pct >= m && !scrollDepths.current.has(m)) {
          scrollDepths.current.add(m);
          queueEvent(buildEvent('scroll', {
            eventCategory: 'engagement',
            scrollDepth:   m,
            eventLabel:    `${m}%`,
          }));
        }
      }
    };

    scrollHandler.current = handler;
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, [buildEvent]);

  // ── Flush on page unload ────────────────────────────────────────────────
  useEffect(() => {
    const handleUnload = () => {
      // Use sendBeacon for reliability on page close
      if (navigator.sendBeacon && eventQueue.length > 0) {
        const batch = [...eventQueue];
        eventQueue = [];
        // Note: sendBeacon can't use custom headers, so we use a simple fallback
        batch.forEach(event => {
          navigator.sendBeacon('/api/analytics/event', JSON.stringify(event));
        });
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  return { track, sessionId: sessionId.current };
};

// ── Convenience track functions (use anywhere without hook) ───────────────
export const trackProductView = (track, product) => {
  track('product_view', {
    eventCategory: 'product',
    targetId:      String(product.id),
    targetType:    'product',
    targetName:    product.name,
    metadata:      { category: product.category, price: product.displayPrice },
  });
};

export const trackSearch = (track, query, resultCount) => {
  track('search', {
    eventCategory: 'search',
    targetName:    query,
    metadata:      { resultCount },
  });
};

export const trackAddToCart = (track, product) => {
  track('add_to_cart', {
    eventCategory: 'ecommerce',
    targetId:      String(product.id),
    targetType:    'product',
    targetName:    product.name,
    metadata:      { price: product.displayPrice },
  });
};

export const trackCheckoutStart = (track, cartValue) => {
  track('checkout_start', {
    eventCategory: 'ecommerce',
    metadata:      { cartValue },
  });
};

export const trackOrderPlaced = (track, orderId, amount) => {
  track('order_placed', {
    eventCategory: 'ecommerce',
    targetId:      String(orderId),
    targetType:    'order',
    metadata:      { amount },
  });
};

export const trackDeliveryMethodSelected = (track, method, fee) => {
  track('delivery_method_selected', {
    eventCategory: 'checkout',
    eventLabel:    method,
    metadata:      { method, fee },
  });
};

export const trackLogin = (track, userId, role) => {
  track('login', {
    eventCategory: 'auth',
    metadata:      { userId, role },
  });
};

export const trackSellerAction = (track, action, details) => {
  track('seller_action', {
    eventCategory: 'seller',
    eventLabel:    action,
    metadata:      details,
  });
};

export default useAnalytics;