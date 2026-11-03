import { compactSms, smsParts, smsReady, toGsm7 } from './sms-text';

// SMS cost (owner 2026-11-03): TZS 22 per part; one emoji or long dash makes a part 70 characters.
describe('sms text: stay in the 160-character mode', () => {
  it('typographic characters become plain ones and emoji are dropped; Swahili words are unchanged', () => {
    expect(toGsm7('Imepokewa — Dar “sasa” ’hapa’ … 🎉✅')).toBe('Imepokewa - Dar "sasa" \'hapa\' ... ');
    expect(toGsm7('Habari Asha, kifurushi KTX 4829 1037 52 kimefika Mwanza.')).toBe('Habari Asha, kifurushi KTX 4829 1037 52 kimefika Mwanza.');
  });

  it('blank lines and line-end spaces are removed', () => {
    expect(compactSms('SAMATTA\n\nHabari Asha  \n\n\nVerified by Kentexa\n')).toBe('SAMATTA\nHabari Asha\nVerified by Kentexa');
  });

  it('counts the parts Africa\'s Talking charges', () => {
    expect(smsParts('a'.repeat(160))).toBe(1);
    expect(smsParts('a'.repeat(161))).toBe(2);
    expect(smsParts('a'.repeat(306))).toBe(2);
    expect(smsParts('a'.repeat(307))).toBe(3);
    expect(smsParts(`${'a'.repeat(100)}—`)).toBe(2); // Unicode: 70 per part, 67 when split
    expect(smsParts(smsReady(`${'a'.repeat(100)}—`))).toBe(1);
    expect(smsParts('{'.repeat(80))).toBe(1); // an extension character costs two
    expect(smsParts('{'.repeat(81))).toBe(2);
  });
});
