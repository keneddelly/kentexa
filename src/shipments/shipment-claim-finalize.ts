import { BadRequestException, ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { claimDigest, matchesClaimDigest } from './shipment-claim-crypto';

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
      !/^[a-f0-9]{36}$/i.test(input.receiptSecret) ||
      !/^\d{6}$/.test(input.otp)) {
    throw new BadRequestException('Invalid claim credentials');
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
      throw new BadRequestException('Invalid claim credentials');
    }
    if (shipment.senderUserId != null) {
      throw new ConflictException('Shipment already claimed');
    }
    const [receipt] = await tx.query(
      `SELECT "receiptSecretDigest" FROM public.shipment_claim_receipt
        WHERE "shipmentId" = $1 AND "consumedAt" IS NULL
          AND "expiresAt" > now() FOR UPDATE`,
      [input.shipmentId],
    );
    if (!receipt || !matchesClaimDigest(receipt.receiptSecretDigest, receiptDigest)) {
      throw new BadRequestException('Invalid or expired claim credentials');
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
      throw new BadRequestException('Invalid or expired claim credentials');
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
    const result = await tx.query(
      `UPDATE public.shipment SET "senderUserId" = $2
        WHERE id = $1 AND "senderUserId" IS NULL AND "intakeChannel" = 'walk_in'
        RETURNING id`,
      [input.shipmentId, input.claimantUserId],
    );
    if (result.length !== 1) throw new ConflictException('Shipment already claimed');
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
    if (result.shipmentId === 0) throw new BadRequestException('Invalid claim credentials');
    return result;
  });
}
