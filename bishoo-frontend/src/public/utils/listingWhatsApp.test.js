import { listingInquiryText, listingUrl, listingWhatsAppHref, waNumber } from './listingWhatsApp';

test('a Tanzanian number in any form becomes the wa.me number', () => {
  expect(waNumber('0712 345 678')).toBe('255712345678');
  expect(waNumber('+255 712-345-678')).toBe('255712345678');
  expect(waNumber('712345678')).toBe('255712345678');
  expect(waNumber('')).toBeNull();
  expect(waNumber('123')).toBeNull();
});

test('the listing link is its public KenteXa page', () => {
  expect(listingUrl('product', 42, 'https://kentexa.com')).toBe('https://kentexa.com/product/42');
  expect(listingUrl('classified', '7', 'https://kentexa.com')).toBe('https://kentexa.com/classified/7');
  expect(listingUrl('product', null)).toBeNull();
  expect(listingUrl('moment', 3)).toBeNull();
});

test('the seller sees the item, its price, that it came from KenteXa, and the link', () => {
  expect(listingInquiryText({ kind: 'product', title: 'Saa ya ukutani', price: 300000, shopName: 'BIS', url: 'https://kentexa.com/product/42' }))
    .toBe('Habari BIS, nimeona bidhaa hii kwenye KenteXa: Saa ya ukutani (TZS 300,000). Bado ipo?\nhttps://kentexa.com/product/42');
  expect(listingInquiryText({ kind: 'classified', title: 'Toyota IST', url: 'https://kentexa.com/classified/9' }))
    .toBe('Habari, nimeona tangazo lako kwenye KenteXa: Toyota IST. Bado ipo?\nhttps://kentexa.com/classified/9');
  expect(listingInquiryText({ kind: 'service', title: 'Fundi bomba', shopName: 'Juma' }))
    .toBe('Habari Juma, nimeona huduma yako kwenye KenteXa: Fundi bomba. Ningependa kujua zaidi.');
  expect(listingInquiryText({ kind: 'transport', shopName: 'Mtei Express', url: 'https://kentexa.com/store/5' }))
    .toContain('huduma yako ya usafiri kwenye KenteXa');
});

test('the wa.me link carries the whole message', () => {
  const href = listingWhatsAppHref({ phone: '0712345678', kind: 'product', title: 'Kiatu', price: 25000, url: 'https://kentexa.com/product/3' });
  expect(href.startsWith('https://wa.me/255712345678?text=')).toBe(true);
  expect(decodeURIComponent(href.split('?text=')[1])).toContain('https://kentexa.com/product/3');
  expect(listingWhatsAppHref({ phone: '', kind: 'product' })).toBeNull();
});
