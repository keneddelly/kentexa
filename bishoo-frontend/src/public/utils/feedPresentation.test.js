import { photoAspect, momentRoleLine } from '../utils/feedPresentation';

test('a photo keeps its own shape between portrait 4:5 and wide 16:9 (Phase B)', () => {
  expect(photoAspect(1)).toBe('1000 / 1000');          // square stays square
  expect(photoAspect(0.8)).toBe('800 / 1000');         // portrait 4:5
  expect(photoAspect(0.5)).toBe('800 / 1000');         // very tall: trimmed to 4:5
  expect(photoAspect(16 / 9)).toBe('1778 / 1000');     // wide 16:9
  expect(photoAspect(3)).toBe('1778 / 1000');          // panorama: trimmed to 16:9
  expect(photoAspect(null)).toBe('4 / 3');             // before the photo loads
});

test('a Moment says who is posting in plain words', () => {
  expect(momentRoleLine({ postType: 'looking_for', business: { actorType: 'BUSINESS' } })).toBe('Anatafuta');
  expect(momentRoleLine({ postType: 'moment', business: { actorType: 'BUSINESS' } })).toBe('Biashara');
  expect(momentRoleLine({ postType: 'moment', business: { actorType: 'PERSONAL' } })).toBe('');
});
