/**
 * S0 — provider IMPLEMENTATION and provider ACTIVATION are separate
 * concerns (explicit correction before implementation authorization).
 * PAYMENTS_ENABLED_PROVIDERS defaults to EMPTY: a provider adapter existing
 * in code never by itself makes it usable for a real checkout. Render
 * configuration must explicitly opt a provider in, e.g.
 * PAYMENTS_ENABLED_PROVIDERS=clickpesa or PAYMENTS_ENABLED_PROVIDERS=clickpesa,selcom.
 */
export function getEnabledProviders(): Set<string> {
  const raw = process.env.PAYMENTS_ENABLED_PROVIDERS || '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isProviderEnabled(provider: string): boolean {
  return getEnabledProviders().has(provider.toLowerCase());
}
