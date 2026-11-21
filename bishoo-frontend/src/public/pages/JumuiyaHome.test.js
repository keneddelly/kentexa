import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import JumuiyaHome from './JumuiyaHome';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn() }));

beforeEach(() => { api.get.mockReset(); api.post.mockReset(); });

const mine = [{ id: 1, name: 'Wajasiriamali', purpose: 'Maarifa ya biashara', topicKey: 'business', memberCount: 12, joinPolicy: 'open', myStatus: 'active' }];
const discover = [
  { id: 2, name: 'Wakulima Tanzania', purpose: 'Mazao, masoko na bei', topicKey: 'kilimo', memberCount: 120, joinPolicy: 'open', myStatus: null },
  { id: 3, name: 'Teknolojia Tanzania', purpose: 'Teknolojia na ubunifu', topicKey: 'technology', memberCount: 80, joinPolicy: 'request', myStatus: null },
];

function setup({ isLoggedIn = true } = {}) {
  api.get.mockImplementation(async (url, options) => {
    if (url === '/communities' && options?.params?.mine === '1') return { data: mine };
    if (url === '/communities') return { data: options?.params?.topic === 'kilimo' ? [discover[0]] : discover };
    if (url === '/feed/topics') return { data: [{ key: 'kilimo', label: 'Kilimo' }, { key: 'technology', label: 'Teknolojia' }] };
    return { data: [] };
  });
  const onNavigate = jest.fn();
  render(<JumuiyaHome isLoggedIn={isLoggedIn} onNavigate={onNavigate} />);
  return { onNavigate };
}

test('community home shows member communities and public discovery with working destinations', async () => {
  const { onNavigate } = setup();
  expect(await screen.findByTestId('community-card-2')).toBeInTheDocument();
  expect(screen.getByTestId('community-card-3')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Fungua jumuiya', exact: true }));
  expect(onNavigate).toHaveBeenCalledWith('CreateCommunity');
  fireEvent.click(screen.getByRole('button', { name: 'Jumuiya zangu (1)' }));
  expect(await screen.findByTestId('community-card-1')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('community-card-1').querySelector('button'));
  expect(onNavigate).toHaveBeenLastCalledWith('Community-1');
});

test('topic filter and search narrow the discovery list', async () => {
  setup();
  expect(await screen.findByTestId('community-card-2')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Kilimo' }));
  await waitFor(() => expect(screen.queryByTestId('community-card-3')).not.toBeInTheDocument());
  expect(screen.getByTestId('community-card-2')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Tafuta jumuiya' }), { target: { value: 'masoko' } });
  expect(screen.getByTestId('community-card-2')).toBeInTheDocument();
});

test('joining an open community moves it into my communities', async () => {
  setup();
  api.post.mockResolvedValue({ data: { ...discover[0], myStatus: 'active', myRole: 'member', memberCount: 121 } });
  expect(await screen.findByTestId('community-card-2')).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: 'Jiunge' })[0]);
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/communities/2/join'));
  fireEvent.click(screen.getByRole('button', { name: /Jumuiya zangu/ }));
  expect(await screen.findByTestId('community-card-2')).toBeInTheDocument();
});

test('guest can browse but is asked to sign in before joining or creating', async () => {
  const { onNavigate } = setup({ isLoggedIn: false });
  expect(await screen.findByTestId('community-card-2')).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: 'Jiunge' })[0]);
  expect(onNavigate).toHaveBeenCalledWith('PublicLogin');
  fireEvent.click(screen.getByRole('button', { name: 'Fungua jumuiya' }));
  expect(onNavigate).toHaveBeenLastCalledWith('PublicLogin');
});
