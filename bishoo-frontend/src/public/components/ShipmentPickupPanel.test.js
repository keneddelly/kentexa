import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ShipmentPickupPanel, { pickupPathFor } from './ShipmentPickupPanel';
import ShipmentPickupQueue from './ShipmentPickupQueue';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

const direct = {
  id: 12, status: 'confirmed', originCity: 'Dar es Salaam', destinationCity: 'Dar es salaam ', originHubId: null,
  originHubSource: 'not_required', destinationHubSource: 'not_required', senderName: 'Baraka', senderPhone: '0713000002',
};

beforeEach(() => { api.get.mockReset(); api.post.mockReset(); });

describe('pickupPathFor', () => {
  test('a no-hub, one-city shipment can be delivered directly; a hub shipment is taken to its hub', () => {
    expect(pickupPathFor(direct)).toBe('direct_delivery');
    expect(pickupPathFor({ ...direct, originHubId: 7, originHubSource: 'sender_selected' })).toBe('hub_routed');
  });
  test('anything else has no Agent pickup to ask for', () => {
    expect(pickupPathFor({ ...direct, destinationCity: 'Mwanza' })).toBeNull();
    expect(pickupPathFor({ ...direct, destinationHubSource: 'sender_selected' })).toBeNull();
    expect(pickupPathFor({ ...direct, status: 'pending' })).toBeNull();
    expect(pickupPathFor(null)).toBeNull();
  });
});

describe('ShipmentPickupPanel — the sender', () => {
  test('requests a direct pickup with the sender as contact and a UUID key', async () => {
    api.get.mockResolvedValue({ data: { task: null } });
    api.post.mockResolvedValue({ data: { id: 5, status: 'requested' } });
    render(<ShipmentPickupPanel shipment={direct} />);
    fireEvent.click(await screen.findByText('Request pickup from me'));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [path, body] = api.post.mock.calls[0];
    expect(path).toBe('/shipments/12/pickup-task');
    expect(body).toMatchObject({ servicePath: 'direct_delivery', pickupContactName: 'Baraka', pickupContactPhone: '0713000002' });
    expect(body.requestKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  test('once an Agent has claimed it, shows who is coming and reveals the code only on request', async () => {
    api.get.mockResolvedValue({ data: { task: { id: 5, status: 'claimed', servicePath: 'direct_delivery', agent: { name: 'Agent Nine', phone: '0709' } } } });
    api.post.mockResolvedValue({ data: { taskId: 5, code: '482913', expiresInSeconds: 600 } });
    render(<ShipmentPickupPanel shipment={direct} />);
    expect(await screen.findByText('Agent Nine')).toBeInTheDocument();
    expect(screen.queryByLabelText('Handover code')).toBeNull();
    fireEvent.click(screen.getByText('Show handover code'));
    expect(await screen.findByLabelText('Handover code')).toHaveTextContent('482913');
    expect(api.post).toHaveBeenCalledWith('/shipments/12/pickup-task/handoff-code');
  });

  test('shows nothing when no pickup applies', async () => {
    api.get.mockResolvedValue({ data: { task: null } });
    const { container } = render(<ShipmentPickupPanel shipment={{ ...direct, destinationCity: 'Mwanza' }} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ShipmentPickupQueue — the Agent', () => {
  const available = [{ id: 5, servicePath: 'direct_delivery', pickupArea: 'Kariakoo, Ilala', destinationArea: 'Mbagala, Temeke', deliverTo: 'recipient', itemDescription: 'Nguo', weightKg: 2 }];
  const collected = [{
    id: 6, status: 'collected', servicePath: 'direct_delivery', trackingNumber: 'KTX-SHP-12', itemDescription: 'Viatu', weightKg: 1,
    pickupArea: 'Kariakoo', destinationArea: 'Mbagala', deliverTo: 'recipient', nextAction: 'deliver_to_recipient',
    recipient: { name: 'Amina Juma', phone: '0712000001', area: 'Mbagala' }, recipientCodeIssued: false,
  }];
  const serve = (mine) => api.get.mockImplementation((path) =>
    Promise.resolve({ data: path === '/pickup-tasks/available' ? available : mine }));

  test('lists claimable jobs by area only and claims one', async () => {
    serve([]);
    api.post.mockResolvedValue({ data: {} });
    const onCount = jest.fn();
    render(<ShipmentPickupQueue onCount={onCount} />);
    expect(await screen.findByText(/Kariakoo, Ilala → Mbagala, Temeke/)).toBeInTheDocument();
    await waitFor(() => expect(onCount).toHaveBeenLastCalledWith(1));
    fireEvent.click(screen.getByText('Claim this pickup'));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/pickup-tasks/5/claim'));
  });

  test('a collected direct delivery: send the recipient their code, then confirm with the code they give', async () => {
    serve(collected);
    api.post.mockResolvedValue({ data: {} });
    render(<ShipmentPickupQueue />);
    expect(await screen.findByText('Deliver to the recipient')).toBeInTheDocument();
    expect(screen.getByText(/Amina Juma/)).toBeInTheDocument();
    const confirm = screen.getByText('Confirm delivery');
    expect(confirm).toBeDisabled(); // no code entered yet
    fireEvent.click(screen.getByText('Send code to recipient'));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/pickup-tasks/6/delivery-code'));
    fireEvent.change(await screen.findByPlaceholderText('Recipient code'), { target: { value: '12a34 56' } });
    await waitFor(() => expect(screen.getByText('Confirm delivery')).not.toBeDisabled());
    fireEvent.click(screen.getByText('Confirm delivery'));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/pickup-tasks/6/deliver', { code: '123456' }));
  });

  test('renders nothing when there is no shipment pickup work, or the service is unavailable', async () => {
    api.get.mockRejectedValue(new Error('down'));
    const { container } = render(<ShipmentPickupQueue />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
  });
});
