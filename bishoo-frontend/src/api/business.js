/**
 * business.js — Business-First Frontend Stage 1 API wrapper.
 *
 * Thin, read-mostly wrappers over the existing Business-First Stage 1
 * backend endpoints. Nothing here asserts authority -- every call is a
 * plain authenticated GET/POST against server-derived data (businessId
 * is only ever used as an opaque route param the server itself
 * ownership-checks, never as a client-side authority claim).
 */
import api from './api';

// GET /business/mine kept untouched/unused here on purpose -- existing
// callers (BusinessDashboard.js, BecomeBusiness.js, RoleActivation.js)
// keep using it directly for backward compatibility during this
// transition; this module only adds the NEW multi-business surface.

export const getMyBusinesses = () => api.get('/business/mine/all').then((res) => (Array.isArray(res.data) ? res.data : []));

export const getBusinessWorkspaces = (businessId) =>
  api.get(`/business/${businessId}/workspaces`).then((res) => (Array.isArray(res.data) ? res.data : []));

export const createBusiness = (dto) => api.post('/business/create', dto).then((res) => res.data);

// B6C — generic Business-capability apply endpoint (already shipped and
// working server-side for commerce/transport/super_agent/service, just
// never called from the frontend until now). `code` is a
// BusinessCapabilityCode string; `applicationData` is optional,
// capability-specific extra input (SERVICE needs none).
export const applyForBusinessCapability = (businessId, code, applicationData) =>
  api.post(`/business/${businessId}/capabilities/${code}/apply`, { applicationData }).then((res) => res.data);

// I2C - application history for ONE Business (membership-scoped server-side);
// drives the Start / Pending / Rejected CTA state.
export const getBusinessCapabilityApplications = (businessId) =>
  api.get(`/business/${businessId}/capability-applications`).then((res) => (Array.isArray(res.data) ? res.data : []));

// I2 legacy-Business transition -- owner-scoped, server-derived options and the explicit
// "start Selling for THIS Business" write. The Business is the route id; the server checks it
// against the caller's authority and canonical context.
export const getSellingConnectionOptions = () =>
  api.get('/business/selling-connection').then((res) => res.data);

export const connectSelling = (businessId) =>
  api.post(`/business/${businessId}/connect-selling`, {}).then((res) => res.data);
