/**
 * Issue #361: how many proxy hops in front of the app to trust (Render's load balancer = 1),
 * so req.ip is the address that reached Render. A whole number 0-5 from TRUST_PROXY_HOPS,
 * default 1.
 */
export function trustProxyHops(raw: string | undefined): number {
  const n = Number(raw);
  return raw !== undefined && raw !== '' && Number.isInteger(n) && n >= 0 && n <= 5 ? n : 1;
}
