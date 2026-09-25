import { isAppleMobile } from './isAppleMobile';

test('iPhone and iPad get the viewport fix while Android keeps its existing layout', () => {
  expect(isAppleMobile({ userAgent: 'Mozilla/5.0 (iPhone) Safari/605' })).toBe(true);
  expect(isAppleMobile({ userAgent: 'Mozilla/5.0 (Macintosh) Safari/605', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
  expect(isAppleMobile({ userAgent: 'Mozilla/5.0 (Linux; Android 15) Chrome/120 Mobile', platform: 'Linux armv8l' })).toBe(false);
});
