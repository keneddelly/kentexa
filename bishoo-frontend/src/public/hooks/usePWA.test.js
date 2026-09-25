import { detectInstallEnvironment } from './usePWA';

const device = (userAgent, options = {}) => detectInstallEnvironment(
  { userAgent, platform: options.platform, maxTouchPoints: options.maxTouchPoints, standalone: options.standalone },
  { matchMedia: () => ({ matches: Boolean(options.displayModeStandalone) }) },
);

test('iPhone Safari and other iOS browsers receive distinct instructions', () => {
  expect(device('Mozilla/5.0 (iPhone; CPU iPhone OS 17_2) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'))
    .toMatchObject({ ios: true, mobile: true, safari: true, standalone: false });
  expect(device('Mozilla/5.0 (iPhone; CPU iPhone OS 17_2) AppleWebKit/605.1.15 CriOS/120 Mobile/15E148 Safari/604.1'))
    .toMatchObject({ ios: true, mobile: true, safari: false });
});

test('iPad desktop identity, Android, installed mode and desktop are distinguished', () => {
  expect(device('Mozilla/5.0 (Macintosh) AppleWebKit/605 Safari/605',
    { platform: 'MacIntel', maxTouchPoints: 5 })).toMatchObject({ ios: true, mobile: true });
  expect(device('Mozilla/5.0 (Linux; Android 15) Chrome/120 Mobile')).toMatchObject({ ios: false, mobile: true });
  expect(device('Mozilla/5.0 (iPhone) Safari/605', { standalone: true }).standalone).toBe(true);
  expect(device('Mozilla/5.0 (Linux; Android 15)', { displayModeStandalone: true }).standalone).toBe(true);
  expect(device('Mozilla/5.0 (Windows NT 10.0) Chrome/120').mobile).toBe(false);
});
