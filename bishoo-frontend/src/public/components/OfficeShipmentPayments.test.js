import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OfficeShipmentPayments from './OfficeShipmentPayments';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn() }));
beforeEach(() => { api.get.mockReset(); api.post.mockReset(); });

const row = { parcelId: 31, waybill: 'KTX 4829 1037 52', trackingNumber: 'KTX-SHP-9', sender: { name: 'Baraka', phone: '0713' },
  itemDescription: 'Nguo', destinationCity: 'Mbeya', amountDue: 12000 };

test('the office records the cash a sender paid, the price filled in', async () => {
  api.get.mockResolvedValueOnce({ data: { methods: ['cash'], parcels: [row] } }).mockResolvedValue({ data: { methods: ['cash'], parcels: [] } });
  api.post.mockResolvedValue({ data: {} });
  render(<OfficeShipmentPayments />);
  expect(await screen.findByText('KTX 4829 1037 52')).toBeInTheDocument();
  expect(screen.getByLabelText('Kiasi alicholipa (TZS)').value).toBe('12,000');
  expect(screen.queryByRole('radio')).toBeNull(); // cash only until mobile money is switched on
  fireEvent.click(screen.getByRole('button', { name: /Weka malipo/ }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/office/shipment-payments', { parcelId: 31, amount: 12000, method: 'cash', reference: undefined }));
  expect(await screen.findByRole('status')).toHaveTextContent('Malipo ya KTX 4829 1037 52 yamewekwa');
});

test('mobile money with its transaction number, and a changed amount', async () => {
  api.get.mockResolvedValue({ data: { methods: ['cash', 'mobile_money'], parcels: [row] } });
  api.post.mockResolvedValue({ data: {} });
  render(<OfficeShipmentPayments />);
  fireEvent.change(await screen.findByLabelText('Kiasi alicholipa (TZS)'), { target: { value: '10,000' } });
  fireEvent.click(screen.getByRole('radio', { name: 'Mobile money' }));
  fireEvent.change(screen.getByLabelText('Namba ya muamala (hiari)'), { target: { value: 'QJK8X2' } });
  fireEvent.click(screen.getByRole('button', { name: /Weka malipo/ }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/office/shipment-payments', { parcelId: 31, amount: 10000, method: 'mobile_money', reference: 'QJK8X2' }));
});

test('a refusal is shown as the server worded it', async () => {
  api.get.mockResolvedValue({ data: { methods: ['cash'], parcels: [row] } });
  api.post.mockRejectedValue({ response: { data: { message: 'Malipo ya mzigo huu yameshawekwa.' } } });
  render(<OfficeShipmentPayments />);
  fireEvent.click(await screen.findByRole('button', { name: /Weka malipo/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('yameshawekwa');
});

test('nothing shown when nothing is waiting, or for a non-office account', async () => {
  api.get.mockRejectedValue({ response: { status: 403 } });
  const { container } = render(<OfficeShipmentPayments />);
  await waitFor(() => expect(api.get).toHaveBeenCalled());
  expect(container.querySelector('[data-testid="office-shipment-payments"]')).toBeNull();
});
