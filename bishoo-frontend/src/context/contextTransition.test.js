import { contextTransitionState } from './contextTransition';

test('transport to seller transition cannot retain transport navigation history', () => {
  const previous = { page: 'TransportProviderDashboard', navHistory: ['Home', 'VanToday'], navParams: { assignmentId: 4 } };
  const next = { ...previous, ...contextTransitionState('SellerDashboard') };
  expect(next).toEqual({ page: 'SellerDashboard', navHistory: [], navParams: null });
});

test('seller to transport transition cannot retain seller navigation history', () => {
  const previous = { page: 'SellerInbox', navHistory: ['SellerDashboard'], navParams: { conversationId: 8 } };
  const next = { ...previous, ...contextTransitionState('TransportProviderDashboard') };
  expect(next).toEqual({ page: 'TransportProviderDashboard', navHistory: [], navParams: null });
});
