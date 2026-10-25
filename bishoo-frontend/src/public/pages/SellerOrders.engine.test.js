import { engineShippable, orderToSend } from './SellerOrders';

jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn(), patch: jest.fn() }));

test('a paid network order is sent through the engine; pay-on-delivery still owed, own delivery and already sent are not', () => {
  const o = { id: 9, status: 'paid', shippingMethod: 'agent', source: 'online' };
  expect(engineShippable(o)).toBe(true);
  expect(engineShippable({ ...o, shippingMethod: 'kentexa_delivery', status: 'preparing' })).toBe(true);
  expect(engineShippable({ ...o, shippingMethod: 'direct' })).toBe(false);
  expect(engineShippable({ ...o, codRemainingBalance: 20000 })).toBe(false);
  expect(engineShippable({ ...o, shippingNote: 'Imetumwa kupitia KenteXa' })).toBe(false);
  expect(engineShippable({ ...o, status: 'pending_payment' })).toBe(false);
});

test('the form opens with what the order already says', () => {
  expect(orderToSend({ id: 9, quantity: 2, baseAmount: 90000, recipientName: 'Neema', phone: '0754000111',
    deliveryAddress: 'Mbezi Beach, Kinondoni, Dar es Salaam', product: { id: 4, name: 'Taa', weightKg: 1.5 } })).toEqual({
    orderId: 9, name: 'Neema', phone: '0754000111', region: 'Dar es Salaam', district: 'Kinondoni', ward: 'Mbezi Beach',
    items: [{ name: 'Taa', qty: 2, price: 45000, weight: 1.5, productId: 4, classifiedId: null }],
  });
});
