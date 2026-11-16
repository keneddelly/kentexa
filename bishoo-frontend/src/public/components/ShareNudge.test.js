import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import api from '../../api/api';
import ShareNudge, { markNudge, nudgeSeen } from './ShareNudge';
import RelatedDiscussions from './RelatedDiscussions';
import { suggestedMessage } from './ShareSheet';

jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn() }));
beforeEach(() => window.localStorage.clear());

test('C11: a nudge is shown once; used or dismissed, it does not come back on this phone', () => {
  expect(nudgeSeen('hot-88')).toBe(false);
  markNudge('hot-88');
  expect(nudgeSeen('hot-88')).toBe(true);
  const onShare = jest.fn();
  const onDismiss = jest.fn();
  render(<ShareNudge title="Mjadala wako unavuma: majibu 12" onShare={onShare} onDismiss={onDismiss} />);
  fireEvent.click(screen.getByTestId('share-nudge-share'));
  fireEvent.click(screen.getByTestId('share-nudge-later'));
  expect(onShare).toHaveBeenCalled();
  expect(onDismiss).toHaveBeenCalled();
});

test('C: "Mijadala zaidi" and "Jumuiya zinazofanana" at the end of a discussion', async () => {
  api.get.mockResolvedValueOnce({ data: {
    discussions: [{ id: 9, intent: 'question', title: 'Moment', body: 'bei ya mahindi leo?', replyCount: 4, business: { name: 'juma' }, community: { name: 'wakulima' } }],
    communities: [{ id: 4, name: 'wakulima igoma', memberCount: 1200 }],
  } });
  const onNavigate = jest.fn();
  await act(async () => { render(<RelatedDiscussions postId={7} onNavigate={onNavigate} />); });
  expect(api.get).toHaveBeenCalledWith('/feed/7/related');
  expect(screen.getByTestId('related-post-9')).toHaveTextContent('Swali');
  expect(screen.getByTestId('related-post-9')).toHaveTextContent('Bei ya mahindi leo?');
  expect(screen.getByTestId('related-post-9')).toHaveTextContent('Juma · Wakulima · majibu 4');
  expect(screen.getByTestId('related-community-4')).toHaveTextContent('wanachama 1,200');
  fireEvent.click(screen.getByTestId('related-post-9'));
  expect(onNavigate).toHaveBeenCalledWith('PostDetail-9');
  fireEvent.click(screen.getByTestId('related-community-4'));
  expect(onNavigate).toHaveBeenCalledWith('Community-4');
});

test('C: nothing related: nothing shown', async () => {
  api.get.mockResolvedValueOnce({ data: { discussions: [], communities: [] } });
  const { container } = render(<RelatedDiscussions postId={7} onNavigate={jest.fn()} />);
  await act(async () => {});
  expect(container).toBeEmptyDOMElement();
});

test('C12: a member\'s invitation message', () => {
  expect(suggestedMessage({ contentType: 'community', words: 'Wakulima Igoma', purpose: 'Mvua na mbegu', invite: true }))
    .toBe('Nimejiunga na Wakulima Igoma kwenye KenteXa. Jiunge nami: Mvua na mbegu');
  expect(suggestedMessage({ contentType: 'community', words: 'Wakulima', invite: true }, 'en')).toBe('I joined Wakulima on KenteXa. Join me');
});
