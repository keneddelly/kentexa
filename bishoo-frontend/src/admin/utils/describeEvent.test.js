import { describeEvent } from './describeEvent';

// Owner 2026-11-09: the admin reads every action in plain Swahili.
test('named events and recorded changes read as Swahili', () => {
  expect(describeEvent({ eventType: 'ORDER_PLACED' })).toBe('ameweka oda');
  expect(describeEvent({ eventType: 'ACTION', targetId: 12, metadata: { method: 'PATCH', route: '/orders/:id/cancel' } })).toBe('amesitisha oda #12');
  expect(describeEvent({ eventType: 'ACTION', metadata: { method: 'POST', route: '/auth/login' } })).toBe('ameingia KenteXa');
  expect(describeEvent({ eventType: 'ACTION', targetId: 5, metadata: { method: 'POST', route: '/pickup-tasks/:id/claim' } })).toBe('amekubali kazi ya kuchukua #5');
  expect(describeEvent({ eventType: 'ACTION', metadata: { method: 'POST', route: '/products' } })).toBe('ameunda bidhaa');
  expect(describeEvent({ eventType: 'ACTION', targetId: 3, metadata: { method: 'DELETE', route: '/classifieds/:id' } })).toBe('amefuta tangazo #3');
  expect(describeEvent({ eventType: 'SOMETHING_NEW' })).toBe('something new');
});
