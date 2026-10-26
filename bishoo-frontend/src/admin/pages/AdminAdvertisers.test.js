import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminAdvertisers from './AdminAdvertisers';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
jest.mock('../components/Sidebar', () => () => null);
jest.mock('../../public/pages/MyAdvertising', () => ({
  EVENT_LABEL: { first_listing: 'Tangazo la kwanza', business: 'Amefungua biashara', office: 'Amefungua ofisi', seller: 'Amekuwa muuzaji' },
}));

const DATA = {
  ready: true,
  rates: { first_listing: 200, business: 300, office: 2000, seller: 500 },
  advertisers: [
    { id: 1, name: 'Kened', phone: '255712345678', link: 'https://kentexa.com/?ref=ABC', active: true, users: 0, unpaid: 0, paid: 0 },
    { id: 2, name: 'Asha', phone: '255713000000', link: 'https://kentexa.com/?ref=XYZ', active: true, users: 3, unpaid: 1500, paid: 0 },
  ],
};

beforeEach(() => {
  api.get.mockResolvedValue({ data: DATA });
  api.put.mockResolvedValue({ data: DATA.rates });
  api.post.mockResolvedValue({ data: {} });
  api.patch.mockResolvedValue({ data: {} });
});

test('Hifadhi sends the rates as numbers and confirms next to the button', async () => {
  render(<AdminAdvertisers />);
  const office = await screen.findByLabelText('Amefungua ofisi');
  fireEvent.change(office, { target: { value: '2500' } });
  fireEvent.click(screen.getByRole('button', { name: 'Hifadhi' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/advertisers/rates', { first_listing: 200, business: 300, office: 2500, seller: 500 }));
  expect(await screen.findByText('Imehifadhiwa')).toBeInTheDocument();
});

test('an advertiser with nothing owed shows "Hakuna deni" instead of a dead button', async () => {
  render(<AdminAdvertisers />);
  const row = await screen.findByTestId('adv-row-1');
  expect(row).toHaveTextContent('Hakuna deni');
  expect(row.querySelector('button[disabled]')).toBeNull();
});

test('Nimelipa asks inside the page (no browser popup) and then marks paid', async () => {
  const confirmSpy = jest.spyOn(window, 'confirm');
  render(<AdminAdvertisers />);
  await screen.findByTestId('adv-row-2');
  fireEvent.click(screen.getByRole('button', { name: 'Nimelipa' }));
  fireEvent.click(screen.getByRole('button', { name: /Ndiyo, nimemlipa TZS 1,500/ }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/advertisers/2/paid'));
  expect(confirmSpy).not.toHaveBeenCalled();
});

test('Ongeza stays off until name and phone are filled', async () => {
  render(<AdminAdvertisers />);
  const add = await screen.findByRole('button', { name: 'Ongeza' });
  expect(add).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Jina'), { target: { value: 'Neema' } });
  fireEvent.change(screen.getByLabelText('Simu'), { target: { value: '0714 000 000' } });
  expect(add).not.toBeDisabled();
  fireEvent.click(add);
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/advertisers', { name: 'Neema', phone: '0714 000 000' }));
});
