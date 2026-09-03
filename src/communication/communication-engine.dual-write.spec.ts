import { CommunicationEngineService } from './communication-engine.service';

describe('CommunicationEngineService audience dual-write (Stage 2 checkpoint C)', () => {
  const build = (flagOverride: boolean | null = null) => {
    const templateRepo: any = {
      findOne: jest.fn().mockResolvedValue({ id: 1, titleTemplate: 'Hi {name}', bodyTemplate: 'Body {name}' }),
    };
    const logRepo: any = {
      findOne: jest.fn().mockResolvedValue(null), // never a duplicate
      create: jest.fn((data) => data),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const accountRoleRepo: any = { findOne: jest.fn().mockResolvedValue(null) };
    const inAppNotifications: any = { notify: jest.fn().mockResolvedValue(undefined) };
    const flags: any = { isEnabled: jest.fn(() => (flagOverride === null ? true : flagOverride)) };
    const service = new CommunicationEngineService(templateRepo, logRepo, accountRoleRepo, inAppNotifications, flags);
    return { service, templateRepo, logRepo, accountRoleRepo, inAppNotifications, flags };
  };

  it('attaches recipientAccountRoleId to the CommunicationLog row and the Notification when the recipient carries one', async () => {
    const { service, logRepo, inAppNotifications } = build();

    await service.dispatch({
      eventType: 'ORDER_PAID',
      sourceType: 'order',
      sourceId: 42,
      recipients: [{ userId: 5, role: 'seller', accountRoleId: 10, workspaceType: 'seller_profile', workspaceId: 77 }],
      context: { name: 'Test' },
    });

    expect(logRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientAccountRoleId: 10,
        recipientWorkspaceType: 'seller_profile',
        recipientWorkspaceId: 77,
        audienceScope: 'ROLE',
        transactionType: 'order',
        transactionId: 42,
        status: 'sent',
      }),
    );
    expect(inAppNotifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ recipientAccountRoleId: 10, audienceScope: 'ROLE', sourceType: 'order', sourceId: 42 }),
    );
  });

  it('item 7: resolves accountRoleId internally from recipient.userId + role when the caller (orders/payments/daily-batches.service.ts) never passed one', async () => {
    const { service, logRepo, accountRoleRepo } = build();
    accountRoleRepo.findOne.mockResolvedValue({ id: 42, roleType: 'seller', profileType: 'user', profileId: 5 });

    await service.dispatch({
      eventType: 'ORDER_PAID',
      sourceType: 'order',
      sourceId: 42,
      recipients: [{ userId: 5, role: 'seller' }], // exactly what the real call sites pass -- no accountRoleId
      context: { name: 'Test' },
    });

    expect(accountRoleRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 5, roleType: 'seller' }) }),
    );
    expect(logRepo.create).toHaveBeenCalledWith(expect.objectContaining({ recipientAccountRoleId: 42, audienceScope: 'ROLE' }));
  });

  it('never overrides an accountRoleId a caller already resolved and passed explicitly', async () => {
    const { service, accountRoleRepo } = build();
    await service.dispatch({
      eventType: 'ORDER_PAID',
      sourceType: 'order',
      sourceId: 42,
      recipients: [{ userId: 5, role: 'seller', accountRoleId: 999 }],
      context: { name: 'Test' },
    });
    expect(accountRoleRepo.findOne).not.toHaveBeenCalled();
  });

  it('never attaches audience fields for a recipient with no resolved accountRoleId (unmigrated caller)', async () => {
    const { service, logRepo, inAppNotifications } = build();

    await service.dispatch({
      eventType: 'ORDER_PAID',
      sourceType: 'order',
      sourceId: 42,
      recipients: [{ userId: 5, role: 'seller' }], // no accountRoleId
      context: { name: 'Test' },
    });

    const logCall = logRepo.create.mock.calls[0][0];
    expect(logCall.recipientAccountRoleId).toBeUndefined();
    const notifyCall = inAppNotifications.notify.mock.calls[0][0];
    expect(notifyCall.recipientAccountRoleId).toBeUndefined();
  });

  it('never attaches audience fields when SCOPED_NOTIFICATION_DUAL_WRITE is disabled, even with an accountRoleId present', async () => {
    const { service, logRepo } = build(false);

    await service.dispatch({
      eventType: 'ORDER_PAID',
      sourceType: 'order',
      sourceId: 42,
      recipients: [{ userId: 5, role: 'seller', accountRoleId: 10 }],
      context: { name: 'Test' },
    });

    const logCall = logRepo.create.mock.calls[0][0];
    expect(logCall.recipientAccountRoleId).toBeUndefined();
  });

  it('skips dispatch when the scoped idempotency check finds an existing log for the accountRoleId', async () => {
    const { service, logRepo, inAppNotifications } = build();
    logRepo.findOne
      .mockResolvedValueOnce(null) // legacy check misses
      .mockResolvedValueOnce({ id: 999 }); // scoped check hits

    await service.dispatch({
      eventType: 'ORDER_PAID',
      sourceType: 'order',
      sourceId: 42,
      recipients: [{ userId: 5, role: 'seller', accountRoleId: 10 }],
      context: { name: 'Test' },
    });

    expect(inAppNotifications.notify).not.toHaveBeenCalled();
  });
});
