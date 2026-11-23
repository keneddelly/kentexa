import { shortResellerName } from './orders.service';

describe('shortResellerName', () => {
  it('keeps the first name and an initial of the second', () => {
    expect(shortResellerName('Neema Mwakasege')).toBe('Neema M.');
  });
  it('keeps a single name as it is', () => {
    expect(shortResellerName('Dativa')).toBe('Dativa');
  });
  it('falls back when the name is missing', () => {
    expect(shortResellerName(null)).toBe('muuzaji wa kiungo');
  });
  it('caps very long names', () => {
    expect(shortResellerName('Abcdefghijklmnopqrstuvwxyz Q').length).toBeLessThanOrEqual(18);
  });
});
