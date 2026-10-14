import { publicInitials } from './public-tracking-privacy';
import { WebhookController } from '../transport/webhook.controller';

// L5 (owner 2026-10-14): public tracking never shows a person's name or phone.
describe('public tracking privacy', () => {
  it('initials only, at most three; nothing for an empty name', () => {
    expect(publicInitials('Juma Ally Said Mohamed')).toBe('J. A. S.');
    expect(publicInitials('  asha   juma ')).toBe('A. J.');
    expect(publicInitials('Neema')).toBe('N.');
    expect(publicInitials('')).toBeNull();
    expect(publicInitials(null)).toBeNull();
    expect(publicInitials(' - ')).toBeNull();
  });

  it('/api/v1/track: initials for sender and receiver; no notes, handler names or phones', async () => {
    const parcel: any = {
      id: 3, trackingNumber: 'KTX-PCL-9', status: 'in_transit', originCity: 'Dar es Salaam', destinationCity: 'Mwanza',
      senderName: 'Kened Delly', senderPhone: '0711111111', recipientName: 'Asha Juma', recipientPhone: '0722222222',
      superAgent: { businessName: 'Kariakoo Hub' }, destinationSuperAgent: { businessName: 'Mwanza Hub' },
    };
    const tracking = [{ status: 'dispatched', city: 'Dar es Salaam', note: 'Imetumwa kwenda kwa Asha Juma 0722222222', updatedBy: 'Juma Salehe', createdAt: new Date() }];
    const c = new WebhookController(
      {} as any,
      { findOne: jest.fn(async () => parcel) } as any,
      { find: jest.fn(async () => tracking) } as any,
      {} as any,
    );
    const res: any = await c.publicTrack('KTX-PCL-9');
    expect(res.senderName).toBe('K. D.');
    expect(res.recipientName).toBe('A. J.');
    expect(res.history).toEqual([{ status: 'dispatched', city: 'Dar es Salaam', timestamp: tracking[0].createdAt }]);
    expect(JSON.stringify(res)).not.toMatch(/Kened|Delly|Asha|Juma|Salehe|0711111111|0722222222/);
    expect(res.originHub).toBe('Kariakoo Hub');   // offices' public names stay
  });
});
