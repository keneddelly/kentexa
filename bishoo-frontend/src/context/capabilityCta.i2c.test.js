import { capabilityCtaState, CTA_STATE } from './capabilityTiles';
import { applyErrorKey } from '../public/pages/BecomeBusinessCapability';

const app = (id, capabilityCode, status) => ({ application: { id, capabilityCode, status } });

test('no application and no active capability → Start', () => {
  expect(capabilityCtaState('commerce', [{ capabilities: [] }], [])).toBe(CTA_STATE.START);
});

test('already-active capability for THIS Business → no CTA (active)', () => {
  expect(capabilityCtaState('commerce', [{ capabilities: ['commerce'] }], [])).toBe(CTA_STATE.ACTIVE);
});

test('pending application is inert, never a second Start', () => {
  expect(capabilityCtaState('commerce', [{ capabilities: [] }], [app(2, 'commerce', 'pending')])).toBe(CTA_STATE.PENDING);
});

test('the latest application decides: rejected → apply again; older rejected then newer pending → pending', () => {
  expect(capabilityCtaState('service', [{ capabilities: [] }], [app(1, 'service', 'rejected')])).toBe(CTA_STATE.REJECTED);
  expect(capabilityCtaState('service', [{ capabilities: [] }], [app(1, 'service', 'rejected'), app(2, 'service', 'pending')])).toBe(CTA_STATE.PENDING);
});

test('another capability\'s application never changes this capability\'s CTA', () => {
  expect(capabilityCtaState('transport', [{ capabilities: [] }], [app(1, 'commerce', 'pending')])).toBe(CTA_STATE.START);
});

test('a legacy/personal role can never make a Business look activated (state uses only this Business\'s server reports)', () => {
  expect(capabilityCtaState('commerce', [{ capabilities: [] }], [])).toBe(CTA_STATE.START);
});

test('server activation errors map to natural messages, never internals', () => {
  const err = (code) => ({ response: { data: { code } } });
  expect(applyErrorKey(err('ACTIVATION_CONTEXT_MISMATCH'))).toBe('apply_capability.mismatch');
  expect(applyErrorKey(err('ACTIVATION_IDENTITY_MISMATCH'))).toBe('apply_capability.mismatch');
  expect(applyErrorKey(err('CAPABILITY_APPLICATION_ALREADY_PENDING'))).toBe('apply_capability.already_pending');
  expect(applyErrorKey(err('VERIFICATION_REQUIRED'))).toBe('apply_capability.verification_required');
  expect(applyErrorKey({})).toBe('apply_capability.submit_failed');
});
