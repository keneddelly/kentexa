import type {
  AdminStats,
  CategoriesResponse,
  LocationSearchResult,
  LoginResponse,
  NestErrorBody,
  PaginatedRegistrations,
  PublicStats,
  QuickRegistrationPayload,
  Registration,
  RegistrationListFilters,
  RegistrationPayload,
  RegionOption,
  UploadResponse,
} from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const ADMIN_TOKEN_KEY = 'kentexa_ea_admin_token';
export const ADMIN_USER_KEY = 'kentexa_ea_admin_user';

/** Typed error thrown for any non-2xx API response. */
export class ApiError extends Error {
  statusCode: number;
  messages: string[];
  errorType?: string;

  constructor(statusCode: number, body: Partial<NestErrorBody> | null, fallbackMessage: string) {
    const messages = body?.message
      ? Array.isArray(body.message)
        ? body.message
        : [body.message]
      : [fallbackMessage];
    super(messages.join(' '));
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.messages = messages;
    this.errorType = body?.error;
  }
}

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ADMIN_TOKEN_KEY);
  window.localStorage.removeItem(ADMIN_USER_KEY);
}

interface RequestOptions extends RequestInit {
  auth?: boolean;
  isForm?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = false, isForm = false, headers, ...rest } = options;

  const finalHeaders: Record<string, string> = {
    ...(isForm ? {} : { 'Content-Type': 'application/json' }),
    ...(headers as Record<string, string> | undefined),
  };

  if (auth) {
    const token = getAdminToken();
    if (token) {
      finalHeaders['Authorization'] = `Bearer ${token}`;
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: finalHeaders,
    });
  } catch (err) {
    throw new ApiError(0, null, 'Network error — could not reach the server. Please check your connection.');
  }

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const body = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    if (response.status === 429) {
      throw new ApiError(429, body, 'Too many requests. Please try again later.');
    }
    if (response.status === 403) {
      throw new ApiError(403, body, 'You are not authorized to perform this action.');
    }
    throw new ApiError(response.status, body, `Request failed with status ${response.status}.`);
  }

  return body as T;
}

async function requestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  const { auth = false, headers, ...rest } = options;
  const finalHeaders: Record<string, string> = { ...(headers as Record<string, string> | undefined) };

  if (auth) {
    const token = getAdminToken();
    if (token) {
      finalHeaders['Authorization'] = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...rest, headers: finalHeaders });

  if (!response.ok) {
    let body: Partial<NestErrorBody> | null = null;
    try {
      body = await response.json();
    } catch {
      // ignore — not JSON
    }
    throw new ApiError(response.status, body, `Export failed with status ${response.status}.`);
  }

  return response.blob();
}

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Public endpoints
// ---------------------------------------------------------------------------

export function registerBusiness(payload: RegistrationPayload): Promise<Registration & { earlyAccessId: string }> {
  return request('/early-access/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function quickRegister(
  payload: QuickRegistrationPayload,
): Promise<Registration & { earlyAccessId: string }> {
  return request('/early-access/quick-register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function uploadFiles(files: File[]): Promise<UploadResponse> {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  return request<UploadResponse>('/early-access/upload', {
    method: 'POST',
    body: formData,
    isForm: true,
  });
}

export function getCategories(): Promise<CategoriesResponse> {
  return request('/early-access/categories');
}

export function searchLocations(q: string): Promise<LocationSearchResult[]> {
  return request(`/locations/search?q=${encodeURIComponent(q)}`);
}

export function getRegions(): Promise<RegionOption[]> {
  return request('/locations/regions');
}

export function sendPhoneOtp(phone: string): Promise<{ message: string; otpSent: boolean; devOtp?: string }> {
  return request('/early-access/phone/send-otp', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export function verifyPhoneOtp(phone: string, otp: string): Promise<{ message: string; verified: boolean }> {
  return request('/early-access/phone/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ phone, otp }),
  });
}

export function getPublicStats(): Promise<PublicStats> {
  return request('/early-access/stats/public');
}

// ---------------------------------------------------------------------------
// Admin auth (main Kentexa backend — not part of the early-access module)
// ---------------------------------------------------------------------------

export function adminLogin(identifier: string, password: string): Promise<LoginResponse> {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  });
}

// ---------------------------------------------------------------------------
// Admin endpoints (require bearer token)
// ---------------------------------------------------------------------------

export function listRegistrations(filters: RegistrationListFilters): Promise<PaginatedRegistrations> {
  const qs = buildQueryString({
    page: filters.page,
    limit: filters.limit,
    accountType: filters.accountType,
    region: filters.region,
    businessCategory: filters.businessCategory,
    status: filters.status,
    search: filters.search,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
  });
  return request(`/early-access/admin${qs}`, { auth: true });
}

export function getRegistration(id: number | string): Promise<Registration> {
  return request(`/early-access/admin/${id}`, { auth: true });
}

export function approveRegistration(id: number | string): Promise<Registration> {
  return request(`/early-access/admin/${id}/approve`, { method: 'PATCH', auth: true });
}

export function rejectRegistration(id: number | string, rejectionReason: string): Promise<Registration> {
  return request(`/early-access/admin/${id}/reject`, {
    method: 'PATCH',
    auth: true,
    body: JSON.stringify({ rejectionReason }),
  });
}

export function deleteRegistration(id: number | string): Promise<{ message: string }> {
  return request(`/early-access/admin/${id}`, { method: 'DELETE', auth: true });
}

export function getAdminStats(): Promise<AdminStats> {
  return request('/early-access/admin/stats', { auth: true });
}

export async function exportCsv(filters: RegistrationListFilters): Promise<void> {
  const qs = buildQueryString({
    accountType: filters.accountType,
    region: filters.region,
    businessCategory: filters.businessCategory,
    status: filters.status,
    search: filters.search,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
  });
  const blob = await requestBlob(`/early-access/admin/export/csv${qs}`, { auth: true });
  triggerBlobDownload(blob, `kentexa-early-access-${Date.now()}.csv`);
}

export async function exportExcel(filters: RegistrationListFilters): Promise<void> {
  const qs = buildQueryString({
    accountType: filters.accountType,
    region: filters.region,
    businessCategory: filters.businessCategory,
    status: filters.status,
    search: filters.search,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
  });
  const blob = await requestBlob(`/early-access/admin/export/excel${qs}`, { auth: true });
  triggerBlobDownload(blob, `kentexa-early-access-${Date.now()}.xlsx`);
}
