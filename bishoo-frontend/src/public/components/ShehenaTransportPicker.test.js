import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ShehenaTransportPicker from './ShehenaTransportPicker';
import TransportShehenaList from './TransportShehenaList';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ get: jest.fn() }));

test('the office picks its own or a partner transport, or types another one', async () => {
  api.get.mockResolvedValue({ data: { transport: [
    { id: 3, name: 'Abood Bus', relation: 'own' }, { id: 9, name: 'Lori la Juma', relation: 'partner' },
  ] } });
  const onChange = jest.fn();
  const { rerender } = render(<ShehenaTransportPicker value={{ transportProviderId: null, transportCompany: '' }} onChange={onChange} />);
  fireEvent.click(await screen.findByTestId('shehena-transport-3'));
  expect(onChange).toHaveBeenLastCalledWith({ transportProviderId: 3, transportCompany: 'Abood Bus' });
  expect(screen.getByText('Usafiri wako')).toBeTruthy();
  expect(screen.getByText('Mshirika')).toBeTruthy();
  rerender(<ShehenaTransportPicker value={{ transportProviderId: 3, transportCompany: 'Abood Bus' }} onChange={onChange} />);
  expect(screen.queryByLabelText('Kampuni ya usafiri')).toBeNull();
  rerender(<ShehenaTransportPicker value={{ transportProviderId: null, transportCompany: '' }} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText('Kampuni ya usafiri'), { target: { value: 'Shabiby' } });
  expect(onChange).toHaveBeenLastCalledWith({ transportProviderId: null, transportCompany: 'Shabiby' });
});

test('no transport on KenteXa yet: just the name box, as before', async () => {
  api.get.mockResolvedValue({ data: { transport: [] } });
  render(<ShehenaTransportPicker value={{ transportProviderId: null, transportCompany: '' }} onChange={jest.fn()} />);
  expect(await screen.findByLabelText('Kampuni ya usafiri')).toBeTruthy();
  expect(screen.queryByRole('radiogroup')).toBeNull();
});

test('the transporter sees the shehena loaded onto it', async () => {
  api.get.mockResolvedValue({ data: { shehena: [{ id: 40, code: 'BULK-1', originCity: 'Dar es Salaam', destinationCity: 'Mbeya',
    parcels: 6, weightKg: 42.5, fare: 60000, fromOffice: 'Kariakoo Cargo', toOffice: 'Mbeya Cargo' }] } });
  render(<TransportShehenaList />);
  expect(await screen.findByText('Dar es Salaam → Mbeya')).toBeTruthy();
  expect(screen.getByText(/Vifurushi 6 · 42.5 kg · TZS 60,000/)).toBeTruthy();
  expect(screen.getByText(/Kutoka: Kariakoo Cargo/)).toBeTruthy();
});
