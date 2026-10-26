import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

let APPS = [];
beforeEach(() => {
  APPS = [];
  api.get.mockImplementation((path) => Promise.resolve({ data: path === '/advertisers/applications' ? { ready: true, applications: APPS } : DATA }));
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

test('applications: accept gives the link; reject needs a reason the applicant will see', async () => {
  APPS = [
    { id: 7, name: 'Neema', phone: '255714000000', area: 'Arusha', plan: 'WhatsApp groups', createdAt: '2026-10-26T10:00:00Z' },
    { id: 8, name: 'Baraka', phone: '255715000000', area: null, plan: null, createdAt: '2026-10-26T11:00:00Z' },
  ];
  render(<AdminAdvertisers />);
  expect(await screen.findByTestId('adv-applications')).toHaveTextContent('Maombi mapya (2)');
  fireEvent.click(within(screen.getByTestId('adv-app-7')).getByRole('button', { name: 'Kubali' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/advertisers/applications/7/accept'));
  await screen.findByText(/Neema amekubaliwa/);
  await waitFor(() => expect(within(screen.getByTestId('adv-app-8')).getByRole('button', { name: 'Kataa' })).toBeEnabled());

  const row8 = screen.getByTestId('adv-app-8');
  fireEvent.click(within(row8).getByRole('button', { name: 'Kataa' }));
  const confirm = within(row8).getByRole('button', { name: 'Kataa ombi' });
  expect(confirm).toBeDisabled();
  fireEvent.change(within(row8).getByLabelText('Sababu ya kukataa'), { target: { value: 'Tayari tuna watangazaji wa kutosha' } });
  fireEvent.click(confirm);
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/advertisers/applications/8/reject', { reason: 'Tayari tuna watangazaji wa kutosha' }));
});
