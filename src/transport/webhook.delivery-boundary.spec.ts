import { ConflictException } from '@nestjs/common';
import { WebhookController } from './webhook.controller';

describe('transport webhook terminal delivery boundary', () => {
  it('cannot mark a Parcel delivered from an API key and tracking number alone', async () => {
    const providerRepo: any = { findOne: jest.fn(), update: jest.fn() };
    const parcelRepo: any = { findOne: jest.fn(), update: jest.fn() };
    const trackingRepo: any = { save: jest.fn() };
    const sms: any = { sendSms: jest.fn() };
    const controller = new WebhookController(providerRepo, parcelRepo, trackingRepo, sms);
    await expect(controller.delivered('enabled-provider-key', {
      trackingNumber: 'KTX-PARCEL-31', receivedBy: 'Someone',
    })).rejects.toThrow(ConflictException);
    expect(parcelRepo.update).not.toHaveBeenCalled();
    expect(trackingRepo.save).not.toHaveBeenCalled();
    expect(sms.sendSms).not.toHaveBeenCalled();
  });
});
