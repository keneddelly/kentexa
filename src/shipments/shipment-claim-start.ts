import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { SmsService } from '../sms/sms.service';
import { CLAIM_MESSAGES, claimDigest, matchesClaimDigest, newClaimOtp, isReceiptSecretFormat } from './shipment-claim-crypto';

/**
 * Customer must be authenticated upstream. The receipt secret is checked
 * against the desk-issued credential before an OTP is sent to the sender
 * phone recorded at intake; no phone can be supplied by the caller.
 */
export async function startWalkInClaim(
  manager: EntityManager,
  sms: SmsService,
  input: { shipmentId: number; claimantUserId: number; receiptSecret: string; hmacKey: string },
): Promise<{ sent: true }> {
  if (!Number.isSafeInteger(input.shipmentId) || input.shipmentId <= 0 ||
      !Number.isSafeInteger(input.claimantUserId) || input.claimantUserId <= 0 ||
      !isReceiptSecretFormat(input.receiptSecret)) {
    throw new BadRequestException(CLAIM_MESSAGES.invalid);
  }
  const digest = claimDigest(input.hmacKey, 'receipt', input.shipmentId, input.receiptSecret.toLowerCase());
  const otp = newClaimOtp();
  const otpDigest = claimDigest(input.hmacKey, 'otp', input.shipmentId, otp);
  const phone = await manager.transaction(async (tx) => {
    const [shipment] = await tx.query(
      `SELECT id, "senderPhone", "senderUserId", "intakeChannel"
         FROM public.shipment WHERE id = $1 FOR UPDATE`,
      [input.shipmentId],
    );
    if (!shipment || shipment.senderUserId != null ||
        shipment.intakeChannel !== 'walk_in' || !shipment.senderPhone) {
      throw new BadRequestException(CLAIM_MESSAGES.invalid);
    }
    // Only an already verified Kentexa account may claim ownership.
    // This is independent of possession of the paper receipt and SMS OTP.
    const [claimant] = await tx.query(
      `SELECT id, "isVerified" FROM public."user" WHERE id = $1`,
      [input.claimantUserId],
    );
    if (!claimant || claimant.isVerified !== true) {
      throw new BadRequestException(CLAIM_MESSAGES.verifyAccount);
    }
    const [receipt] = await tx.query(
      `SELECT "receiptSecretDigest" FROM public.shipment_claim_receipt
        WHERE "shipmentId" = $1 AND "consumedAt" IS NULL AND "expiresAt" > now()
        FOR UPDATE`,
      [input.shipmentId],
    );
    if (!receipt || !matchesClaimDigest(receipt.receiptSecretDigest, digest)) {
      throw new BadRequestException(CLAIM_MESSAGES.invalid);
    }
    // Limit re-sends per claimant and parcel using durable database history.
    // An attacker cannot bypass this by requesting a fresh OTP repeatedly.
    const [recent] = await tx.query(
      `SELECT count(*)::int AS count FROM public.shipment_claim_challenge
        WHERE "shipmentId" = $1 AND "claimantUserId" = $2
          AND "createdAt" > now() - interval '1 hour'`,
      [input.shipmentId, input.claimantUserId],
    );
    if (Number(recent?.count ?? 0) >= 3) {
      throw new BadRequestException(CLAIM_MESSAGES.tooMany);
    }
    const [last] = await tx.query(
      `SELECT "createdAt" FROM public.shipment_claim_challenge
        WHERE "shipmentId" = $1 AND "claimantUserId" = $2
        ORDER BY "createdAt" DESC LIMIT 1`,
      [input.shipmentId, input.claimantUserId],
    );
    if (last && Date.now() - new Date(last.createdAt).getTime() < 60_000) {
      throw new BadRequestException(CLAIM_MESSAGES.waitMinute);
    }
    // Invalidate the previous challenge for this claimant, including
    // expired rows still covered by the partial unique index.
    await tx.query(
      `UPDATE public.shipment_claim_challenge SET "consumedAt" = now()
        WHERE "shipmentId" = $1 AND "claimantUserId" = $2 AND "consumedAt" IS NULL`,
      [input.shipmentId, input.claimantUserId],
    );
    await tx.query(
      `INSERT INTO public.shipment_claim_challenge
         ("shipmentId", "claimantUserId", "receiptSecretDigest",
          "otpDigest", "otpExpiresAt", "expiresAt", "maxAttempts")
       VALUES ($1, $2, $3, $4, now() + interval '10 minutes',
               now() + interval '10 minutes', 5)`,
      [input.shipmentId, input.claimantUserId, digest, otpDigest],
    );
    return String(shipment.senderPhone);
  });
  // Send only after the database has durably stored the challenge.
  // Never return the destination phone or OTP to the caller.
  const sent = await sms.sendSms(phone, CLAIM_MESSAGES.sms(otp), true);
  if (!sent) {
    await manager.query(
      `UPDATE public.shipment_claim_challenge SET "consumedAt" = now()
        WHERE "shipmentId" = $1 AND "claimantUserId" = $2
          AND "otpDigest" = $3 AND "consumedAt" IS NULL`,
      [input.shipmentId, input.claimantUserId, otpDigest],
    );
    throw new BadRequestException(CLAIM_MESSAGES.smsNotSent);
  }
  return { sent: true };
}
