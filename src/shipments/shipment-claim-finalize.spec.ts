import { BadRequestException, ConflictException } from '@nestjs/common';
import { CLAIM_MESSAGES, claimDigest } from './shipment-claim-crypto';
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
  // Live fault 2026-10-12: TypeORM returns a BARE "UPDATE ... RETURNING" as
  // [rows, count] (length 2), so "exactly one row" failed and every correct
  // claim said "already claimed". This fake answers exactly like the real
  // driver: bare UPDATE/INSERT ... RETURNING -> [rows, count]; SELECT/WITH -> rows.
  it('a correct claim succeeds with the real driver answer shapes (regression)', async () => {
    let owner: number | null = null;
    const realLike = jest.fn(async (sql: string, params: any[] = []) => {
      const s = sql.trim();
      if (/^SELECT id, "senderUserId"/.test(s)) return [{ id: 10, senderUserId: owner, intakeChannel: 'walk_in' }];
      if (/^SELECT id, "isVerified"/.test(s)) return [{ id: 25, isVerified: true }];
      if (/^SELECT "receiptSecretDigest"/.test(s)) return [{ receiptSecretDigest: claimDigest(key, 'receipt', 10, receiptSecret) }];
      if (/^SELECT id, "receiptSecretDigest", "otpDigest"/.test(s)) return [{
        id: 7, receiptSecretDigest: claimDigest(key, 'receipt', 10, receiptSecret),
        otpDigest: claimDigest(key, 'otp', 10, input.otp), otpExpiresAt: new Date(Date.now() + 60_000),
        attemptCount: 0, maxAttempts: 5 }];
      if (/^WITH claimed AS \(\s*UPDATE public\.shipment/.test(s)) {
        if (owner != null) return [];
        owner = params[1]; return [{ id: 10 }];
      }
      if (/^UPDATE/.test(s)) {
        if (/RETURNING/.test(s)) {
          if (/public\.shipment SET "senderUserId"/.test(s)) { if (owner != null) return [[], 0]; owner = params[1]; return [[{ id: 10 }], 1]; }
          return [[], 0];
        }
        return [[], 1];
      }
      throw new Error('unexpected SQL: ' + s.slice(0, 60));
    });
    const realManager: any = { transaction: (fn: any) => fn({ query: realLike }) };
    await expect(finalizeWalkInClaim(realManager, input)).resolves.toEqual({ shipmentId: 10 });
    expect(owner).toBe(25);
    // A second claim of the same parcel now gets the Swahili "already added" answer.
    await expect(finalizeWalkInClaim(realManager, { ...input, claimantUserId: 26 }))
      .rejects.toThrow(CLAIM_MESSAGES.alreadyClaimed);
  });

  it('every customer-facing claim message is Swahili', () => {
    expect(CLAIM_MESSAGES.alreadyClaimed).toBe('Mzigo huu tayari umeongezwa kwenye akaunti nyingine.');
    expect(CLAIM_MESSAGES.invalid).toBe('Namba ya mzigo au namba ya siri si sahihi.');
    expect(CLAIM_MESSAGES.sms('012345')).toBe('KenteXa: Namba yako ya kuthibitisha mzigo ni 012345. Inaisha baada ya dakika 10. Usimpe mtu.');
    for (const m of Object.values(CLAIM_MESSAGES)) {
      const text = typeof m === 'function' ? m('000000') : m;
      expect(text).not.toMatch(/\b(Invalid|claimed|Verify|Please|could not|unavailable|Your)\b/);
    }
  });
});
