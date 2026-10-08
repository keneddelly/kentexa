import { BadRequestException, ConflictException } from '@nestjs/common';
import { claimDigest } from './shipment-claim-crypto';
import { finalizeWalkInClaim } from './shipment-claim-finalize';

describe('finalizeWalkInClaim', () => {
  const key = 'a-private-server-key-at-least-32-characters-long';
  const receiptSecret = 'a'.repeat(36);
  const input = { shipmentId: 10, claimantUserId: 25, receiptSecret, otp: '012345', hmacKey: key };
  let query: jest.Mock;
  let manager: any;
  beforeEach(() => {
    query = jest.fn();
    manager = { transaction: (fn: any) => fn({ query }) };
  });

  it('atomically assigns ownership and consumes every active challenge', async () => {
    query
      .mockResolvedValueOnce([{ id: 10, senderUserId: null, intakeChannel: 'walk_in' }])
      .mockResolvedValueOnce([{ id: 25, isVerified: true }])
      .mockResolvedValueOnce([{ receiptSecretDigest: claimDigest(key, 'receipt', 10, receiptSecret) }])
      .mockResolvedValueOnce([{
        id: 7, receiptSecretDigest: claimDigest(key, 'receipt', 10, receiptSecret),
        otpDigest: claimDigest(key, 'otp', 10, input.otp),
        otpExpiresAt: new Date(Date.now() + 60_000),
        attemptCount: 0, maxAttempts: 5,
      }])
      .mockResolvedValueOnce([{ id: 10 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    await expect(finalizeWalkInClaim(manager, input)).resolves.toEqual({ shipmentId: 10 });
    expect(query).toHaveBeenCalledTimes(7);
    expect(query.mock.calls[4][0]).toContain('"senderUserId" IS NULL');
    expect(query.mock.calls[4][1]).toEqual([10, 25]);
    expect(query.mock.calls[5][0]).toContain('"consumedAt" = now()');
  });

  it('persists failed attempts without rolling back the transaction', async () => {
    query
      .mockResolvedValueOnce([{ id: 10, senderUserId: null, intakeChannel: 'walk_in' }])
      .mockResolvedValueOnce([{ id: 25, isVerified: true }])
      .mockResolvedValueOnce([{ receiptSecretDigest: claimDigest(key, 'receipt', 10, receiptSecret) }])
      .mockResolvedValueOnce([{
        id: 7, receiptSecretDigest: claimDigest(key, 'receipt', 10, receiptSecret),
        otpDigest: claimDigest(key, 'otp', 10, '999999'),
        otpExpiresAt: new Date(Date.now() + 60_000),
        attemptCount: 0, maxAttempts: 5,
      }])
      .mockResolvedValueOnce([]);
    await expect(finalizeWalkInClaim(manager, input)).rejects.toThrow(BadRequestException);
    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls[4][0]).toContain('"attemptCount" = "attemptCount" + 1');
    expect(query.mock.calls[4][1]).toEqual([7]);
  });

  it('rejects already owned shipments before looking up credentials', async () => {
    query.mockResolvedValueOnce([{ id: 10, senderUserId: 99, intakeChannel: 'walk_in' }]);
    await expect(finalizeWalkInClaim(manager, input)).rejects.toThrow(ConflictException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed input without querying the database', async () => {
    await expect(finalizeWalkInClaim(manager, { ...input, otp: '123' })).rejects.toThrow(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });
});
