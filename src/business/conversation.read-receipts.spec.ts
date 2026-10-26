import { ConversationService } from './conversation.service';

// Read receipts (owner 2026-10-26: WhatsApp-style ticks): opening a thread marks
// the OTHER side's messages read, and tells the open thread live.
describe('ConversationService read receipts', () => {
  const make = (affected: number) => {
    const qb: any = { update: jest.fn(() => qb), set: jest.fn(() => qb), where: jest.fn(() => qb), andWhere: jest.fn(() => qb), execute: jest.fn(async () => ({ affected })) };
    const svc = Object.create(ConversationService.prototype) as any;
    svc.msgRepo = { createQueryBuilder: jest.fn(() => qb) };
    svc.gateway = { emitMessagesRead: jest.fn() };
    return { svc, qb };
  };

  it('a seller opening the thread marks the customer messages read and emits once', async () => {
    const { svc, qb } = make(2);
    await svc.markIncomingRead(7, 'seller');
    expect(qb.andWhere).toHaveBeenCalledWith('"senderType" IN (:...fromOtherSide)', { fromOtherSide: ['customer'] });
    expect(svc.gateway.emitMessagesRead).toHaveBeenCalledWith(7, 'seller');
  });

  it('a buyer opening it marks the seller and team messages read; nothing new means no event', async () => {
    const { svc, qb } = make(0);
    await svc.markIncomingRead(7, 'customer');
    expect(qb.andWhere).toHaveBeenCalledWith('"senderType" IN (:...fromOtherSide)', { fromOtherSide: ['seller', 'employee'] });
    expect(svc.gateway.emitMessagesRead).not.toHaveBeenCalled();
  });

  it('never throws, even when the database fails', async () => {
    const svc = Object.create(ConversationService.prototype) as any;
    svc.msgRepo = { createQueryBuilder: () => { throw new Error('db down'); } };
    svc.gateway = { emitMessagesRead: jest.fn() };
    await expect(svc.markIncomingRead(7, 'seller')).resolves.toBeUndefined();
  });
});
