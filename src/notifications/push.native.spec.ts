import { BadRequestException } from '@nestjs/common';
import { PushService } from './push.service';

const mockSend = jest.fn();
jest.mock('./fcm.client', () => ({
  FcmClient: jest.fn().mockImplementation(() => ({ configured: true, send: mockSend })),
}));

function repo() {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(async (x) => x),
    create: jest.fn((x) => x),
    delete: jest.fn(),
  };
}

describe('PushService native (FCM) delivery', () => {
  let subRepo: ReturnType<typeof repo>;
  let tokenRepo: ReturnType<typeof repo>;
  let service: PushService;

  beforeEach(() => {
    mockSend.mockReset();
    subRepo = repo();
    tokenRepo = repo();
    subRepo.find.mockResolvedValue([]);
    service = new PushService(subRepo as any, tokenRepo as any, { get: () => undefined } as any);
  });

  it('sends the notification to every native token the user has', async () => {
    tokenRepo.find.mockResolvedValue([{ token: 'a' }, { token: 'b' }]);
    mockSend.mockResolvedValue({ ok: true, invalidToken: false });

    await service.sendToUser(7, { title: 'Ujumbe mpya', body: 'Habari', url: '/inbox', tag: 'comment' });

    expect(tokenRepo.find).toHaveBeenCalledWith({ where: { userId: 7 } });
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend).toHaveBeenCalledWith('a', {
      title: 'Ujumbe mpya',
      body: 'Habari',
      data: { url: '/inbox', tag: 'comment' },
    });
  });

  it('deletes only the tokens FCM reports as dead', async () => {
    tokenRepo.find.mockResolvedValue([{ token: 'dead' }, { token: 'alive' }]);
    mockSend.mockImplementation(async (t: string) =>
      t === 'dead' ? { ok: false, invalidToken: true } : { ok: true, invalidToken: false },
    );

    await service.sendToUser(7, { title: 't', body: 'b' });

    expect(tokenRepo.delete).toHaveBeenCalledTimes(1);
    expect(tokenRepo.delete).toHaveBeenCalledWith({ token: 'dead' });
  });

  it('never throws when FCM fails, so the business action is not broken', async () => {
    tokenRepo.find.mockResolvedValue([{ token: 'a' }]);
    mockSend.mockRejectedValue(new Error('network down'));

    await expect(service.sendToUser(7, { title: 't', body: 'b' })).resolves.toBeUndefined();
  });

  it('sends nothing when the user has no native devices', async () => {
    tokenRepo.find.mockResolvedValue([]);

    await service.sendToUser(7, { title: 't', body: 'b' });

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('rejects an empty device token', async () => {
    await expect(service.registerDeviceToken(7, '   ', 'android')).rejects.toBeInstanceOf(BadRequestException);
    expect(tokenRepo.save).not.toHaveBeenCalled();
  });

  it('moves an already-registered token to the user who signs in on it', async () => {
    tokenRepo.findOne.mockResolvedValue({ id: 1, userId: 3, token: 'tok', platform: 'android' });

    await service.registerDeviceToken(9, 'tok', 'android');

    expect(tokenRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 1, userId: 9 }));
  });
});
