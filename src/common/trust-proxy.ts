/**
 * Issue #361: how many proxy hops in front of the app to trust, so req.ip is the phone's own
 * address. Confirmed on live 2026-11-16 (GET /version/request-source): a request passes
 * Cloudflare, then Render's load balancer — x-forwarded-for "197.186.16.6, 172.71.150.51"
 * with cf-connecting-ip 197.186.16.6. Two hops: req.ip is the address Cloudflare itself saw,
 * which a phone cannot forge (anything a phone writes in the header sits further left).
 * A whole number 0-5 from TRUST_PROXY_HOPS, default 2.
 */
export const DEFAULT_TRUST_PROXY_HOPS = 2;

export function trustProxyHops(raw: string | undefined): number {
  const n = Number(raw);
  return raw !== undefined && raw !== '' && Number.isInteger(n) && n >= 0 && n <= 5 ? n : DEFAULT_TRUST_PROXY_HOPS;
}

/**
 * How the server sees ONE request: the caller's own addresses only (like any "what is my IP"
 * page), used to confirm TRUST_PROXY_HOPS on live. Nothing about anyone else.
 */
export function describeRequestSource(req: any) {
  const h = req?.headers || {};
  const one = (v: unknown) => (typeof v === 'string' ? v.slice(0, 300) : null);
  return {
    ip: req?.ip ?? null,
    ips: Array.isArray(req?.ips) ? req.ips : [],
    remoteAddress: req?.socket?.remoteAddress ?? null,
    xForwardedFor: one(h['x-forwarded-for']),
    cfConnectingIp: one(h['cf-connecting-ip']),
    trueClientIp: one(h['true-client-ip']),
    xRealIp: one(h['x-real-ip']),
    trustProxyHops: req?.app?.get?.('trust proxy') ?? null,
  };
}
