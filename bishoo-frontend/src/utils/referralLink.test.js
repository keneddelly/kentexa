import { rememberReferral, referralCode, forgetReferral } from './referralLink';

test('a link opened earlier is kept until registration; the current URL wins; bad codes are ignored', () => {
  forgetReferral();
  expect(referralCode('')).toBe('');
  expect(rememberReferral('?ref=K1A2B3C')).toBe('K1A2B3C');
  expect(referralCode('')).toBe('K1A2B3C');
  expect(referralCode('?ref=KTX-SA-12')).toBe('KTX-SA-12');
  expect(rememberReferral('?ref=%3Cscript%3E')).toBeNull();
  expect(referralCode('')).toBe('K1A2B3C');
  forgetReferral();
  expect(referralCode('')).toBe('');
});
