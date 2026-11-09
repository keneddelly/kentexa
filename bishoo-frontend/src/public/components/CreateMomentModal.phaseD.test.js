import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import api from '../../api/api';
import CreateMomentModal from './CreateMomentModal';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
const mockT = (k) => k;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));

const profile = { id: 7, type: 'business', displayName: 'Bishoo Electronics' };
beforeEach(() => {
  api.get.mockImplementation(async (url) => ({ data: url === '/products/profile/7' ? [{ id: 4, name: 'Taa ya sola 20W', displayPrice: 45000, images: [] }] : [] }));
  api.post.mockResolvedValue({ data: {} });
  api.patch.mockResolvedValue({ data: { id: 9, body: 'Taa mpya', editedAt: '2026-11-02T10:05:00Z' } });
});
const open = async (props = {}) => {
  const onClose = jest.fn();
  await act(async () => {
    render(<CreateMomentModal onClose={onClose} onPosted={jest.fn()} currentUser={{ id: 1 }} activeProfileId={7} activeProfile={profile} {...props} />);
  });
  return onClose;
};
const type = (value) => fireEvent.change(screen.getByLabelText('Maandishi'), { target: { value } });
// Smart Post: "Tuma" opens the preview when the post is ready; "Chapisha" sends it.
const share = async () => {
  await act(async () => { fireEvent.click(screen.getByText('create_moment_modal.share_moment_button')); });
  const go = screen.queryByTestId('preview-publish');
  if (go) await act(async () => { fireEvent.click(go); });
};
const published = () => api.post.mock.calls.some((c) => c[0] === '/feed/publish');

test('a question is published as a question, with its audience', async () => {
  await open();
  fireEvent.click(screen.getByTestId('kind-question'));
  type('Nani anajua fundi mzuri wa friji Mwanza?');
  fireEvent.click(screen.getByTestId('audience-followers'));
  await share();
  expect(api.post).toHaveBeenCalledWith('/feed/publish', expect.objectContaining({
    type: 'moment', intent: 'question', visibility: 'followers', media: [], body: 'Nani anajua fundi mzuri wa friji Mwanza?',
  }));
});

test('text stops at 500 characters and the count shows it', async () => {
  await open();
  type('a'.repeat(620));
  expect(screen.getByLabelText('Maandishi').value).toHaveLength(500);
  expect(screen.getByTestId('char-count')).toHaveTextContent('500 / 500');
});

test('"Onyesha bidhaa" needs a real product; its price comes from the product', async () => {
  await open();
  fireEvent.click(screen.getByTestId('kind-showcase'));
  type('Mzigo mpya umefika');
  await share();
  expect(screen.getByRole('alert')).toHaveTextContent('Chagua bidhaa');
  expect(published()).toBe(false);
  expect(screen.queryByTestId('link-business-7')).toBeNull(); // only things that are sold
  fireEvent.click(screen.getByTestId('link-product-4'));
  await share();
  expect(api.post).toHaveBeenCalledWith('/feed/publish', expect.objectContaining({
    intent: 'sell_available', linkedEntityType: 'product', linkedEntityId: 4, price: 45000,
  }));
});

test('editing keeps the photos, changes the text and audience, and sends no new post', async () => {
  const onEdited = jest.fn();
  const editPost = { id: 9, businessId: 1, title: 'Taa', body: 'Taa', visibility: 'public', media: [{ url: 'a.jpg', width: 4, height: 3 }] };
  const onClose = await open({ editPost, onEdited });
  expect(screen.getByText('Hariri chapisho')).toBeInTheDocument();
  expect(screen.queryByTestId('kind-question')).toBeNull();
  expect(screen.getAllByTestId('composer-photo')).toHaveLength(1);
  type('Taa mpya');
  await act(async () => { fireEvent.click(screen.getByText('Hifadhi mabadiliko')); });
  expect(api.patch).toHaveBeenCalledWith('/feed/9', { title: 'Taa mpya', body: 'Taa mpya', media: [{ url: 'a.jpg', width: 4, height: 3 }], visibility: 'public' });
  expect(published()).toBe(false);
  await waitFor(() => expect(onEdited).toHaveBeenCalledWith(expect.objectContaining({ id: 9 })));
  expect(onClose).toHaveBeenCalled();
});

test('Kura: a question, 2 to 6 options and how long it stays open (phase E)', async () => {
  await open();
  fireEvent.click(screen.getByTestId('kind-poll'));
  type('Tufungue Jumapili?');
  fireEvent.change(screen.getByTestId('poll-option-0'), { target: { value: 'Ndiyo' } });
  await share();
  expect(screen.getByRole('alert')).toHaveTextContent('Jaza kila chaguo');
  fireEvent.change(screen.getByTestId('poll-option-1'), { target: { value: 'Hapana' } });
  fireEvent.click(screen.getByTestId('poll-add-option'));
  fireEvent.change(screen.getByTestId('poll-option-2'), { target: { value: 'Nusu siku' } });
  fireEvent.click(screen.getByTestId('poll-days-7'));
  await share();
  expect(api.post).toHaveBeenCalledWith('/feed/publish', expect.objectContaining({
    intent: 'poll', title: 'Tufungue Jumapili?', poll: { options: ['Ndiyo', 'Hapana', 'Nusu siku'], durationDays: 7 },
  }));
});

test('Social Home: a post needs a topic when topics exist, and sends it (owner approved 2026-11-02)', async () => {
  try { localStorage.removeItem('kentexa_last_topic'); } catch { /* none */ }
  api.get.mockImplementation(async (url) => ({ data: url === '/feed/topics' ? [{ key: 'biashara', label: 'Biashara' }, { key: 'kilimo', label: 'Kilimo' }] : [] }));
  await open();
  type('Bei ya mbolea imepanda Mwanza');
  await share();
  expect(screen.getByRole('alert')).toHaveTextContent('Chagua mada');
  expect(published()).toBe(false);
  fireEvent.click(screen.getByTestId('post-topic-kilimo'));
  await share();
  expect(api.post).toHaveBeenCalledWith('/feed/publish', expect.objectContaining({ topic: 'kilimo' }));
});

test('Social Home part 3: "Chapisha kwenye" sends the post into a community (no topic needed there)', async () => {
  api.get.mockImplementation(async (url) => ({ data: url === '/feed/topics' ? [{ key: 'kilimo', label: 'Kilimo' }]
    : url === '/communities' ? [{ id: 3, name: 'Wakulima Mwanza' }] : [] }));
  await open();
  type('Mvua zimeanza kwenu?');
  fireEvent.click(screen.getByTestId('post-where-3'));
  await share();
  expect(api.post).toHaveBeenCalledWith('/feed/publish', expect.objectContaining({ communityId: 3 }));
});

test('Smart Post: the preview shows the post first; "Rudi kuhariri" keeps the text; nothing is sent until "Chapisha"', async () => {
  await open();
  fireEvent.click(screen.getByTestId('kind-experience'));
  type('Nilianza duka kwa mtaji wa laki moja.');
  fireEvent.click(screen.getByTestId('audience-followers'));
  await act(async () => { fireEvent.click(screen.getByText('create_moment_modal.share_moment_button')); });
  const preview = screen.getByTestId('post-preview');
  expect(preview).toHaveTextContent('Nilianza duka kwa mtaji wa laki moja.');
  expect(preview).toHaveTextContent('Uzoefu');
  expect(preview).toHaveTextContent('Bishoo Electronics');
  expect(screen.getByTestId('preview-audience')).toHaveTextContent('Wanaofuata tu');
  expect(published()).toBe(false);
  expect(api.post).toHaveBeenCalledWith('/feed/analytics/composer', expect.objectContaining({ step: 'preview', kind: 'experience' }));
  fireEvent.click(screen.getByTestId('preview-back'));
  expect(screen.getByLabelText('Maandishi').value).toBe('Nilianza duka kwa mtaji wa laki moja.');
  await share();
  expect(api.post).toHaveBeenCalledWith('/feed/publish', expect.objectContaining({ intent: 'experience', visibility: 'followers' }));
});

test('Smart Post: a failed post keeps everything and shows why', async () => {
  api.post.mockImplementation(async (url) => {
    if (url === '/feed/publish') throw { response: { data: { message: 'Mtandao umekatika' } } };
    return { data: {} };
  });
  const onClose = await open();
  type('Habari za leo');
  await share();
  expect(screen.getByRole('alert')).toHaveTextContent('Mtandao umekatika');
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId('preview-back'));
  expect(screen.getByLabelText('Maandishi').value).toBe('Habari za leo');
});

test('Smart Post: closing without posting records where the person stopped, never the text', async () => {
  const onClose = await open();
  expect(api.post).toHaveBeenCalledWith('/feed/analytics/composer', expect.objectContaining({ step: 'opened' }));
  fireEvent.click(screen.getByTestId('kind-question'));
  type('Siri yangu');
  fireEvent.click(screen.getByLabelText('Funga'));
  const call = api.post.mock.calls.find((c) => c[1]?.step === 'abandoned');
  expect(call[1]).toEqual({ step: 'abandoned', kind: 'question', at: 'write', hasText: true, photos: 0 });
  expect(JSON.stringify(api.post.mock.calls)).not.toContain('Siri yangu');
  expect(onClose).toHaveBeenCalled();
});
