import { GrowthInviteService, InviteContext } from './growth-invite.service';

// Locks in the "useful, not spammy" rules from the SMS growth-invite spec:
// never re-pitch an existing user, never re-invite the same unregistered
// phone within the cooldown window, and never let the invite corrupt or
// grow the transactional message past one SMS segment or throw on failure.
describe('GrowthInviteService', () => {
  let service: GrowthInviteService;
  let userRepo: any;
  let inviteLogRepo: any;

  beforeEach(() => {
    userRepo = { findOne: jest.fn() };
    inviteLogRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (x) => x),
      create: jest.fn((x) => x),
      update: jest.fn(async () => ({})),
    };
    service = new GrowthInviteService(userRepo, inviteLogRepo);
  });

  const BASE = 'KenteXa: Malipo yako ya Order #1 (TZS 1,000) yamethibitishwa.';

  it('never invites a phone that already belongs to a registered user', async () => {
    userRepo.findOne.mockResolvedValue({ id: 5, phone: '255700000000' });
    inviteLogRepo.findOne.mockResolvedValue(null);

    const result = await service.appendInvite(BASE, '0700000000', InviteContext.BUYER_ORDER);

    expect(result).toBe(BASE);
    expect(inviteLogRepo.save).not.toHaveBeenCalled();
  });

  it('appends a contextual invite for a first-time unregistered phone', async () => {
    userRepo.findOne.mockResolvedValue(null);
    inviteLogRepo.findOne.mockResolvedValue(null);

    const result = await service.appendInvite(BASE, '0700000001', InviteContext.BUYER_ORDER);

    expect(result).not.toBe(BASE);
    expect(result).toContain(BASE);
    expect(result).toMatch(/Jiunge na Kentexa/);
    expect(inviteLogRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '255700000001', inviteCount: 1 }),
    );
  });

  it('normalizes 0/255/+255 phone shapes to the same cooldown record', async () => {
    userRepo.findOne.mockResolvedValue(null);
    inviteLogRepo.findOne.mockResolvedValue({
      id: 9,
      phone: '255700000002',
      lastInvitedAt: new Date(Date.now() - 1000), // just invited
      inviteCount: 1,
    });

    const result = await service.appendInvite(BASE, '+255 700 000 002', InviteContext.BUYER_ORDER);

    expect(result).toBe(BASE); // still in cooldown — no repeated pitch
    expect(inviteLogRepo.update).not.toHaveBeenCalled();
  });

  it('does not re-invite the same unregistered phone within the cooldown window', async () => {
    userRepo.findOne.mockResolvedValue(null);
    inviteLogRepo.findOne.mockResolvedValue({
      id: 1,
      phone: '255700000003',
      lastInvitedAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
      inviteCount: 1,
    });

    const result = await service.appendInvite(BASE, '0700000003', InviteContext.BUYER_SHIPMENT);

    expect(result).toBe(BASE);
  });

  it('re-invites the same unregistered phone once the cooldown has elapsed', async () => {
    userRepo.findOne.mockResolvedValue(null);
    inviteLogRepo.findOne.mockResolvedValue({
      id: 2,
      phone: '255700000004',
      lastInvitedAt: new Date(Date.now() - 100 * 60 * 60 * 1000), // 100h ago
      inviteCount: 1,
    });

    // Short base message — this test is about the cooldown having elapsed,
    // not about the length guard (covered separately below), so it must
    // stay well under MAX_COMBINED_LENGTH regardless of FRONTEND_URL's
    // actual configured length.
    const shortBase = 'KenteXa: Order #1 update.';
    const result = await service.appendInvite(shortBase, '0700000004', InviteContext.BUYER_SHIPMENT);

    expect(result).not.toBe(shortBase);
    expect(inviteLogRepo.update).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ inviteCount: 2, lastEventType: InviteContext.BUYER_SHIPMENT }),
    );
  });

  it('uses different copy for different contexts', async () => {
    userRepo.findOne.mockResolvedValue(null);
    inviteLogRepo.findOne.mockResolvedValue(null);
    const shortBase = 'KenteXa: update.';

    const shipment = await service.appendInvite(shortBase, '0711111111', InviteContext.BUYER_SHIPMENT);
    inviteLogRepo.findOne.mockResolvedValue(null);
    const manualSale = await service.appendInvite(shortBase, '0722222222', InviteContext.MANUAL_SALE_CUSTOMER);

    expect(shipment).not.toBe(shortBase);
    expect(manualSale).not.toBe(shortBase);
    expect(shipment).not.toEqual(manualSale);
  });

  it('drops the invite (keeps the transaction message intact) when combined length would exceed one SMS segment', async () => {
    userRepo.findOne.mockResolvedValue(null);
    inviteLogRepo.findOne.mockResolvedValue(null);
    const longMessage =
      'KenteXa: '.padEnd(150, 'x') + ' — order details already fill up the whole segment.';

    const result = await service.appendInvite(longMessage, '0733333333', InviteContext.BUYER_ORDER);

    expect(result).toBe(longMessage);
  });

  it('returns the plain message unchanged when phone is missing', async () => {
    const result = await service.appendInvite(BASE, null, InviteContext.BUYER_ORDER);
    expect(result).toBe(BASE);
    expect(userRepo.findOne).not.toHaveBeenCalled();
  });

  it('never throws and falls back to the plain message if the lookup fails', async () => {
    userRepo.findOne.mockRejectedValue(new Error('db down'));

    const result = await service.appendInvite(BASE, '0744444444', InviteContext.BUYER_ORDER);

    expect(result).toBe(BASE);
  });
});
