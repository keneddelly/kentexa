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

describe('HubExpectedShipments — the desk receives by the customer\'s Shipment number', () => {
  const expected = [
    { parcelId: 11, trackingNumber: 'KTX-SHP-1', itemDescription: 'Nguo', weightKg: 2, destinationCity: 'Mwanza', sender: { name: 'Baraka', phone: '0713' },
      bookedTrip: { departureAt: '2026-10-08T03:00:00.000Z', providerName: 'Kentexa Van' }, pickupTask: null, nextAction: 'receive_from_sender' },
    { parcelId: 12, trackingNumber: 'KTX-SHP-2', itemDescription: 'Viatu', weightKg: 1, destinationCity: 'Mwanza', sender: { name: 'Asha', phone: null },
      bookedTrip: null, pickupTask: { id: 40, status: 'awaiting_hub', agentName: 'Agent Nine' }, nextAction: 'confirm_agent_handover' },
    { parcelId: 13, trackingNumber: 'KTX-SHP-3', itemDescription: 'Vitabu', weightKg: 0, destinationCity: 'Arusha', sender: { name: 'Neema', phone: null },
      bookedTrip: null, pickupTask: { id: 41, status: 'claimed', agentName: 'Agent Ten' }, nextAction: 'agent_on_the_way' },
  ];

  test('a typed customer number is received through the parcel status door', async () => {
    api.get.mockResolvedValue({ data: [] });
    api.patch.mockResolvedValue({ data: {} });
    const onReceived = jest.fn();
    render(<HubExpectedShipments onReceived={onReceived} />);
    fireEvent.change(await screen.findByLabelText('Shipment number'), { target: { value: ' ktx-shp-42 ' } });
    fireEvent.click(screen.getByText('Receive'));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/super-agents/parcels/KTX-SHP-42/status', { status: 'received_at_hub' }));
    await waitFor(() => expect(onReceived).toHaveBeenCalled());
  });

  test('each expected parcel offers exactly the action the server allows', async () => {
    api.get.mockResolvedValue({ data: expected });
    api.post.mockResolvedValue({ data: {} });
    render(<HubExpectedShipments />);
    expect(await screen.findByText('Sender is here — receive parcel')).toBeInTheDocument();
    expect(screen.getByText(/Booked on Kentexa Van/)).toBeInTheDocument();
    expect(screen.getByText('Agent Ten is bringing this parcel.')).toBeInTheDocument();
    // A parcel an Agent is carrying has no "receive" button of its own.
    expect(screen.getAllByText('Sender is here — receive parcel')).toHaveLength(1);
    fireEvent.click(screen.getByText('Confirm receipt from Agent Nine'));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/pickup-tasks/40/hub-receive'));
  });

  test('a refusal is shown as the server worded it', async () => {
    api.get.mockResolvedValue({ data: [expected[0]] });
    api.patch.mockRejectedValue({ response: { data: { message: 'Parcel has an open Agent pickup' } } });
    render(<HubExpectedShipments />);
    fireEvent.click(await screen.findByText('Sender is here — receive parcel'));
    expect(await screen.findByRole('alert')).toHaveTextContent('open Agent pickup');
  });
});
