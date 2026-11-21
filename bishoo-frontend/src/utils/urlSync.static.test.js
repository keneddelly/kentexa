import { pageToPath, pathToPage } from './urlSync';

// The Play Store listing links to the privacy policy and terms (2026-11-10).
test('the privacy policy and terms have their own addresses', () => {
  expect(pageToPath('PrivacyPolicy')).toBe('/privacy');
  expect(pathToPage('/privacy')).toBe('PrivacyPolicy');
  expect(pageToPath('Terms')).toBe('/terms');
  expect(pathToPage('/terms/')).toBe('Terms');
});


test('Jumuiya opens the community home at its canonical address', () => {
  expect(pageToPath('JumuiyaHome')).toBe('/jumuiya');
  expect(pathToPage('/jumuiya')).toBe('JumuiyaHome');
  expect(pageToPath('JumuiyaLanding')).toBe('/jumuiya-kuhusu');
  expect(pathToPage('/jumuiya-kuhusu')).toBe('JumuiyaLanding');
});
