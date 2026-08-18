// Single source of truth for the customer-facing frontend's base URL, used
// to build tracking/confirmation links sent in SMS, email, and webhooks.
// Falls back to the actual live Render URL — not a placeholder domain — so
// links never silently point at an unconfigured custom domain. Once a real
// custom domain (e.g. kentexa.com) is registered and DNS-pointed at the
// frontend, set FRONTEND_URL in the environment; no code change needed.
export const FRONTEND_URL =
  process.env.FRONTEND_URL || 'https://bishoo-frontend.onrender.com';
