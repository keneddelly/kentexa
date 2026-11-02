import { personalAttention, roleAttention } from './workspaceAttention';

const apiWith = (answers) => ({ get: jest.fn(async (url) => {
  if (answers[url] instanceof Error) throw answers[url];
  return { data: answers[url] };
}) });

test('office: parcels coming in and to send, from the existing desk endpoints', async () => {
  const items = await roleAttention(apiWith({
    '/pickup-tasks/hub/expected': [{ id: 1 }, { id: 2 }], '/super-agents/bulk-shipments/candidates': [{ id: 9 }],
  }), 'super_agent');
  expect(items.map((i) => [i.key, i.count])).toEqual([['office.incoming', 2], ['office.send', 1]]);
});

test('agent: jobs in hand and new jobs nearby', async () => {
  const items = await roleAttention(apiWith({
    '/pickup-tasks/available': [{ id: 1 }], '/pickup-tasks/mine': [{ status: 'claimed' }, { status: 'delivered' }],
  }), 'agent');
  expect(items.map((i) => [i.key, i.count])).toEqual([['agent.doing', 1], ['agent.available', 1]]);
});

test('transport and services: only open requests not answered yet', async () => {
  const inbox = { requests: [{ status: 'open', myOffer: null }, { status: 'open', myOffer: { id: 1 } }, { status: 'closed' }] };
  expect((await roleAttention(apiWith({ '/quote-requests/inbox': inbox }), 'transport_provider'))[0].count).toBe(1);
  expect((await roleAttention(apiWith({ '/quote-requests/inbox': inbox }), 'service_provider'))[0].count).toBe(1);
});

test('a failing source, a zero, or a role with no source shows nothing', async () => {
  expect(await roleAttention(apiWith({ '/seller/dashboard': new Error('down') }), 'seller')).toEqual([]);
  expect(await roleAttention(apiWith({ '/quote-requests/inbox': { requests: [] } }), 'transport_provider')).toEqual([]);
  expect(await roleAttention(apiWith({}), 'buyer')).toEqual([]);
  expect(await personalAttention(apiWith({ '/orders/my-orders': new Error('down') }), { inboxUnread: 0 })).toEqual([]);
});
