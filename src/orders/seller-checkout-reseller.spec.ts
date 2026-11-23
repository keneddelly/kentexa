import { buildSellerCheckoutMessage } from './seller-checkout-notice';

const base = {
  orders: [{ id: 7, productName: 'Mini WiFi camera', quantity: 1, totalAmount: 147000, deliveryFeeAmount: 0, paymentMethod: 'cod' } as any],
  place: 'Ilala',
  buyerName: 'Juma',
  buyerPhone: '0712000000',
  link: 'https://kentexa.test/s/abc',
};

describe('seller checkout message names the reseller', () => {
  it('adds the reseller line when one reseller sold the order', () => {
    const text = buildSellerCheckoutMessage({ ...base, resellerLabel: 'Neema M.' });
    expect(text).toContain('Kupitia muuzaji: Neema M.');
  });
  it('leaves the message unchanged without a reseller', () => {
    const text = buildSellerCheckoutMessage(base);
    expect(text).not.toContain('Kupitia muuzaji');
  });
});
