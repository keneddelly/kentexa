import { getEnabledProviders, isProviderEnabled } from './enabled-providers';

describe('enabled-providers', () => {
  const OLD_ENV = process.env;
  afterEach(() => { process.env = OLD_ENV; });

  it('defaults to EMPTY — implementing a provider adapter never by itself activates it', () => {
    process.env = { ...OLD_ENV, PAYMENTS_ENABLED_PROVIDERS: undefined };
    expect(getEnabledProviders().size).toBe(0);
    expect(isProviderEnabled('clickpesa')).toBe(false);
    expect(isProviderEnabled('selcom')).toBe(false);
  });

  it('an explicit, comma-separated opt-in enables exactly those providers, case-insensitively', () => {
    process.env = { ...OLD_ENV, PAYMENTS_ENABLED_PROVIDERS: 'ClickPesa, selcom' };
    expect(isProviderEnabled('clickpesa')).toBe(true);
    expect(isProviderEnabled('selcom')).toBe(true);
    expect(isProviderEnabled('airtel')).toBe(false);
  });
});
