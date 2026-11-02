import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import PostSafetyMenu, { muteTargetFor } from './PostSafetyMenu';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ post: jest.fn() }));
beforeEach(() => { api.post.mockReset(); });

const open = async (biz = { id: 3, commerceProfileId: 9 }) => {
  const onClose = jest.fn(); const onMuted = jest.fn();
  await act(async () => { render(<PostSafetyMenu postId={7} biz={biz} bizName="Samatta Transportation" onClose={onClose} onMuted={onMuted} />); });
  return { onClose, onMuted };
};

test('a mute names the profile on the post, or its account for posts without one', () => {
  expect(muteTargetFor({ id: 3, commerceProfileId: 9 })).toEqual({ commerceProfileId: 9 });
  expect(muteTargetFor({ id: 3 })).toEqual({ accountId: 3 });
  expect(muteTargetFor({})).toBeNull();
});

test('"Nyamazisha" mutes that identity and steps the card aside', async () => {
  api.post.mockResolvedValue({ data: { muted: true } });
  const { onClose, onMuted } = await open();
  await act(async () => { fireEvent.click(screen.getByTestId('menu-mute')); });
  expect(api.post).toHaveBeenCalledWith('/feed/mute', { commerceProfileId: 9 });
  expect(onMuted).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});

test('a report needs a reason, sends it once, and says it was sent', async () => {
  api.post.mockResolvedValue({ data: { reported: true } });
  await open();
  fireEvent.click(screen.getByTestId('menu-report'));
  await act(async () => { fireEvent.click(screen.getByTestId('report-send')); });
  expect(screen.getByRole('alert')).toHaveTextContent('Chagua sababu');
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId('reason-fraud'));
  await act(async () => { fireEvent.click(screen.getByTestId('report-send')); });
  expect(api.post).toHaveBeenCalledWith('/feed/7/report', { reason: 'fraud' });
  expect(screen.getByTestId('report-done')).toHaveTextContent('ripoti imetumwa');
});

test('a refused report says why (e.g. already reported)', async () => {
  api.post.mockRejectedValue({ response: { data: { message: 'Umeshaliripoti chapisho hili.' } } });
  await open();
  fireEvent.click(screen.getByTestId('menu-report'));
  fireEvent.click(screen.getByTestId('reason-spam'));
  await act(async () => { fireEvent.click(screen.getByTestId('report-send')); });
  expect(screen.getByRole('alert')).toHaveTextContent('Umeshaliripoti');
});
