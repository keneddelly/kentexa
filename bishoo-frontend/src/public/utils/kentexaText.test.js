import {
  formatText, formatName, formatCaption, formatPrice, formatPhone, tidySpaces, isShouting, leadSeparator,
} from './kentexaText';

describe('KenteXa text style (#374 part E)', () => {
  test('names typed all small get a capital first letter', () => {
    expect(formatName('duka la juma')).toBe('Duka la juma');
    expect(formatName('  mama  ntilie ')).toBe('Mama ntilie');
  });

  test('names typed with capitals stay exactly as written', () => {
    expect(formatName('iPhone 13 Pro')).toBe('iPhone 13 Pro');
    expect(formatName('KenteXa')).toBe('KenteXa');
    expect(formatName('TBC')).toBe('TBC');
    expect(formatName('eBay')).toBe('eBay');
  });

  test('a long shouted line is shown in sentence case; short codes stay', () => {
    expect(isShouting('TUNAUZA SIMU MPYA KWA BEI NAFUU SANA')).toBe(true);
    expect(isShouting('BEI 100,000 TZS')).toBe(false);
    expect(formatText('TUNAUZA SIMU MPYA KWA BEI NAFUU SANA. LIPA KWA M-PESA AU TZS CASH'))
      .toBe('Tunauza simu mpya kwa bei nafuu sana. Lipa kwa M-PESA au TZS cash');
    expect(formatText('OFA LEO')).toBe('OFA LEO');
  });

  test('each sentence starts with a capital when the writer used none', () => {
    expect(formatText('habari zenu. leo tuna ofa! karibuni sana? ndiyo'))
      .toBe('Habari zenu. Leo tuna ofa! Karibuni sana? Ndiyo');
    expect(formatText('mstari wa kwanza\nmstari wa pili')).toBe('Mstari wa kwanza\nMstari wa pili');
  });

  test('tags, mentions, links, numbers and brand spellings are not changed', () => {
    expect(formatText('#biashara ni nzuri')).toBe('#biashara ni nzuri');
    expect(formatText('@juma karibu')).toBe('@juma karibu');
    expect(formatText('angalia www.kentexa.com sasa')).toBe('Angalia www.kentexa.com sasa');
    expect(formatText('nimenunua. iPhone ni nzuri')).toBe('Nimenunua. iPhone ni nzuri');
    expect(formatText('100,000/= tu')).toBe('100,000/= tu');
    expect(formatText('subiri... kidogo')).toBe('Subiri... kidogo');
  });

  test('spaces are tidied; emoji and line breaks kept; at most one empty line', () => {
    expect(tidySpaces('habari   yako , rafiki ?')).toBe('habari yako, rafiki?');
    expect(tidySpaces('a\n\n\n\nb')).toBe('a\n\nb');
    expect(formatText('karibu 🎉🎉  sana\n\nasante')).toBe('Karibu 🎉🎉 sana\n\nAsante');
  });

  test('no spelling fixes or rewriting', () => {
    expect(formatText('Nmekuja kununua vitu')).toBe('Nmekuja kununua vitu');
  });

  test('a caption title becomes the bold start; duplicates show once', () => {
    expect(formatCaption('wafanya biashara kariakoo', 'hivi ni biashara gani?'))
      .toEqual({ lead: 'Wafanya biashara kariakoo', text: 'Hivi ni biashara gani?' });
    expect(formatCaption('Ofa leo', 'Ofa leo')).toEqual({ lead: '', text: 'Ofa leo' });
    expect(formatCaption('Ofa leo', 'ofa leo! simu zote 20% punguzo')).toEqual({ lead: '', text: 'Ofa leo! Simu zote 20% punguzo' });
    expect(formatCaption('', 'habari')).toEqual({ lead: '', text: 'Habari' });
    expect(formatCaption('habari tu', '')).toEqual({ lead: '', text: 'Habari tu' });
    expect(formatCaption('Bei gani?', 'nauliza tu')).toEqual({ lead: 'Bei gani?', text: 'Nauliza tu' });
    expect(leadSeparator('Bei gani?')).toBe(' ');
    expect(leadSeparator('Ofa')).toBe(': ');
  });

  test('prices and phone numbers', () => {
    expect(formatPrice(100000)).toBe('100,000 TZS');
    expect(formatPrice('2500.4')).toBe('2,500 TZS');
    expect(formatPrice(0)).toBe('');
    expect(formatPhone('0712345678')).toBe('0712 345 678');
    expect(formatPhone('+255712345678')).toBe('+255 712 345 678');
    expect(formatPhone('255 712 345 678')).toBe('+255 712 345 678');
    expect(formatPhone('12345')).toBe('12345');
  });

  test('empty input is safe', () => {
    expect(formatText(null)).toBe('');
    expect(formatName(undefined)).toBe('');
  });
});
