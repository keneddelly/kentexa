import { CATEGORIES, validateAttributes } from './categories.data';

describe('category-aware posting questions', () => {
  test('every subcategory has unique questions and no repeated location', () => {
    for (const category of Object.values(CATEGORIES)) {
      for (const sub of Object.values(category.subcategories)) {
        const keys = (sub.attributes || []).map(a => a.key);
        expect(new Set(keys).size).toBe(keys.length);
        expect(keys).not.toContain('location');
      }
    }
  });
  test.each(['food', 'flowers', 'property', 'services', 'jobs', 'tickets_vouchers', 'ebooks', 'software', 'online_courses', 'digital_services', 'music_media', 'digital_general'])('%s never asks new/used condition', key => {
    for (const sub of Object.values(CATEGORIES[key].subcategories)) {
      expect(sub.attributes?.some(a => a.key === 'condition')).toBe(false);
    }
  });
  test.each([
    ['home_garden', 'furniture', true], ['home_garden', 'cleaning', false],
    ['health_beauty', 'skincare', false], ['health_beauty', 'medical', true],
    ['pets', 'pets_sale', false], ['pets', 'pet_supplies', true],
    ['construction', 'paint', false], ['construction', 'tools', true],
    ['weddings_events', 'catering_services', false], ['weddings_events', 'bridal_wear', true],
    ['office_supplies', 'printing_copying', false], ['office_supplies', 'office_electronics', true],
  ])('%s/%s condition applicability', (category, subcategory, expected) => {
    expect(CATEGORIES[category].subcategories[subcategory].attributes?.some(a => a.key === 'condition')).toBe(expected);
  });
  test('legacy wear grades remain valid when editing and required identity specs remain enforced', () => {
    expect(validateAttributes('electronics', 'smartphones', { brand: 'Apple', condition: 'Fair' })).toEqual([]);
    expect(validateAttributes('vehicles', 'cars', {})).toEqual(['Make is required', 'Model is required']);
  });
});
