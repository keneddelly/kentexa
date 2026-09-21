import fs from 'fs';
import path from 'path';
import { evaluateDestination } from './navigationPolicy';
import { destinationForPage, DESTINATIONS } from './destinationRegistry';

const ctx = (page, extra = {}) => evaluateDestination({ page, isAuthenticated: true, roleType: 'buyer', capabilities: [], ...extra });

describe('I2 correction — valid dynamic Business destinations pass the REAL navigation policy', () => {
  test.each([
    'BusinessHome-10',
    'BusinessDashboard-10',
    'BecomeBusinessCapability-10-commerce',
    'BecomeBusinessCapability-10-transport',
    'BecomeBusinessServiceProvider-10',
  ])('%s is allowed (kept as the requested page, not redirected Home)', (page) => {
    const decision = ctx(page);
    expect(decision.allowed).toBe(true);
    expect(decision.page).toBe(page);
  });

  test('they are account destinations: an unauthenticated user is sent to login, never straight in', () => {
    for (const page of ['BusinessDashboard-10', 'BecomeBusinessCapability-10-commerce', 'BecomeBusinessServiceProvider-10']) {
      expect(ctx(page, { isAuthenticated: false })).toMatchObject({ allowed: false, reason: 'AUTHENTICATION_REQUIRED', page: 'PublicLogin' });
    }
  });

  test('a Business context (seller role) reaches them too — account destinations are not role-gated', () => {
    expect(ctx('BecomeBusinessCapability-10-commerce', { roleType: 'seller' }).allowed).toBe(true);
    expect(ctx('BusinessDashboard-10', { roleType: 'service_provider' }).allowed).toBe(true);
  });
});

describe('I2 correction — destination validation stays strict (no broad wildcard)', () => {
  test.each([
    'BecomeBusinessCapability',
    'BecomeBusinessCapability-',
    'BecomeBusinessCapability-commerce',
    'BecomeBusinessCapability-abc-commerce',
    'BecomeBusinessCapability-10-service',
    'BecomeBusinessCapability-10-super_agent',
    'BecomeBusinessCapability-10-cargo',
    'BecomeBusinessCapability-10-commerce-extra',
    'BecomeBusinessCapability-10-commerce/../Admin',
    'BecomeBusinessCapabilityX-10-commerce',
    'BecomeBusinessServiceProvider',
    'BecomeBusinessServiceProvider-',
    'BecomeBusinessServiceProvider-abc',
    'BecomeBusinessServiceProvider-10-1',
    'BusinessDashboard-',
    'BusinessDashboard-abc',
    'BusinessDashboard-10-1',
    'BusinessDashboard-10/extra',
    'BusinessDashboardX-10',
  ])('%s is still blocked as an unknown destination', (page) => {
    expect(destinationForPage(page)).toBeNull();
    expect(ctx(page)).toMatchObject({ allowed: false, reason: 'UNKNOWN_DESTINATION', page: 'Home' });
  });

  test('dynamic-only destinations are not exposed as bare navigable pages', () => {
    expect(DESTINATIONS.BecomeBusinessCapability).toBeUndefined();
    expect(DESTINATIONS.BecomeBusinessServiceProvider).toBeUndefined();
    expect(DESTINATIONS.BusinessDashboard).toBeDefined(); // the existing bare page, unchanged
  });
});

describe('I2 correction — contract: App dynamic Business routes are represented by the registry', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  const prefixes = [...appSource.matchAll(/page\.startsWith\('(\w*Business\w*)-'\)/g)].map((m) => m[1]);

  test('the I2/B6C routes are all handled by App.js', () => {
    for (const prefix of ['BusinessHome', 'BusinessDashboard', 'BecomeBusinessCapability', 'BecomeBusinessServiceProvider']) {
      expect(prefixes).toContain(prefix);
    }
  });

  test('every Business-family dynamic route App.js handles has a registered, allowed sample destination', () => {
    for (const prefix of new Set(prefixes)) {
      const sample = [`${prefix}-10`, `${prefix}-10-commerce`].find((candidate) => destinationForPage(candidate));
      expect(sample).toBeDefined();
      expect(ctx(sample).allowed).toBe(true);
    }
  });
});
