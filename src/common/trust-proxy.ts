/**
 * Issue #361: how many proxy hops in front of the app to trust (Render's load balancer = 1),
 * so req.ip is the address that reached Render. A whole number 0-5 from TRUST_PROXY_HOPS,
 * default 1.
 */
export function trustProxyHops(raw: string | undefined): number {
  const n = Number(raw);
  return raw !== undefined && raw !== '' && Number.isInteger(n) && n >= 0 && n <= 5 ? n : 1;
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
