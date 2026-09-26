import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';

describe('isolated staging SMS', () => {
  it('boots without an API key and fails closed for sensitive and ordinary sends', async () => {
    const config = { get: (key: string) => key === 'STAGE3KR_DISABLE_OUTBOUND_SMS' ? 'true' : undefined };
    const service = new SmsService(config as ConfigService);
    expect(await service.sendSms('+255712000000', 'ordinary')).toBe(false);
    expect(await service.sendOtp('+255712000000', '123456')).toBe(false);
  });
});
