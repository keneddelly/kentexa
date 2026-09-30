import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PayoutSettings from './PayoutSettings';
import api from '../../api/api';
jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const mockT = key => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('../components/BackBar', () => () => null);
beforeEach(() => jest.clearAllMocks());
test('personal context directs users to choose a business without offering payout edits', () => {
  render(<PayoutSettings activeContext={{ identityType: 'PERSONAL' }} onNavigate={jest.fn()} />);
  expect(screen.getByText('payout_settings.choose_business')).toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalled();
});
test('new destinations use only details; the server derives business and workspace authority', async () => {
  api.get.mockResolvedValue({ data: [] }); api.post.mockResolvedValue({ data: { id: 1 } });
  const { container } = render(<PayoutSettings activeContext={{ identityType: 'BUSINESS', workspaceId: 5 }} onNavigate={jest.fn()} />);
  await screen.findByText('payout_settings.hint');
  fireEvent.change(screen.getByLabelText('payout_settings.accountName'), { target: { value: 'Amina' } });
  fireEvent.change(screen.getByLabelText('payout_settings.accountNumber'), { target: { value: '0712345678' } });
  fireEvent.submit(container.querySelector('form'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/business/payout-destinations', { method: 'mpesa', accountName: 'Amina', accountNumber: '0712345678' }));
});
