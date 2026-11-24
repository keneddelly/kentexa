import { API_URL } from '../config';
import { tokens } from './tokens';

/**
 * The app's one way to talk to the KenteXa server (#422 N0). Every request says it is the app
 * (x-kentexa-client: app), so the server returns the refresh credential in a header instead of a
 * browser cookie. A 401 renews the access token once and repeats the request.
 */
export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: unknown) { super(message); }
}

type Opts = { method?: string; body?: unknown; params?: Record<string, string | number | undefined>; auth?: boolean };

let onSignedOut: (() => void) | null = null;
export const setSignedOutHandler = (fn: () => void) => { onSignedOut = fn; };

const buildUrl = (path: string, params?: Opts['params']) => {
  const q = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
  return `${API_URL}${path}${q ? `?${q}` : ''}`;
};

const keepRefresh = async (res: Response) => {
  const next = res.headers.get('x-kentexa-refresh');
  if (next) await tokens.setRefresh(next);
};

const messageOf = (data: any, status: number) => {
  const m = data?.message;
  if (Array.isArray(m)) return m.join(', ');
  if (typeof m === 'string' && m) return m;
  return status >= 500 ? 'Seva haipatikani kwa sasa. Jaribu tena.' : 'Imeshindikana.';
};

let refreshing: Promise<boolean> | null = null;
export const renew = (): Promise<boolean> => {
  if (!refreshing) {
    refreshing = (async () => {
      const credential = await tokens.refresh();
      if (!credential) return false;
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-kentexa-client': 'app', 'x-kentexa-refresh': credential },
          body: '{}',
        });
        if (!res.ok) return false;
        await keepRefresh(res);
        const data: any = await res.json().catch(() => ({}));
        if (!data?.accessToken) return false;
        await tokens.setAccess(data.accessToken);
        return true;
      } catch { return false; }
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
};

export async function request<T = any>(path: string, opts: Opts = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', 'x-kentexa-client': 'app' };
  // Photo uploads send a FormData body: the phone sets its own multipart header, and the body is not re-encoded.
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  if (opts.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (tokens.access) headers.Authorization = `Bearer ${tokens.access}`;
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.params), {
      method: opts.method || 'GET',
      headers,
      body: opts.body === undefined ? undefined : isForm ? (opts.body as any) : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError(0, 'Hakuna mtandao. Angalia intaneti yako.');
  }
  await keepRefresh(res);
  if (res.status === 401 && tokens.access && !retried) {
    if (await renew()) return request<T>(path, opts, true);
    await tokens.clear();
    onSignedOut?.();
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new ApiError(res.status, messageOf(data, res.status), data);
  return data as T;
}

export const api = {
  get: <T = any>(path: string, params?: Opts['params']) => request<T>(path, { params }),
  post: <T = any>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ?? {} }),
};
