import { unavailableNotice } from './unavailableNotice';

// Owner 2026-11-09 audit: a page that cannot open must say why, not jump to Home silently.
test('says why a page did not open', () => {
  expect(unavailableNotice({ allowed: false, reason: 'WRONG_CONTEXT', destination: { roles: ['seller'] } }))
    .toEqual({ text: 'Ukurasa huu ni wa kazi ya Muuzaji. Badilisha kazi, kisha uufungue tena.', canSwitch: true });
  expect(unavailableNotice({ allowed: false, reason: 'WRONG_CONTEXT', destination: { roles: ['seller', 'super_agent'] } }).text).toContain('Muuzaji au Ofisi');
  expect(unavailableNotice({ allowed: false, reason: 'UNKNOWN_DESTINATION' }).canSwitch).toBe(false);
  expect(unavailableNotice({ allowed: false, reason: 'AUTHENTICATION_REQUIRED' })).toBeNull();
  expect(unavailableNotice({ allowed: true })).toBeNull();
});
