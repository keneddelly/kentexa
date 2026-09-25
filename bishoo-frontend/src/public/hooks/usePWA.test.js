import { detectInstallEnvironment } from './usePWA';
import { act, renderHook } from '@testing-library/react';
import { usePWA } from './usePWA';

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

test('a dismissed suggestion stays quiet, but the settings action remains available', () => {
  const originalAgent = navigator.userAgent;
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone) Safari/605' });
  jest.useFakeTimers();
  try {
    localStorage.removeItem('kx_pwa_dismissed');
    const first = renderHook(() => usePWA());
    act(() => jest.advanceTimersByTime(20000));
    expect(first.result.current.showInstallPrompt).toBe(true);
    act(() => first.result.current.handleDismiss());
    expect(first.result.current.showInstallPrompt).toBe(false);
    first.unmount();
    const second = renderHook(() => usePWA());
    act(() => jest.advanceTimersByTime(20000));
    expect(second.result.current.showInstallPrompt).toBe(false);
    expect(second.result.current.canInstall).toBe(true);
    act(() => { second.result.current.handleInstall(); });
    expect(second.result.current.showGuide).toBe(true);
    second.unmount();
  } finally {
    localStorage.removeItem('kx_pwa_dismissed');
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: originalAgent });
    jest.useRealTimers();
  }
});

test('installed event hides an outstanding suggestion and prevents its timer from reopening', () => {
  const originalAgent = navigator.userAgent;
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Linux; Android 15) Chrome/120 Mobile' });
  jest.useFakeTimers();
  try {
    localStorage.removeItem('kx_pwa_dismissed');
    const { result, unmount } = renderHook(() => usePWA());
    act(() => window.dispatchEvent(new Event('appinstalled')));
    act(() => jest.advanceTimersByTime(20000));
    expect(result.current).toMatchObject({ isInstalled: true, canInstall: false, showInstallPrompt: false });
    unmount();
  } finally {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: originalAgent });
    jest.useRealTimers();
  }
});
