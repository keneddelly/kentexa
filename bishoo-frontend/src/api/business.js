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
