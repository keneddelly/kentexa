import { WalletService } from './wallet.service';

/**
 * S0 Commit 5 — the wallet-credit backstop (Decision 13): the LAST line of
 * defence before real money moves. This is defence-in-depth, not the
 * primary payment authority — PaymentConfirmationService already decides
 * whether an order is genuinely payable before any of creditFromEscrowRelease's
 * callers are ever reached.
 */
describe('WalletService.creditFromEscrowRelease — payment-evidence backstop', () => {
  let walletRepo: any;
  let txRepo: any;
  let userRepo: any;
  let orderRepo: any;
  let verification: any;
  let paymentEvidence: any;
  let service: WalletService;

  beforeEach(() => {
    walletRepo = { findOne: jest.fn(), save: jest.fn((x: any) => ({ id: 1, ...x })), update: jest.fn() };
    txRepo = { create: jest.fn((x: any) => x), save: jest.fn() };
    userRepo = {};
    orderRepo = { findOne: jest.fn() };
    verification = {};
    paymentEvidence = { check: jest.fn() };
    service = new WalletService(walletRepo, txRepo, userRepo, orderRepo, verification, paymentEvidence);
    walletRepo.findOne.mockResolvedValue({ id: 1, balance: 0, totalEarned: 0 });
  });

  it('credits normally when the order has sufficient evidence', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 10, source: 'online', paymentMethod: 'online', totalAmount: 100000, codUpfrontAmount: null });
    paymentEvidence.check.mockResolvedValue({ applicable: true, sufficient: true, purpose: 'ORDER_FULL', requiredMinor: 10000000, totalMinor: 10000000 });

    await service.creditFromEscrowRelease(5, 10, 90000);

    expect(walletRepo.update).toHaveBeenCalledWith(1, expect.objectContaining({ balance: 90000 }));
    expect(txRepo.save).toHaveBeenCalled();
  });

  it('credits normally for a non-checkout order (evidence not applicable) — e.g. a seller_shipment/manual order', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 11, source: 'seller_shipment', paymentMethod: 'cod', totalAmount: 60000, codUpfrontAmount: 0 });
    paymentEvidence.check.mockResolvedValue({ applicable: false, sufficient: true, purpose: null, requiredMinor: 0, totalMinor: 0 });

    await service.creditFromEscrowRelease(5, 11, 60000);

    expect(walletRepo.update).toHaveBeenCalled();
  });

  it('BLOCKS the credit — no wallet write at all — when PaymentEvidence is insufficient for a checkout order', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 12, source: 'online', paymentMethod: 'online', totalAmount: 198000, codUpfrontAmount: null });
    paymentEvidence.check.mockResolvedValue({ applicable: true, sufficient: false, purpose: 'ORDER_FULL', requiredMinor: 19800000, totalMinor: 0 });

    await service.creditFromEscrowRelease(5, 12, 180000);

    expect(walletRepo.update).not.toHaveBeenCalled();
    expect(txRepo.save).not.toHaveBeenCalled();
  });

  it('BLOCKS a COD delivery credit when the deposit was never actually verified — the exact #75-shaped scenario from the audit', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 75, source: 'online', paymentMethod: 'cod', totalAmount: 180000, codUpfrontAmount: 36000 });
    paymentEvidence.check.mockResolvedValue({ applicable: true, sufficient: false, purpose: 'COD_DEPOSIT', requiredMinor: 3600000, totalMinor: 0 });

    await service.creditFromEscrowRelease(5, 75, 144000);

    expect(walletRepo.update).not.toHaveBeenCalled();
  });

  // C4 correction: a referenced Order that cannot be resolved must FAIL CLOSED, not fail open.
  // (Previously this exact scenario credited unconditionally — the review's blocker finding.)
  it('FAILS CLOSED — no credit at all — when the referenced Order cannot be resolved', async () => {
    orderRepo.findOne.mockResolvedValue(null);
    await expect(service.creditFromEscrowRelease(5, 999, 1000)).resolves.toBeUndefined();
    expect(walletRepo.update).not.toHaveBeenCalled();
    expect(txRepo.save).not.toHaveBeenCalled();
    expect(paymentEvidence.check).not.toHaveBeenCalled(); // nothing to evaluate evidence against
  });

  it('still short-circuits on the pre-existing no-op guards (no sellerId / amount<=0) before ever touching the order', async () => {
    await service.creditFromEscrowRelease(0, 10, 1000);
    await service.creditFromEscrowRelease(5, 10, 0);
    expect(orderRepo.findOne).not.toHaveBeenCalled();
  });
});
