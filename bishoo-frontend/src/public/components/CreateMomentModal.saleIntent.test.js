import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../../api/api';
import CreateMomentModal from './CreateMomentModal';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

// CRA resets mocks before each test: set the answers here.
beforeEach(() => { api.get.mockResolvedValue({ data: [] }); api.post.mockResolvedValue({ data: {} }); });
// A stable t: the modal's item effect depends on it.
const mockT = (k) => k;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));

const profile = { id: 7, type: 'personal', displayName: 'Asha' };
const user = { id: 1 };
const open = (onNavigate) => render(
  <CreateMomentModal onClose={jest.fn()} onPosted={jest.fn()} currentUser={user} activeProfileId={7}
    activeProfile={profile} onNavigate={onNavigate} />);

test('a sale written as a Moment goes to the classified form, filled in', async () => {
  const onNavigate = jest.fn();
  open(onNavigate);
  const box = document.querySelector('textarea');
  fireEvent.change(box, { target: { value: 'Nauza simu Samsung A15 bei 420,000' } });
  expect(await screen.findByTestId('moment-sale-hint')).toHaveTextContent('tangazo');
  fireEvent.click(screen.getByText('Endelea kama tangazo'));
  await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('CreateClassified', { prefill: expect.objectContaining({
    title: 'Nauza simu Samsung A15 bei 420,000', price: 420000, images: [] }) }));
  expect(api.post).not.toHaveBeenCalledWith('/feed/publish', expect.anything());
});

test('"Hapana, ni Moment tu" keeps it a Moment', async () => {
  const onNavigate = jest.fn();
  open(onNavigate);
  fireEvent.change(document.querySelector('textarea'), { target: { value: 'Sofa inauzwa' } });
  fireEvent.click(await screen.findByTestId('keep-moment'));
  fireEvent.click(screen.getByText('create_moment_modal.share_moment_button'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/feed/publish', expect.objectContaining({ type: 'moment' })));
  expect(onNavigate).not.toHaveBeenCalled();
});
