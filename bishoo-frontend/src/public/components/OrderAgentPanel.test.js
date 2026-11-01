import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../../api/api';
import OrderAgentPanel, { agentLine } from './OrderAgentPanel';

jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn() }));

const claimed = { id: 5, status: 'claimed', servicePath: 'direct_delivery', agent: { name: 'Juma', phone: '0754000111' }, canShowCode: true };

afterEach(() => jest.resetAllMocks());

test('the seller sees who is coming and gets the code to hand over', async () => {
  api.get.mockResolvedValue({ data: { task: claimed } });
  api.post.mockResolvedValue({ data: { code: '482913', expiresInSeconds: 600 } });
  render(<OrderAgentPanel orderId={9} viewer="seller" />);
  expect(await screen.findByText('Juma')).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith('/orders/9/agent-job');
  fireEvent.click(screen.getByTestId('order-agent-show-code'));
  await waitFor(() => expect(screen.getByTestId('order-agent-code')).toHaveTextContent('482913'));
  expect(api.post).toHaveBeenCalledWith('/orders/9/agent-job/handoff-code');
});

test('the buyer sees the agent, what to pay, and gets the receive code', async () => {
  api.get.mockResolvedValue({ data: { task: { ...claimed, status: 'collected' } } });
  api.post.mockResolvedValue({ data: { code: '102938' } });
  render(<OrderAgentPanel orderId={9} viewer="buyer" codAmount={45000} />);
  expect(await screen.findByText(/Juma ana mzigo wako/)).toBeInTheDocument();
  expect(screen.getByText(/TZS 45,000/)).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('order-agent-show-code'));
  await waitFor(() => expect(screen.getByTestId('order-agent-code')).toHaveTextContent('102938'));
  expect(api.post).toHaveBeenCalledWith('/orders/9/delivery-agent/receive-code');
});

test('nothing shows when the order has no agent job', async () => {
  api.get.mockResolvedValue({ data: { task: null } });
  const { container } = render(<OrderAgentPanel orderId={9} viewer="buyer" />);
  await waitFor(() => expect(api.get).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
});

test('both sides read the handover in plain words', () => {
  expect(agentLine({ status: 'collected', servicePath: 'direct_delivery', agent: { name: 'Juma' } }, 'seller')).toMatch(/^Umemkabidhi Juma mzigo/);
  expect(agentLine({ status: 'delivered', servicePath: 'direct_delivery', agent: { name: 'Juma' } }, 'buyer')).toMatch(/^Umepokea mzigo kutoka kwa Juma/);
});
