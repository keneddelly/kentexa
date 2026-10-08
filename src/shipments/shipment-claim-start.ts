import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { SmsService } from '../sms/sms.service';
import { claimDigest, matchesClaimDigest, newClaimOtp } from './shipment-claim-crypto';

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
      !/^[a-f0-9]{36}$/i.test(input.receiptSecret)) {
    throw new BadRequestException('Invalid claim credentials');
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
      throw new BadRequestException('Invalid claim credentials');
    }
    const [receipt] = await tx.query(
      `SELECT "receiptSecretDigest" FROM public.shipment_claim_receipt
        WHERE "shipmentId" = $1 AND "consumedAt" IS NULL AND "expiresAt" > now()
        FOR UPDATE`,
      [input.shipmentId],
    );
    if (!receipt || !matchesClaimDigest(receipt.receiptSecretDigest, digest)) {
      throw new BadRequestException('Invalid claim credentials');
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
  const sent = await sms.sendSms(phone, `Kentexa: Your parcel verification code is ${otp}. It expires in 10 minutes. Do not share it.`, true);
  if (!sent) {
    await manager.query(
      `UPDATE public.shipment_claim_challenge SET "consumedAt" = now()
        WHERE "shipmentId" = $1 AND "claimantUserId" = $2
          AND "otpDigest" = $3 AND "consumedAt" IS NULL`,
      [input.shipmentId, input.claimantUserId, otpDigest],
    );
    throw new BadRequestException('Verification SMS could not be sent. Please retry later.');
  }
  return { sent: true };
}
