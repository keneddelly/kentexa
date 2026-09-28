import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '../../i18n';
import api from '../../api/api';
import RecipientJourney, { RecipientJourneyCard } from './RecipientJourney';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

const projection = (over = {}) => ({ isRecipient: true, trackingNumber: 'KTX-ORD-3', status: 'received_at_hub',
  stage: 'at_origin_hub', custody: { kind: 'origin_hub_received', holderType: 'super_agent', holderName: 'Stage3KR Kariakoo Hub' },
  destinationHub: null, delivery: null, cod: { amountDue: 50000 },
  recipientCode: { agentDeliveryPending: false, pickupPending: false }, actions: { chooseMethod: false }, ...over });

beforeEach(() => { localStorage.setItem('kentexa_lang', 'en'); api.get.mockReset(); });

describe('RecipientJourneyCard', () => {
  test('KTX-ORD-3 (origin hub): shows state, custody and COD but offers no premature action', () => {
    render(<RecipientJourneyCard journey={projection()} onChoose={jest.fn()} />);
    expect(screen.getByText('Your parcel is at the sending hub')).toBeInTheDocument();
    expect(screen.getByTestId('rj-custody')).toHaveTextContent('Stage3KR Kariakoo Hub');
    expect(screen.getByTestId('rj-cod')).toHaveTextContent('50,000');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByTestId('rj-code')).toBeNull();
  });

  test('choose_method reveals exactly one action and it calls onChoose', () => {
    const onChoose = jest.fn();
    render(<RecipientJourneyCard journey={projection({ stage: 'choose_method', status: 'arrived_at_hub',
      actions: { chooseMethod: true }, destinationHub: { name: 'Stage3KR Mbagala Hub', address: null } })} onChoose={onChoose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose delivery or pickup' }));
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  test('out for delivery: explains the SMS code without ever showing one; agent is the holder', () => {
    render(<RecipientJourneyCard journey={projection({ stage: 'out_for_delivery', status: 'out_for_delivery',
      custody: { kind: 'destination_agent_received', holderType: 'local_agent', holderName: 'Stage3KR Delivery Agent' },
      delivery: { agentName: 'Stage3KR Delivery Agent', fee: 2000, address: 'Mbagala' },
      recipientCode: { agentDeliveryPending: true, pickupPending: false } })} onChoose={jest.fn()} />);
    expect(screen.getByTestId('rj-code')).toHaveTextContent(/6-digit code was sent to your phone by SMS/);
    expect(screen.getByTestId('rj-custody')).toHaveTextContent('Stage3KR Delivery Agent');
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\b\d{6}\b/);
  });

  test('delivered is final: no COD reminder, no action', () => {
    render(<RecipientJourneyCard journey={projection({ stage: 'delivered', status: 'delivered', cod: null })} onChoose={jest.fn()} />);
    expect(screen.getByText('Delivered')).toBeInTheDocument();
    expect(screen.queryByTestId('rj-cod')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  test('non-recipient or no projection renders nothing', () => {
    const { container, rerender } = render(<RecipientJourneyCard journey={{ isRecipient: false }} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<RecipientJourneyCard journey={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('RecipientJourney (tracking-page entry)', () => {
  test('signed-out viewer only gets a sign-in prompt on destination-side statuses, and makes no API call', () => {
    const onNavigate = jest.fn();
    const { container, rerender } = render(<RecipientJourney trackingNumber="KTX-ORD-3" status="received_at_hub" isLoggedIn={false} onNavigate={onNavigate} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<RecipientJourney trackingNumber="KTX-ORD-3" status="arrived_at_hub" isLoggedIn={false} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onNavigate).toHaveBeenCalledWith('PublicLogin');
    expect(api.get).not.toHaveBeenCalled();
  });

  test('signed-in recipient: fetches the projection and choosing navigates to the existing choice page', async () => {
    api.get.mockResolvedValue({ data: projection({ stage: 'choose_method', status: 'arrived_at_hub', actions: { chooseMethod: true } }) });
    const onNavigate = jest.fn();
    render(<RecipientJourney trackingNumber="KTX-ORD-3" status="arrived_at_hub" isLoggedIn onNavigate={onNavigate} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Choose delivery or pickup' }));
    expect(api.get).toHaveBeenCalledWith('/super-agents/track/KTX-ORD-3/recipient-journey');
    expect(onNavigate).toHaveBeenCalledWith('BuyerParcelAction-KTX-ORD-3');
  });

  test('signed-in non-recipient sees nothing; a failed fetch fails closed (no action)', async () => {
    api.get.mockResolvedValueOnce({ data: { trackingNumber: 'KTX-ORD-3', isRecipient: false } });
    const first = render(<RecipientJourney trackingNumber="KTX-ORD-3" status="arrived_at_hub" isLoggedIn onNavigate={jest.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    expect(first.container).toBeEmptyDOMElement();
    first.unmount();
    api.get.mockRejectedValueOnce(new Error('403'));
    const second = render(<RecipientJourney trackingNumber="KTX-ORD-3" status="arrived_at_hub" isLoggedIn onNavigate={jest.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(second.container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
