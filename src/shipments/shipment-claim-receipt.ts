import { ConflictException, BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { claimDigest, newReceiptSecret } from './shipment-claim-crypto';

/**
 * Must be called by the authenticated, authorized desk intake workflow.
 * The plaintext credential is returned exactly once for printing on the
 * sender's receipt. Never include it in public tracking or logs.
 */
export async function issueWalkInClaimReceipt(
  manager: EntityManager,
  input: { shipmentId: number; deskActorUserId: number; hmacKey: string },
): Promise<{ shipmentId: number; receiptSecret: string }> {
  if (!Number.isSafeInteger(input.shipmentId) || input.shipmentId <= 0 ||
      !Number.isSafeInteger(input.deskActorUserId) || input.deskActorUserId <= 0) {
    throw new BadRequestException('Invalid desk intake identity');
  }
  // Fail closed if configuration is missing.
  const receiptSecret = newReceiptSecret();
  const digest = claimDigest(input.hmacKey, 'receipt', input.shipmentId, receiptSecret);
  return manager.transaction(async (tx) => {
    const [shipment] = await tx.query(
      `SELECT id, "senderUserId", "requestedByUserId", "intakeChannel", "senderPhone"
         FROM public.shipment WHERE id = $1 FOR UPDATE`,
      [input.shipmentId],
    );
    if (!shipment || shipment.intakeChannel !== 'walk_in' ||
        shipment.senderUserId != null ||
        Number(shipment.requestedByUserId) !== input.deskActorUserId ||
        !shipment.senderPhone) {
      throw new BadRequestException('Shipment is not eligible for desk receipt issuance');
    }
    const rows = await tx.query(
      `INSERT INTO public.shipment_claim_receipt
         ("shipmentId", "receiptSecretDigest", "issuedByUserId", "expiresAt")
       VALUES ($1, $2, $3, now() + interval '30 days')
       ON CONFLICT ("shipmentId") DO NOTHING RETURNING "shipmentId"`,
      [input.shipmentId, digest, input.deskActorUserId],
    );
    if (rows.length !== 1) {
      throw new ConflictException('Receipt already issued; do not regenerate credentials');
    }
    return { shipmentId: input.shipmentId, receiptSecret };
  });
}
