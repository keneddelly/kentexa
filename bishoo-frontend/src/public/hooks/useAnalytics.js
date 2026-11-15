import { useEffect, useRef, useCallback } from 'react';
import api from '../../api/api';
import { API_BASE_URL } from '../../api/baseUrl';

/**
 * useAnalytics — KenteXa self-hosted analytics hook
 *
 * Auto-tracks:
 * - Page views (every page change)
 * - Clicks on elements marked data-track (issue #361: no longer every tap, which sent the
 *   button's own text and used up the API's request limits)
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
// Issue #361: one call every 10 seconds (or every 20 events) to /analytics/events, instead of
// one call per event, so tracking never uses up the API's request limits.
export const FLUSH_MS = 10000;
export const FLUSH_AT = 20;
let eventQueue = [];
let flushTimer = null;

export const flushEvents = async () => {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (eventQueue.length === 0) return;
  const batch = eventQueue.splice(0, 50);
  try {
    await api.post('/analytics/events', { events: batch });
  } catch {
    // Silently fail — never break the app for analytics
  }
  if (eventQueue.length) flushTimer = setTimeout(flushEvents, FLUSH_MS);
};

/** The page is going away: send what is left with keepalive, to the API (not the site). */
export const flushOnLeave = () => {
  if (eventQueue.length === 0 || typeof fetch !== 'function') return;
  const batch = eventQueue.splice(0, 50);
  try {
    fetch(`${API_BASE_URL}/analytics/events`, {
      method: 'POST', keepalive: true, credentials: 'omit',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: batch }),
    }).catch(() => {});
  } catch { /* never break the app for analytics */ }
};

export const queueEvent = (event) => {
  eventQueue.push(event);
  if (eventQueue.length >= FLUSH_AT) { flushEvents(); return; }
  if (!flushTimer) flushTimer = setTimeout(flushEvents, FLUSH_MS);
};

export const __resetAnalyticsQueueForTests = () => {
  eventQueue = [];
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
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
      // Only elements marked data-track: their label is chosen by us, never typed text.
      const button = el?.closest ? el.closest('[data-track]') : null;
      if (!button) return;
      const label  = button.getAttribute('data-track').slice(0, 60);

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

  // ── Flush when the page is hidden or closed ─────────────────────────────
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushOnLeave(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flushOnLeave);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flushOnLeave);
    };
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

export const trackProfileView = (track, profile) => {
  track('profile_view', {
    eventCategory: 'profile',
    targetId:      String(profile.id),
    targetType:    'profile',
    targetName:    profile.displayName,
  });
};

export const trackSearch = (track, query, resultCount, extraMetadata = {}) => {
  track('search', {
    eventCategory: 'search',
    targetName:    query,
    metadata:      { resultCount, ...extraMetadata },
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