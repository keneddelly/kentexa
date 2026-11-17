import { traySlots, TRAY_ORDER } from './feedTrays';

test('a tray after every 2 posts, in the approved order, skipping empty ones', () => {
  expect(TRAY_ORDER).toHaveLength(15); // + Mfululizo (#410)
  expect(traySlots(8, ['products', 'services', 'polls'])).toEqual({ 1: 'products', 3: 'services', 5: 'polls', 7: 'products' });
});

test('one kind shows once; a 1-post feed still gets a tray; nothing available, nothing', () => {
  expect(traySlots(10, ['hotels'])).toEqual({ 1: 'hotels' });
  expect(traySlots(1, ['articles', 'polls'])).toEqual({ 0: 'articles' });
  expect(traySlots(6, [])).toEqual({});
});
