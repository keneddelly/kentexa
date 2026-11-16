import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import api from '../../api/api';
import WriterOfWeek, { WriterBadge } from './WriterOfWeek';
import WriterWins from './WriterWins';
import GetAppStrip, { showGetApp } from './GetAppStrip';

jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn() }));

/** Mwandishi wa Wiki (owner approved 2026-11-16), and Google Play for Android visitors without the app. */
const week = {
  weekStart: '2026-11-09', weekLabel: '9–15 Nov',
  winner: { ownerUserId: 7, commerceProfileId: 70, name: 'asha mwakyusa', photo: null, username: 'asha', posts: 3, replies: 86, repliers: 41, wins: 2,
    topPost: { id: 55, title: 'mambo 7 ya kujua kabla ya kuagiza mzigo', intent: 'article' } },
  next: [{ ownerUserId: 8, commerceProfileId: null, name: 'kened', photo: null, posts: 4, replies: 30, repliers: 12 }],
};
const android = (inApp = false) => jest.spyOn(navigator, 'userAgent', 'get')
  .mockReturnValue(inApp ? 'Mozilla/5.0 (Linux; Android 14) WhatsApp' : 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile');

beforeEach(() => { jest.clearAllMocks(); try { window.sessionStorage.clear(); } catch { /* none */ } });

test('the gold card: writer, what they wrote, Fuata; the next writers', async () => {
  api.get.mockResolvedValue({ data: week });
  api.post.mockResolvedValue({ data: { following: true } });
  const onNavigate = jest.fn();
  await act(async () => { render(<WriterOfWeek onNavigate={onNavigate} isLoggedIn currentUser={{ id: 1 }} />); });
  expect(api.get).toHaveBeenCalledWith('/writer-of-week');
  const card = screen.getByTestId('writer-of-week');
  expect(card).toHaveTextContent('MWANDISHI WA WIKI · 9–15 NOV');
  expect(screen.getByTestId('writer-name')).toHaveTextContent('Asha Mwakyusa');
  expect(card).toHaveTextContent('majibu 86 kutoka kwa watu 41');
  fireEvent.click(screen.getByTestId('writer-top-post'));
  expect(onNavigate).toHaveBeenCalledWith('PostDetail-55');
  await act(async () => { fireEvent.click(screen.getByTestId('writer-follow-7')); });
  expect(api.post).toHaveBeenCalledWith('/profiles/70/follow');
  expect(screen.getByTestId('writer-follow-7')).toHaveTextContent('Unamfuata');
  expect(screen.getByTestId('writer-next-8')).toHaveTextContent('Kened');
  expect(screen.queryByTestId('writer-share')).toBeNull();
});

test('the winner sees "Shiriki kadi yako" instead of Fuata', async () => {
  api.get.mockResolvedValue({ data: week });
  await act(async () => { render(<WriterOfWeek onNavigate={jest.fn()} isLoggedIn currentUser={{ id: 7 }} />); });
  expect(screen.getByTestId('writer-share')).toHaveTextContent('Shiriki kadi yako');
  expect(screen.queryByTestId('writer-follow-7')).toBeNull();
});

test('a quiet week (nobody met the rules): nothing shown', async () => {
  api.get.mockResolvedValue({ data: { weekStart: '2026-11-09', winner: null, next: [] } });
  let view;
  await act(async () => { view = render(<WriterOfWeek onNavigate={jest.fn()} />); });
  expect(view.container).toBeEmptyDOMElement();
});

test('the gold label on posts, and "Mwandishi wa Wiki mara 2" on the profile', async () => {
  render(<WriterBadge />);
  expect(screen.getByTestId('writer-badge')).toHaveTextContent('MWANDISHI WA WIKI');
  api.get.mockResolvedValue({ data: { wins: 2, last: '2026-11-09', lastLabel: '9–15 Nov 2026' } });
  await act(async () => { render(<WriterWins ownerUserId={7} />); });
  expect(api.get).toHaveBeenCalledWith('/writer-of-week/profile/7');
  expect(screen.getByTestId('writer-wins')).toHaveTextContent('Mwandishi wa Wiki mara 2');
  expect(screen.getByTestId('writer-wins')).toHaveTextContent('Mara ya mwisho: 9–15 Nov 2026');
});

test('Google Play: offered on Android outside the app (also inside WhatsApp), never elsewhere', async () => {
  expect(showGetApp()).toBe(false); // a computer
  let ua = android(true);
  expect(showGetApp()).toBe(true);
  ua.mockRestore();
  ua = android();
  render(<GetAppStrip />);
  const strip = screen.getByTestId('get-app-strip');
  expect(strip).toHaveTextContent('Google Play');
  expect(screen.getByTestId('get-app')).toHaveAttribute('href', 'https://play.google.com/store/apps/details?id=com.app.bishoo');
  fireEvent.click(screen.getByText('Baadaye'));
  expect(screen.queryByTestId('get-app-strip')).toBeNull();
  api.get.mockResolvedValue({ data: week });
  await act(async () => { render(<WriterOfWeek onNavigate={jest.fn()} />); });
  expect(screen.getByTestId('writer-get-app')).toHaveTextContent('app ya KenteXa');
  ua.mockRestore();
});
