import { resolveBusinessEntry, BUSINESS_ENTRY } from './businessEntry';
import { ctaDestination, capabilityCtaState, CTA_STATE } from './capabilityTiles';

const wm = { id: 10 };
const el = { id: 11 };
const personal = { identityType: 'PERSONAL', businessId: null };
const asWm = { identityType: 'BUSINESS', businessId: 10 };

test('A/B. explicit selection opens exactly that Business, never the first/oldest', () => {
  expect(resolveBusinessEntry({ activeContext: personal, routeBusinessId: 10, businesses: [el, wm] }))
    .toEqual({ status: BUSINESS_ENTRY.OK, businessId: 10 });
  expect(resolveBusinessEntry({ activeContext: personal, routeBusinessId: 11, businesses: [wm, el] }))
    .toEqual({ status: BUSINESS_ENTRY.OK, businessId: 11 });
});

test('F. Personal context with several Businesses and no selection → chooser, not the first Business', () => {
  expect(resolveBusinessEntry({ activeContext: personal, routeBusinessId: null, businesses: [wm, el] }).status).toBe(BUSINESS_ENTRY.CHOOSE);
});

test('Personal context with exactly one Business → that Business (documented simple UX; no acting-identity change)', () => {
  expect(resolveBusinessEntry({ activeContext: personal, routeBusinessId: null, businesses: [wm] }))
    .toEqual({ status: BUSINESS_ENTRY.OK, businessId: 10 });
});

test('no Business at all → none', () => {
  expect(resolveBusinessEntry({ activeContext: personal, routeBusinessId: null, businesses: [] }).status).toBe(BUSINESS_ENTRY.NONE);
});

test('BUSINESS context, bare entry → the canonical context Business even when another is older', () => {
  expect(resolveBusinessEntry({ activeContext: asWm, routeBusinessId: null, businesses: [el, wm] }))
    .toEqual({ status: BUSINESS_ENTRY.OK, businessId: 10 });
});

test('E. BUSINESS context for Washing Machine TZ vs a Bob Electronics route → mismatch, never silently retargeted', () => {
  expect(resolveBusinessEntry({ activeContext: asWm, routeBusinessId: 11, businesses: [wm, el] }))
    .toEqual({ status: BUSINESS_ENTRY.MISMATCH, routeBusinessId: 11, contextBusinessId: 10 });
});

test('G. a route naming a Business the user does not own is inaccessible', () => {
  expect(resolveBusinessEntry({ activeContext: personal, routeBusinessId: 99, businesses: [wm, el] }).status).toBe(BUSINESS_ENTRY.INACCESSIBLE);
});

test('J. a legacy unbound operational role (PERSONAL identity) never acts as a Business selector', () => {
  const legacySeller = { identityType: 'PERSONAL', businessId: null, roleType: 'seller' };
  expect(resolveBusinessEntry({ activeContext: legacySeller, routeBusinessId: null, businesses: [wm, el] }).status).toBe(BUSINESS_ENTRY.CHOOSE);
});

test('H. the capability CTA destination carries the exact selected Business id, per capability', () => {
  expect(ctaDestination('commerce', 10)).toBe('BecomeBusinessCapability-10-commerce');
  expect(ctaDestination('transport', 11)).toBe('BecomeBusinessCapability-11-transport');
  expect(ctaDestination('service', 10)).toBe('BecomeBusinessServiceProvider-10');
});

test('D. CTA state is Business-local: Selling active on Bob Electronics leaves Washing Machine TZ at Start', () => {
  const electronicsWorkspaces = [{ capabilities: ['commerce'] }];
  const washingMachineWorkspaces = [{ capabilities: [] }];
  expect(capabilityCtaState('commerce', electronicsWorkspaces, [])).toBe(CTA_STATE.ACTIVE);
  expect(capabilityCtaState('commerce', washingMachineWorkspaces, [])).toBe(CTA_STATE.START);
});
