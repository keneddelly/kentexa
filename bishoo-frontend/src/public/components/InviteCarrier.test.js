import { inviteMessage, inviteUrl } from './InviteCarrier';

test('the invitation names the role and links to its application', () => {
  const t = inviteMessage({ role: 'office', shopName: 'Duka la Neema', destCity: 'Mbeya', origin: 'https://kentexa.com' });
  expect(t).toBe('Habari, ni Duka la Neema kwenye KenteXa. Nina mizigo kwenda Mbeya. Jiunge KenteXa kama ofisi ya mizigo tufanye kazi pamoja: https://kentexa.com/?join=office');
  expect(inviteMessage({ role: 'transport', origin: 'https://kentexa.com' })).toMatch(/kama msafirishaji .*\?join=transport$/);
  expect(inviteUrl({ phone: '0712 345 678', text: 'a b' })).toBe('https://wa.me/255712345678?text=a%20b');
  expect(inviteUrl({ phone: '', text: 'x' })).toBe('https://wa.me/?text=x');
});
