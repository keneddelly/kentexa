import { classifiedLink, postLink, productLink, profileLink, slugify } from './shareLinks';

test('professional links on kentexa.com (owner 2026-11-03)', () => {
  expect(slugify('Simu Samsung A15 (128GB)!')).toBe('simu-samsung-a15-128gb');
  expect(productLink(42, 'Simu Samsung A15')).toBe('https://kentexa.com/product/42-simu-samsung-a15');
  expect(classifiedLink(7, '')).toBe('https://kentexa.com/classified/7');
  expect(postLink(88)).toBe('https://kentexa.com/post/88');
  expect(profileLink('Bishoo')).toBe('https://kentexa.com/@bishoo');
  expect(profileLink(null, 17, 5)).toBe('https://kentexa.com/store/17?cp=5');
});
