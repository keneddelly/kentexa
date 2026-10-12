import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import UpdateNotice, { IDLE_MS } from './UpdateNotice';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k, d) => d }) }));

const OLD = '/static/js/main.aaaa1111.js';
const NEW = '/static/js/main.bbbb2222.js';

function setup({ latest = NEW, clock = { t: 0 } } = {}) {
  document.head.innerHTML = `<script src="${OLD}"></script>`;
  const reload = jest.fn();
  const fetchLatest = jest.fn(async () => latest);
  render(<UpdateNotice doc={document} fetchLatest={fetchLatest} reload={reload} now={() => clock.t} />);
  return { reload, fetchLatest, clock };
}
const comeBack = async () => {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
};
const focus = async () => { await act(async () => { window.dispatchEvent(new Event('focus')); }); };

afterEach(() => { document.body.innerHTML = ''; jest.useRealTimers(); });

test('coming back to the app with nothing typed: reloads by itself to the new version', async () => {
  const { reload } = setup();
  await comeBack();
  expect(reload).toHaveBeenCalledTimes(1);
});

test('never reloads in the middle of a walk-in form: shows the banner instead', async () => {
  const { reload } = setup();
  const input = document.createElement('input');
  document.body.appendChild(input);
  input.value = 'Juma Hamisi';
  await comeBack();
  expect(reload).not.toHaveBeenCalled();
  expect(screen.getByText(/Toleo jipya la KenteXa/)).toBeInTheDocument();
  fireEvent.click(screen.getByText(/Toleo jipya la KenteXa/));
  expect(reload).not.toHaveBeenCalled();
  expect(screen.getByText(/Maliza kazi uliyonayo kwanza/)).toBeInTheDocument();
  fireEvent.click(screen.getByText('Sasisha hata hivyo'));
  expect(reload).toHaveBeenCalledTimes(1);
});

test('the receipt with the one-time claim code is never reloaded away', async () => {
  const { reload } = setup();
  document.body.innerHTML = '<div data-keep-open>4DEE MXZC HEBK</div>';
  await comeBack();
  expect(reload).not.toHaveBeenCalled();
});

test('while working (focus, recent touch): banner only; reloads once idle for 5 minutes and safe', async () => {
  jest.useFakeTimers();
  const clock = { t: 0 };
  const { reload } = setup({ clock });
  await focus();
  expect(reload).not.toHaveBeenCalled();
  expect(screen.getByText(/Toleo jipya la KenteXa/)).toBeInTheDocument();
  clock.t = IDLE_MS + 1;
  await act(async () => { jest.advanceTimersByTime(60 * 1000); });
  expect(reload).toHaveBeenCalledTimes(1);
});

test('same version: nothing shown, nothing reloaded', async () => {
  const { reload } = setup({ latest: OLD });
  await comeBack();
  expect(reload).not.toHaveBeenCalled();
  expect(screen.queryByText(/Toleo jipya/)).toBeNull();
});
