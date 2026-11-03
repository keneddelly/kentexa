import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import WorkAppInstall, { installMode } from './WorkAppInstall';

beforeEach(() => { try { localStorage.clear(); } catch { /* none */ } });

test('each device gets the help it needs (owner 2026-11-03: easy install on the phone)', () => {
  expect(installMode({ standalone: true, mobile: true }, true)).toBe('none');
  expect(installMode({ mobile: true, inApp: true }, false)).toBe('open-browser');
  expect(installMode({ ios: true, mobile: true, safari: true })).toBe('ios-steps');
  expect(installMode({ ios: true, mobile: true, safari: false })).toBe('open-safari');
  expect(installMode({ mobile: true }, true)).toBe('prompt');
  expect(installMode({ mobile: true }, false)).toBe('android-steps');
  expect(installMode({ mobile: false }, false)).toBe('none');
  expect(installMode({ mobile: false }, true)).toBe('prompt');
});

test('Android: one tap "Weka"; "Baadaye" hides it', () => {
  const onInstall = jest.fn();
  render(<WorkAppInstall kind="ofisi" env={{ mobile: true }} ready canInstall onInstall={onInstall} />);
  expect(screen.getByText('Weka KenteXa Ofisi kwenye simu yako')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('work-app-install-go'));
  expect(onInstall).toHaveBeenCalled();
  fireEvent.click(screen.getByText('Baadaye'));
  expect(screen.queryByTestId('work-app-install-ofisi')).toBeNull();
});

test('iPhone Safari shows the three steps; already installed shows nothing', () => {
  const { unmount } = render(<WorkAppInstall kind="pos" env={{ ios: true, mobile: true, safari: true }} canInstall />);
  expect(screen.getByText('Add to Home Screen')).toBeInTheDocument();
  unmount();
  render(<WorkAppInstall kind="pos" env={{ mobile: true }} ready canInstall={false} />);
  expect(screen.queryByTestId('work-app-install-pos')).toBeNull();
});
