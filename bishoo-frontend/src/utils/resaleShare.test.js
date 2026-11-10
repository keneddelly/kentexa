import { resaleLink, statusCaption } from './resaleShare';

test('the Status caption: name, the reseller price, the note and the link; never a supplier price', () => {
  const link = resaleLink({ id: 3, name: 'Simu Samsung A15' }, 7);
  expect(link).toMatch(/\/product\/3-simu-samsung-a15\?offer=7$/);
  expect(statusCaption({ name: 'Simu Samsung A15', price: 55000, note: 'Napeleka bure Kinondoni', link }))
    .toBe(`Simu Samsung A15\nBei: TZS 55,000\nNapeleka bure Kinondoni\nAgiza hapa: ${link}`);
  expect(statusCaption({ name: 'Taa', price: 12000, link: 'x' })).toBe('Taa\nBei: TZS 12,000\nAgiza hapa: x');
});

test('the link says where it was shared (owner 2026-11-10)', () => {
  expect(resaleLink({ id: 3, name: 'Simu' }, 7, 'status')).toMatch(/\/product\/3-simu\?offer=7&src=status$/);
  expect(resaleLink({ id: 3, name: 'Simu' }, 7, 'share')).toMatch(/\?offer=7&src=share$/);
});
