import { customerCollectsSelf, localPhone, samePhone, withOfficePhone } from './office-sms';

// Every SMS an office's action sends ends with the office's own number (owner 2026-10-26).
describe('withOfficePhone', () => {
  const office = { phone: '255712345678' };

  it('puts the office number just above "Verified by Kentexa"', () => {
    expect(withOfficePhone('Ar SAMATTA\n\nHabari Amina, kifurushi kimetumwa.\n\nVerified by Kentexa', office))
      .toBe('Ar SAMATTA\n\nHabari Amina, kifurushi kimetumwa.\nSimu ya ofisi: 0712 345 678\n\nVerified by Kentexa');
  });

  it('at the end when there is no "Verified" line; the user phone when the office has none', () => {
    expect(withOfficePhone('KenteXa: Code ni 123456.', { phone: null, user: { phone: '+255 754 000 111' } }))
      .toBe('KenteXa: Code ni 123456.\nSimu ya ofisi: 0754 000 111');
  });

  it('nothing added when the office has no phone, or the text already shows that number', () => {
    expect(withOfficePhone('Habari', null)).toBe('Habari');
    expect(withOfficePhone('Habari', { phone: '' })).toBe('Habari');
    const arrival = 'Ofisi\n\nImefika.\nSimu ya Hub: 0712345678\n\nVerified by Kentexa';
    expect(withOfficePhone(arrival, office)).toBe(arrival);
  });

  it('local phone format', () => {
    expect(localPhone('255712345678')).toBe('0712 345 678');
    expect(localPhone('0712345678')).toBe('0712 345 678');
    expect(localPhone('12')).toBeNull();
  });
});

// "Mteja mwenyewe atauchukua": one SMS to the customer instead of the partner hand-off.
describe('customerCollectsSelf', () => {
  it('matches phones in any format', () => {
    expect(samePhone('0788075633', '+255 788 075 633')).toBe(true);
    expect(samePhone('0788075633', '0788075634')).toBe(false);
    expect(samePhone('', '')).toBe(false);
  });
  it('is true only with no office and the customer as receiver', () => {
    expect(customerCollectsSelf(null, '0788075633', [{ buyerPhone: '255788075633' }])).toBe(true);
    expect(customerCollectsSelf({ id: 1 }, '0788075633', [{ buyerPhone: '255788075633' }])).toBe(false);
    expect(customerCollectsSelf(null, '0712000000', [{ buyerPhone: '255788075633' }])).toBe(false);
    expect(customerCollectsSelf(null, '0788075633', [{ buyerPhone: '0788075633' }, { buyerPhone: '0711111111' }])).toBe(false);
    expect(customerCollectsSelf(null, '0788075633', [])).toBe(false);
  });
});
