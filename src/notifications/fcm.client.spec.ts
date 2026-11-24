import { generateKeyPairSync } from 'crypto';
import { FcmClient } from './fcm.client';

describe('FcmClient Kentexa notification sound', () => {
  afterEach(() => jest.restoreAllMocks());

  it('targets the Kentexa Android channel and signature sound', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const client = new FcmClient(JSON.stringify({
      project_id: 'kentexa-test',
      client_email: 'push@kentexa-test.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    }));
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'test-access-token', expires_in: 3600 }),
      } as Response)
      .mockResolvedValueOnce({ ok: true } as Response);

    await expect(client.send('device-token', {
      title: 'Kentexa',
      body: 'Test notification',
      data: { url: '/inbox' },
    })).resolves.toEqual({ ok: true, invalidToken: false });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const request = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(request.message.android.notification).toEqual({
      channel_id: 'kentexa_updates',
      sound: 'kentexa_signature_tone',
    });
  });
});
