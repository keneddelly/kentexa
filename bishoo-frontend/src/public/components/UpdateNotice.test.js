import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import UpdateNotice, { QUIET_MS, RETRY_EVERY_MS } from './UpdateNotice';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k, d) => d }) }));

const OLD = '/static/js/main.aaaa1111.js';
const NEW = '/static/js/main.bbbb2222.js';

function setup({ latest = NEW, clock = { t: 0 }, page = 'Home' } = {}) {
  document.head.innerHTML = `<script src="${OLD}"></script>`;
  const reload = jest.fn();
  const beforeReload = jest.fn();
  const fetchLatest = jest.fn(async () => latest);
  const props = { doc: document, fetchLatest, reload, beforeReload, now: () => clock.t };
  const view = render(<UpdateNotice page={page} {...props} />);
  const goTo = async (next) => { await act(async () => { view.rerender(<UpdateNotice page={next} {...props} />); }); };
  return { reload, beforeReload, fetchLatest, clock, goTo };
}
const comeBack = async () => {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
};
const focus = async () => { await act(async () => { window.dispatchEvent(new Event('focus')); }); };
const typeInForm = (text = 'Juma Hamisi') => {
  const input = document.createElement('input');
  document.body.appendChild(input);
  input.value = text;
  return input;
};

beforeEach(() => { window.sessionStorage.clear(); });
afterEach(() => { document.body.innerHTML = ''; jest.useRealTimers(); });

test('coming back to the app with nothing typed: reloads by itself, keeping the open screen first', async () => {
  const { reload, beforeReload } = setup();
  await comeBack();
  expect(beforeReload).toHaveBeenCalledTimes(1);
  expect(reload).toHaveBeenCalledTimes(1);
  expect(beforeReload.mock.invocationCallOrder[0]).toBeLessThan(reload.mock.invocationCallOrder[0]);
});

test('while working: no banner, no tap; reloads by itself when the person opens another screen', async () => {
  const { reload, goTo } = setup();
  await focus(); // just touched the screen: not quiet yet
  expect(reload).not.toHaveBeenCalled();
  expect(screen.queryByText(/Toleo jipya/)).toBeNull();
  await goTo('SellerOrders');
  expect(reload).toHaveBeenCalledTimes(1);
});

test('while working: reloads by itself after 20 quiet seconds', async () => {
  jest.useFakeTimers();
  const clock = { t: 0 };
  const { reload } = setup({ clock });
  await focus();
  expect(reload).not.toHaveBeenCalled();
  clock.t = QUIET_MS + 1;
  await act(async () => { jest.advanceTimersByTime(RETRY_EVERY_MS); });
  expect(reload).toHaveBeenCalledTimes(1);
});

test('never reloads in the middle of a form: a small note, then updates by itself once the form is done', async () => {
  jest.useFakeTimers();
  const clock = { t: 0 };
  const { reload, goTo } = setup({ clock });
  const input = typeInForm();
  await comeBack();
  await goTo('SendShipment');
  expect(reload).not.toHaveBeenCalled();
  expect(screen.getByText(/litawekwa lenyewe ukimaliza fomu/)).toBeInTheDocument();
  input.value = ''; // sent
  clock.t = QUIET_MS + 1;
  await act(async () => { jest.advanceTimersByTime(RETRY_EVERY_MS); });
  expect(reload).toHaveBeenCalledTimes(1);
});

test('"Sasisha sasa" in the note updates at once, even with text in the form', async () => {
  const { reload } = setup();
  typeInForm();
  await comeBack();
  fireEvent.click(screen.getByText('Sasisha sasa'));
  expect(reload).toHaveBeenCalledTimes(1);
});

test('the receipt with the one-time claim code is never reloaded away', async () => {
  const { reload, goTo } = setup();
  document.body.innerHTML = '<div data-keep-open>4DEE MXZC HEBK</div>';
  await comeBack();
  await goTo('Home2');
  expect(reload).not.toHaveBeenCalled();
});

test('same version: nothing shown, nothing reloaded', async () => {
  const { reload, goTo } = setup({ latest: OLD });
  await comeBack();
  await goTo('SellerOrders');
  expect(reload).not.toHaveBeenCalled();
  expect(screen.queryByText(/Toleo jipya/)).toBeNull();
});

test('a version already tried once is not reloaded again (no reload loop behind a stale cache)', async () => {
  window.sessionStorage.setItem('kentexa_update_tried', NEW);
  const { reload } = setup();
  await comeBack();
  expect(reload).not.toHaveBeenCalled();
});

test('reloads only once even if several moments come together', async () => {
  const { reload, goTo } = setup();
  await comeBack();
  await goTo('SellerOrders');
  await comeBack();
  expect(reload).toHaveBeenCalledTimes(1);
});
