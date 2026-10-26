import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RunBookings from './RunBookings';
import HubExpectedShipments from './HubExpectedShipments';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
beforeEach(() => { api.get.mockReset(); api.post.mockReset(); api.patch.mockReset(); });

describe('RunBookings — the transporter sees what was booked on their trip', () => {
  const bookings = [
    { shipmentId: 1, trackingNumber: 'KTX-SHP-1', itemDescription: 'Nguo', weightKg: 2, parcelId: 11, loadStop: 'Kariakoo', unloadStop: 'Mbagala', state: 'ready_to_assign' },
    { shipmentId: 2, trackingNumber: 'KTX-SHP-2', itemDescription: 'Viatu', weightKg: 1, parcelId: 12, loadStop: 'Kariakoo', unloadStop: 'Mbagala', state: 'awaiting_parcel' },
    { shipmentId: 3, trackingNumber: 'KTX-SHP-3', itemDescription: 'Vitabu', weightKg: 0, parcelId: null, loadStop: 'Kariakoo', unloadStop: 'Mbagala', state: 'not_confirmed' },
  ];

  test('loads on demand, shows each parcel\'s state, and only a parcel at the load hub can be accepted', async () => {
    api.get.mockResolvedValue({ data: bookings });
    api.post.mockResolvedValue({ data: { id: 90 } });
    const onAssigned = jest.fn();
    render(<RunBookings runId={7} onAssigned={onAssigned} />);
    expect(api.get).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Booked parcels'));
    expect(await screen.findByText('KTX-SHP-1')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/van-pilot/runs/7/bookings');
    expect(screen.getByText('At the load hub — ready')).toBeInTheDocument();
    expect(screen.getByText('Not at the load hub yet')).toBeInTheDocument();
    expect(screen.getByText('Sender has not confirmed yet')).toBeInTheDocument();
    expect(screen.getAllByText('Accept onto this trip')).toHaveLength(1);

    fireEvent.click(screen.getByText('Accept onto this trip'));
    // The request names only the Run and the parcel -- never stops.
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/van-pilot/runs/7/bookings/11/assign'));
    await waitFor(() => expect(onAssigned).toHaveBeenCalled());
  });

  test('says so when nobody has booked, and shows the server\'s reason when acceptance is refused', async () => {
    api.get.mockResolvedValueOnce({ data: [] });
    const { unmount } = render(<RunBookings runId={7} />);
    fireEvent.click(screen.getByText('Booked parcels'));
    expect(await screen.findByText('No sender has booked this trip yet.')).toBeInTheDocument();
    unmount();

    api.get.mockResolvedValue({ data: [bookings[0]] });
    api.post.mockRejectedValue({ response: { data: { message: "This Run's assigned vehicle is at its parcel-count capacity (2)" } } });
    render(<RunBookings runId={7} />);
    fireEvent.click(screen.getByText('Booked parcels'));
    fireEvent.click(await screen.findByText('Accept onto this trip'));
    expect(await screen.findByRole('alert')).toHaveTextContent('parcel-count capacity');
  });
});

describe('HubExpectedShipments — the office receives every parcel by its one waybill', () => {
  const expected = [
    { parcelId: 11, trackingNumber: 'KTX-SHP-1', waybill: 'KTX 4829 1037 52', itemDescription: 'Nguo', weightKg: 2, destinationCity: 'Mwanza', sender: { name: 'Baraka', phone: '0713' },
      bookedTrip: { departureAt: '2026-10-08T03:00:00.000Z', providerName: 'Kentexa Van' }, pickupTask: null, nextAction: 'receive_from_sender' },
    { parcelId: 12, trackingNumber: 'KTX-SHP-2', itemDescription: 'Viatu', weightKg: 1, destinationCity: 'Mwanza', sender: { name: 'Asha', phone: null },
      bookedTrip: null, pickupTask: { id: 40, status: 'awaiting_hub', agentName: 'Agent Nine' }, nextAction: 'confirm_agent_handover' },
    { parcelId: 13, trackingNumber: 'KTX-SHP-3', itemDescription: 'Vitabu', weightKg: 0, destinationCity: 'Arusha', sender: { name: 'Neema', phone: null },
      bookedTrip: null, pickupTask: { id: 41, status: 'claimed', agentName: 'Agent Ten' }, nextAction: 'agent_on_the_way' },
    { parcelId: 14, trackingNumber: 'KTX-ORD-77', waybill: 'KTX 9815 9515 21', orderId: 77, itemDescription: 'Saa ya ukutani', weightKg: 0, destinationCity: 'Mbeya',
      sender: { name: 'BIS', phone: null }, bookedTrip: null, pickupTask: null, nextAction: 'receive_order' },
  ];

  test('a typed number is received through the parcel status door', async () => {
    api.get.mockResolvedValue({ data: [] });
    api.patch.mockResolvedValue({ data: {} });
    const onReceived = jest.fn();
    render(<HubExpectedShipments onReceived={onReceived} />);
    fireEvent.change(await screen.findByLabelText('Namba ya mzigo'), { target: { value: ' ktx-shp-42 ' } });
    fireEvent.click(screen.getByText('Pokea'));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/super-agents/parcels/KTX-SHP-42/status', { status: 'received_at_hub' }));
    await waitFor(() => expect(onReceived).toHaveBeenCalled());
  });

  test('each expected parcel shows its waybill and offers exactly the action the server allows', async () => {
    api.get.mockResolvedValue({ data: expected });
    api.post.mockResolvedValue({ data: {} });
    render(<HubExpectedShipments />);
    expect(await screen.findByText('Mtumaji yuko hapa — pokea mzigo')).toBeInTheDocument();
    expect(screen.getByText('KTX 4829 1037 52')).toBeInTheDocument();
    expect(screen.getByText(/Imewekwa kwenye Kentexa Van/)).toBeInTheDocument();
    expect(screen.getByText('Agent Ten analeta mzigo huu.')).toBeInTheDocument();
    // A parcel an Agent is carrying has no "receive" button of its own.
    expect(screen.getAllByText('Mtumaji yuko hapa — pokea mzigo')).toHaveLength(1);
    fireEvent.click(screen.getByText('Thibitisha umepokea kutoka kwa Agent Nine'));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/pickup-tasks/40/hub-receive'));
  });

  test('a marketplace order the seller brings is received with its order step', async () => {
    api.get.mockResolvedValue({ data: expected });
    api.patch.mockResolvedValue({ data: {} });
    render(<HubExpectedShipments />);
    expect(await screen.findByText('KTX 9815 9515 21')).toBeInTheDocument();
    expect(screen.getByText('Oda #77')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Muuzaji yuko hapa — pokea oda'));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/orders/77/super-agent-receive', {}));
  });

  test('typing an order\'s waybill uses the order step too', async () => {
    api.get.mockResolvedValue({ data: expected });
    api.patch.mockResolvedValue({ data: {} });
    render(<HubExpectedShipments />);
    fireEvent.change(await screen.findByLabelText('Namba ya mzigo'), { target: { value: 'ktx9815951521' } });
    fireEvent.click(screen.getByText('Pokea'));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/orders/77/super-agent-receive', {}));
  });

  test('a refusal is shown as the server worded it', async () => {
    api.get.mockResolvedValue({ data: [expected[0]] });
    api.patch.mockRejectedValue({ response: { data: { message: 'Parcel has an open Agent pickup' } } });
    render(<HubExpectedShipments />);
    fireEvent.click(await screen.findByText('Mtumaji yuko hapa — pokea mzigo'));
    expect(await screen.findByRole('alert')).toHaveTextContent('open Agent pickup');
  });
});

test('Kutoka KenteXa: each parcel says where it came from (marketplace order, seller order, customer shipment)', async () => {
  api.get.mockResolvedValue({ data: [
    { parcelId: 21, trackingNumber: 'KTX-ORD-1', orderId: 1, kind: 'marketplace', sender: { name: 'BIS' }, nextAction: 'receive_order' },
    { parcelId: 22, trackingNumber: 'KTX-ORD-2', orderId: 2, kind: 'seller', sender: { name: 'Duka' }, nextAction: 'receive_from_sender' },
    { parcelId: 23, trackingNumber: 'KTX-SHP-3', kind: 'shipment', sender: { name: 'Asha' }, nextAction: 'receive_from_sender' },
  ] });
  render(<HubExpectedShipments />);
  expect(await screen.findByTestId('kind-21')).toHaveTextContent('Oda ya sokoni');
  expect(screen.getByTestId('kind-22')).toHaveTextContent('Oda ya muuzaji');
  expect(screen.getByTestId('kind-23')).toHaveTextContent('Mzigo wa mteja');
  expect(screen.getAllByText(/analipa ada ya usafiri/)).toHaveLength(3);
});
