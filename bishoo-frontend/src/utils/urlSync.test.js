import { pageToPath, pathToPage, pathToNavParams } from './urlSync';

describe('shareable category routes', () => {
  test('maps an internal category page to its public URL', () => {
    expect(pageToPath('Category-electronics')).toBe('/category/electronics');
  });

  test('opens a category URL directly, including a trailing slash', () => {
    expect(pathToPage('/category/electronics/')).toBe('Category-electronics');
  });

  test('normalizes category keys and rejects unsafe characters', () => {
    expect(pathToPage('/category/MUSICAL_INSTRUMENTS')).toBe('Category-musical_instruments');
    expect(pageToPath('Category-electronics?x')).toBeNull();
    expect(pathToPage('/category/electronics%2Fvehicles')).toBeNull();
  });
});

describe('existing product and store routes remain compatible', () => {
  test('keeps existing numeric and slugged product URLs', () => {
    expect(pageToPath('ProductDetail-42')).toBe('/product/42');
    expect(pathToPage('/product/42-camera-name')).toBe('ProductDetail-42');
  });

  test('preserves store profile context query parameters', () => {
    expect(pageToPath('CommerceProfile-18', { commerceProfileId: 27 })).toBe('/store/18?cp=27');
    expect(pathToNavParams('/store/18', '?cp=27')).toEqual({ commerceProfileId: 27 });
  });
});
