import React from 'react';
import { render, screen } from '@testing-library/react';
import MyAdvertising from './MyAdvertising';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../components/BackBar', () => () => null);

test('the advertiser sees their link, what they are owed and paid, the rates and who joined', async () => {
  api.get.mockResolvedValue({ data: {
    name: 'Neema', active: true, code: 'K1A2B3C', link: 'https://kentexa.com/?ref=K1A2B3C',
    rates: { first_listing: 1000, business: 3000, office: 20000, seller: 5000 }, unpaid: 6000, paid: 1000,
    users: [{ name: 'Juma', joinedAt: '2026-10-26T06:00:00Z', earned: [{ event: 'seller', amount: 5000, status: 'earned' }, { event: 'first_listing', amount: 1000, status: 'paid' }] }],
  } });
  render(<MyAdvertising onNavigate={jest.fn()} />);
  expect(await screen.findByTestId('adv-link')).toHaveTextContent('https://kentexa.com/?ref=K1A2B3C');
  expect(screen.getByTestId('adv-unpaid')).toHaveTextContent('TZS 6,000');
  expect(screen.getByTestId('adv-paid')).toHaveTextContent('TZS 1,000');
  expect(screen.getByText('Amefungua ofisi').nextSibling).toHaveTextContent('TZS 20,000');
  expect(screen.getByTestId('adv-users')).toHaveTextContent('Amekuwa muuzaji TZS 5,000 · Tangazo la kwanza TZS 1,000 (imelipwa)');
});

test('someone who is not an advertiser is told so', async () => {
  api.get.mockRejectedValue({ response: { data: { message: 'Wewe si mtangazaji wa KenteXa.' } } });
  render(<MyAdvertising onNavigate={jest.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Wewe si mtangazaji');
});
