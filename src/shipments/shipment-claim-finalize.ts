import { BadRequestException, ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CLAIM_MESSAGES, claimDigest, matchesClaimDigest, isReceiptSecretFormat } from './shipment-claim-crypto';

/**
 * Atomic last step of a walk-in claim. Caller must already have authenticated
 * claimant identity and issued a challenge to the parcel's stored sender
 * phone. This function deliberately cannot issue or send OTPs.
 */
export async function finalizeWalkInClaim(
  manager: EntityManager,
  input: {
    shipmentId: number;
    claimantUserId: number;
    receiptSecret: string;
    otp: string;
    hmacKey: string;
  },
): Promise<{ shipmentId: number }> {
  if (!Number.isSafeInteger(input.shipmentId) || input.shipmentId <= 0 ||
      !Number.isSafeInteger(input.claimantUserId) || input.claimantUserId <= 0 ||
      !isReceiptSecretFormat(input.receiptSecret) ||
      !/^\d{6}$/.test(input.otp)) {
    throw new BadRequestException(CLAIM_MESSAGES.invalid);
  }
  // Reject misconfigured HMAC keys before touching the database.
  const receiptDigest = claimDigest(input.hmacKey, 'receipt', input.shipmentId, input.receiptSecret.toLowerCase());
  const otpDigest = claimDigest(input.hmacKey, 'otp', input.shipmentId, input.otp);

  return manager.transaction(async (tx) => {
    // Lock shipment first so two accounts cannot both win a claim.
    const [shipment] = await tx.query(
      `SELECT id, "senderUserId", "intakeChannel"
         FROM public.shipment WHERE id = $1 FOR UPDATE`,
      [input.shipmentId],
    );
    if (!shipment || shipment.intakeChannel !== 'walk_in') {
      throw new BadRequestException(CLAIM_MESSAGES.invalid);
    }
    if (shipment.senderUserId != null) {
      throw new ConflictException(CLAIM_MESSAGES.alreadyClaimed);
    }
    // Re-check verification at completion; account status may have changed
    // after the OTP was issued.
    const [claimant] = await tx.query(
      `SELECT id, "isVerified" FROM public."user" WHERE id = $1`,
      [input.claimantUserId],
    );
    if (!claimant || claimant.isVerified !== true) {
      throw new BadRequestException(CLAIM_MESSAGES.verifyAccount);
    }
    const [receipt] = await tx.query(
      `SELECT "receiptSecretDigest" FROM public.shipment_claim_receipt
        WHERE "shipmentId" = $1 AND "consumedAt" IS NULL
          AND "expiresAt" > now() FOR UPDATE`,
      [input.shipmentId],
    );
    if (!receipt || !matchesClaimDigest(receipt.receiptSecretDigest, receiptDigest)) {
      throw new BadRequestException(CLAIM_MESSAGES.invalidOrExpired);
    }
    const [challenge] = await tx.query(
      `SELECT id, "receiptSecretDigest", "otpDigest", "otpExpiresAt",
              "attemptCount", "maxAttempts"
         FROM public.shipment_claim_challenge
        WHERE "shipmentId" = $1 AND "claimantUserId" = $2
          AND "consumedAt" IS NULL AND "expiresAt" > now()
        FOR UPDATE`,
      [input.shipmentId, input.claimantUserId],
    );
    if (!challenge || Number(challenge.attemptCount) >= Number(challenge.maxAttempts)) {
      throw new BadRequestException(CLAIM_MESSAGES.invalidOrExpired);
    }
    const valid = challenge.otpDigest != null && challenge.otpExpiresAt != null &&
      new Date(challenge.otpExpiresAt).getTime() > Date.now() &&
      matchesClaimDigest(challenge.receiptSecretDigest, receiptDigest) &&
      matchesClaimDigest(challenge.otpDigest, otpDigest);
    if (!valid) {
      await tx.query(
        `UPDATE public.shipment_claim_challenge
            SET "attemptCount" = "attemptCount" + 1 WHERE id = $1`,
        [challenge.id],
      );
      // Do not throw inside the transaction: doing so would roll back the
      // failed-attempt counter and allow unlimited guesses.
      return { shipmentId: 0 };
    }
    // Wrapped in a CTE: TypeORM returns a bare UPDATE ... RETURNING as
    // [rows, count] (always length 2), which made every correct claim fail
    // with "already claimed" (found on live 2026-10-12). A SELECT returns rows.
    const result = await tx.query(
      `WITH claimed AS (
         UPDATE public.shipment SET "senderUserId" = $2
          WHERE id = $1 AND "senderUserId" IS NULL AND "intakeChannel" = 'walk_in'
          RETURNING id)
       SELECT id FROM claimed`,
      [input.shipmentId, input.claimantUserId],
    );
    if (result.length !== 1) throw new ConflictException(CLAIM_MESSAGES.alreadyClaimed);
    await tx.query(
      `UPDATE public.shipment_claim_challenge
          SET "consumedAt" = now() WHERE "shipmentId" = $1 AND "consumedAt" IS NULL`,
      [input.shipmentId],
    );
    await tx.query(
      `UPDATE public.shipment_claim_receipt SET "consumedAt" = now()
        WHERE "shipmentId" = $1 AND "consumedAt" IS NULL`,
      [input.shipmentId],
    );
    return { shipmentId: input.shipmentId };
  }).then((result) => {
    if (result.shipmentId === 0) throw new BadRequestException(CLAIM_MESSAGES.invalid);
    return result;
  });
}
