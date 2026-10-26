import { saleIntent, readPrice } from './saleIntent';

test('a sale with a price is an ad', () => {
  expect(saleIntent('Nauza simu Samsung A15 bei 420,000')).toEqual({ sale: true, price: 420000 });
  expect(saleIntent('Shati la linen Tsh 35000')).toEqual({ sale: true, price: 35000 });
  expect(saleIntent('Viatu 45k only, nipigie').price).toBe(45000);
  expect(saleIntent('Sofa inauzwa').sale).toBe(true);
});

test('news and updates stay Moments', () => {
  expect(saleIntent('Leo tumefungua tawi jipya Mwanza').sale).toBe(false);
  expect(saleIntent('Basi la saa 12 limeondoka na mizigo 36').sale).toBe(false);
  expect(saleIntent('Asanteni wateja wetu wote 2026').sale).toBe(false);
});

test('a Moment tagged to an existing listing is never a new ad', () => {
  expect(saleIntent('Nauza simu bei 400,000', { tagged: true }).sale).toBe(false);
});

test('prices in local forms', () => {
  expect(readPrice('bei 1.5 milioni')).toBe(1500000);
  expect(readPrice('laki 2')).toBe(null);          // number must come first
  expect(readPrice('2 laki')).toBe(200000);
  expect(readPrice('35,000/=')).toBe(35000);
  expect(readPrice('mwaka 2026')).toBe(null);
});
