// Single source of truth for the customer-facing frontend's base URL, used
// to build tracking/confirmation links sent in SMS, email, and webhooks.
// Falls back to the actual live Render URL — not a placeholder domain — so
// links never silently point at an unconfigured custom domain. Once a real
// custom domain (e.g. kentexa.com) is registered and DNS-pointed at the
// frontend, set FRONTEND_URL in the environment; no code change needed.
export const FRONTEND_URL =
  process.env.FRONTEND_URL || 'https://bishoo-frontend.onrender.com';

// Same contract as FRONTEND_URL above, for the backend's own public base
// URL — needed to build absolute links to /uploads/* assets (e.g. in
// share.controller.ts's og:image tags) from contexts that only have a
// relative path stored on the entity.
export const BACKEND_URL =
  process.env.BACKEND_URL || 'https://bishoo-backend.onrender.com';
