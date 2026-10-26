import { localPhone, withOfficePhone } from './office-sms';

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
