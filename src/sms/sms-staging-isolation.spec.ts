import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';

describe('isolated staging SMS', () => {
  it('boots without an API key and fails closed for sensitive and ordinary sends', async () => {
    const config = { get: (key: string) => key === 'STAGE3KR_DISABLE_OUTBOUND_SMS' ? 'true' : undefined };
    const service = new SmsService(config as ConfigService);
    expect(await service.sendSms('+255712000000', 'ordinary')).toBe(false);
    expect(await service.sendOtp('+255712000000', '123456')).toBe(false);
  });
  it('rejects staging sends without an explicit rehearsed number and live credentials', async () => {
    const values: Record<string, string> = { DB_NAME: 'kentexa_stage3kr',
      DB_USERNAME: 'kentexa_stage3kr', STAGE3KR_DISABLE_OUTBOUND_SMS: 'false' };
    const service = new SmsService({ get: (key: string) => values[key] } as ConfigService);
    expect(await service.sendSms('+255712000000', 'sensitive', true)).toBe(false);
  });
  it('refuses another recipient before calling the provider in rehearsal mode', async () => {
    const values: Record<string, string> = { DB_NAME: 'kentexa_stage3kr',
      DB_USERNAME: 'kentexa_stage3kr', STAGE3KR_DISABLE_OUTBOUND_SMS: 'false',
      STAGE3KR_SMS_REHEARSAL: 'true', STAGE3KR_SMS_TEST_PHONE: '+255712000000',
      AT_API_KEY: 'test-key', AT_USERNAME: 'test-account' };
    const service = new SmsService({ get: (key: string) => values[key] } as ConfigService);
    expect(await service.sendSms('+255713000000', 'private code', true)).toBe(false);
  });
});
