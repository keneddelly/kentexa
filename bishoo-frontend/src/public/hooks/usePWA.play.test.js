import React from 'react';
import { render, screen } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { detectInstallEnvironment, isAndroidApp, usePWA, InstallBanner, PLAY_STORE_URL } from './usePWA';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));

// KenteXa on Google Play (owner 2026-11-10): Android phones use the Play app, not the web app.
const ANDROID = 'Mozilla/5.0 (Linux; Android 15) Chrome/120 Mobile';
const fakeWin = (search = '', referrer = '') => {
  const store = {};
  return {
    location: { search }, document: { referrer },
    sessionStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    matchMedia: () => ({ matches: false }),
  };
};

test('inside the Play app is recognised, and remembered for the visit', () => {
  const win = fakeWin('?source=android');
  expect(isAndroidApp(win)).toBe(true);
  win.location.search = '';
  expect(isAndroidApp(win)).toBe(true);
  expect(isAndroidApp(fakeWin('', 'android-app://com.app.bishoo/'))).toBe(true);
  expect(isAndroidApp(fakeWin())).toBe(false);
  expect(detectInstallEnvironment({ userAgent: ANDROID }, fakeWin('?source=android'))).toMatchObject({ android: true, androidApp: true });
  expect(detectInstallEnvironment({ userAgent: ANDROID }, fakeWin())).toMatchObject({ android: true, androidApp: false });
});

test('an Android browser is offered the Play app; an iPhone keeps the web app', () => {
  const original = navigator.userAgent;
  try {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ANDROID });
    const a = renderHook(() => usePWA());
    expect(a.result.current).toMatchObject({ playOffer: true, canInstall: true });
    a.unmount();
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone) Safari/605' });
    const i = renderHook(() => usePWA());
    expect(i.result.current.playOffer).toBe(false);
    i.unmount();
  } finally {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: original });
  }
});

test('the banner says Google Play when it offers the Play app', () => {
  render(<InstallBanner onInstall={jest.fn()} onDismiss={jest.fn()} play />);
  expect(screen.getByText('Pakua KenteXa kwenye Google Play')).toBeInTheDocument();
  expect(screen.getByTestId('install-banner-action')).toHaveTextContent('Pakua');
  expect(PLAY_STORE_URL).toBe('https://play.google.com/store/apps/details?id=com.app.bishoo');
});
