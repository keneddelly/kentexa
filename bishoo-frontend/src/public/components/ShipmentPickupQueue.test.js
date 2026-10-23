import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ShipmentPickupQueue from './ShipmentPickupQueue';
import api from '../../api/api';
import sw from '../../locales/sw.json';

jest.mock('react-i18next', () => {
  const texts = require('../../locales/sw.json');
  return { useTranslation: () => ({ t: (key, vars) => {
    const v = key.split('.').reduce((o, k) => (o ? o[k] : undefined), texts) ?? key;
    return String(v).replace(/\{\{(\w+)\}\}/g, (_m, k) => (vars && vars[k] != null ? vars[k] : ''));
  } }) };
});
jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn() }));

const accepted = { id: 7, trackingNumber: 'KTX 9815 9515 21', itemDescription: null, pickupArea: 'Kariakoo', deliverTo: 'recipient',
  destinationArea: 'Mbagala', weightKg: 3, nextAction: 'collect_from_sender', pickupContact: { name: 'Asha', phone: '0711000000' } };
const waiting = { id: 8, itemDescription: null, pickupArea: 'Ilala', deliverTo: 'hub', originHubName: null, weightKg: 2, pickupWard: 'Gerezani' };

beforeEach(() => {
  api.get.mockImplementation(async (url) => ({ data: url === '/pickup-tasks/mine' ? [accepted] : [waiting] }));
  api.post.mockReset();
});

test('the agent job card is in Swahili (accepted job and a waiting job)', async () => {
  await act(async () => { render(<ShipmentPickupQueue />); });
  for (const text of [sw.pickup_queue.title, sw.pickup_queue.step_collect_from_sender, sw.pickup_queue.confirm_collection,
    sw.pickup_queue.cannot_come, sw.pickup_queue.claim, sw.pickup_queue.to_hub, sw.pickup_queue.ask_sender_code]) {
    expect(screen.getByText(text)).toBeInTheDocument();
  }
  expect(screen.getAllByText(sw.pickup_queue.parcel).length).toBe(2);
  expect(screen.getByPlaceholderText(sw.pickup_queue.sender_code)).toBeInTheDocument();
  expect(screen.queryByText(/Confirm collection|Claim this pickup|Collect from the sender|Shipment pickups/)).toBeNull();
});

test('COD boda job: the rider sees what to collect, and no "send code" once the buyer has it', async () => {
  const codJob = { id: 9, trackingNumber: 'KTX 1', itemDescription: 'Simu', pickupArea: 'Kariakoo', deliverTo: 'recipient',
    destinationArea: 'Mbagala', weightKg: 1, nextAction: 'deliver_to_recipient', recipientCodeIssued: true,
    recipient: { name: 'Amina', phone: '0712000001', area: 'Mbagala' }, cod: { goods: 80000, bodaFee: 3000, total: 83000 } };
  api.get.mockImplementation(async (url) => ({ data: url === '/pickup-tasks/mine' ? [codJob] : [] }));
  await act(async () => { render(<ShipmentPickupQueue />); });
  expect(screen.getByTestId('pickup-cod')).toHaveTextContent('Kusanya TZS 83,000 (bidhaa 80,000 + boda 3,000)');
  expect(screen.getByText(sw.pickup_queue.cod_code_sent)).toBeInTheDocument();
  expect(screen.queryByText(sw.pickup_queue.send_code)).toBeNull();
  expect(screen.queryByText(sw.pickup_queue.send_code_again)).toBeNull();
  expect(screen.getByText(sw.pickup_queue.confirm_delivery)).toBeInTheDocument();
});

test('"Siwezi kufika" asks first, then gives the job back and keeps the message visible', async () => {
  await act(async () => { render(<ShipmentPickupQueue />); });
  fireEvent.click(screen.getByText(sw.pickup_queue.cannot_come));
  expect(screen.getByTestId('release-confirm')).toHaveTextContent(sw.pickup_queue.cannot_come_confirm);
  api.post.mockResolvedValue({ data: { status: 'requested' } });
  api.get.mockImplementation(async () => ({ data: [] }));       // no job left afterwards
  await act(async () => { fireEvent.click(screen.getByText(sw.pickup_queue.cannot_come_yes)); });
  expect(api.post).toHaveBeenCalledWith('/pickup-tasks/7/release');
  expect(screen.getByRole('status')).toHaveTextContent(sw.pickup_queue.released_ok);
});
