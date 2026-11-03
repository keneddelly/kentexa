import { cleanPermissions, invitePhone, inviteLink, inviteMessage, maskPhone, roleLabel, samePhone } from './team-invitation-rules';

describe('team invitation rules (owner approved 2026-11-03)', () => {
  it('accepts Tanzanian mobile numbers in any common shape', () => {
    expect(invitePhone('0712 345 678')).toBe('255712345678');
    expect(invitePhone('+255 612345678')).toBe('255612345678');
    expect(invitePhone('12345')).toBeNull();
    expect(samePhone('0712345678', '255712345678')).toBe(true);
    expect(samePhone('0712345678', '0712345679')).toBe(false);
    expect(samePhone('', '')).toBe(false);
  });
  it('shows only a masked number to whoever holds the link', () => {
    expect(maskPhone('255712345678')).toBe('07•• ••• 678');
  });
  it('keeps only known permission switches', () => {
    expect(cleanPermissions({ canOperatePOS: true, canManageTeam: 'yes', isAdmin: true })).toEqual({ canOperatePOS: true });
  });
  it('builds the link and the WhatsApp/SMS text', () => {
    const link = inviteLink('https://kentexa.com/', 'abc');
    expect(link).toBe('https://kentexa.com/?teamInvite=abc');
    expect(inviteMessage('Asha Juma', 'BiS', 'sales', link)).toBe(`Habari Asha, BiS imekualika kuwa ${roleLabel('sales')} kwenye KenteXa. Fungua ukubali: ${link}`);
  });
});
