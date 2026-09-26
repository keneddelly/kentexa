import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** Reconciles physical cash against the immutable local Agent COD collection. */
@Injectable()
export class AgentCodRemittanceService {
  constructor(private readonly dataSource: DataSource) {}

  async listCollections(agentId: number) {
    if (!Number.isSafeInteger(agentId) || agentId <= 0) throw new BadRequestException('Valid Agent ID required');
    const rows = await this.dataSource.query(`SELECT c.id, c."orderId", c."parcelId",
      p."trackingNumber", c."collectedAmount", c."cashLiability", c."recordedAt",
      COALESCE(sum(r.amount),0) AS "remittedAmount"
      FROM public.agent_cod_collection c
      JOIN public.parcel p ON p.id=c."parcelId"
      LEFT JOIN public.agent_cod_remittance r ON r."collectionId"=c.id
      WHERE c."agentId"=$1
      GROUP BY c.id,p."trackingNumber"
      ORDER BY c."recordedAt" DESC,c.id DESC`, [agentId]);
    return rows.map((row: any) => ({ ...row,
      remainingAmount: Math.round((Number(row.cashLiability) - Number(row.remittedAmount)) * 100) / 100,
    }));
  }

  async record(input: {
    collectionId: number; amount: number; method: string; reference: string;
    operationKey: string; adminUserId: number;
  }) {
    const { collectionId, amount, adminUserId } = input;
    const method = input.method?.trim();
    const reference = input.reference?.trim();
    if (!Number.isSafeInteger(collectionId) || collectionId <= 0 ||
        !Number.isSafeInteger(adminUserId) || adminUserId <= 0) {
      throw new BadRequestException('Valid collection and admin identity required');
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99 ||
        Math.round(amount * 100) / 100 !== amount) {
      throw new BadRequestException('Enter a positive amount in whole cents');
    }
    if (!['cash', 'bank_transfer', 'mobile_money'].includes(method)) {
      throw new BadRequestException('Unsupported remittance method');
    }
    if (!reference || reference.length > 128) {
      throw new BadRequestException('A verified payment reference is required');
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.operationKey || '')) {
      throw new BadRequestException('A UUID operation key is required for safe retry');
    }
    return this.dataSource.transaction(async manager => {
      const [collection] = await manager.query(`SELECT id,"agentId","cashLiability"
        FROM public.agent_cod_collection WHERE id=$1 FOR UPDATE`, [collectionId]);
      if (!collection) throw new NotFoundException('Agent COD collection not found');
      const [prior] = await manager.query(`SELECT id,"collectionId","amount","method","reference",
        "recordedByAdminUserId" FROM public.agent_cod_remittance WHERE "operationKey"=$1`, [input.operationKey]);
      if (prior) {
        if (Number(prior.collectionId) !== collectionId || Number(prior.amount) !== amount ||
            prior.method !== method || prior.reference !== reference ||
            prior.recordedByAdminUserId !== adminUserId) {
          throw new ConflictException('Operation key already used for a different remittance');
        }
      }
      const [{ remitted }] = await manager.query(`SELECT COALESCE(sum(amount),0) AS remitted
        FROM public.agent_cod_remittance WHERE "collectionId"=$1`, [collectionId]);
      const remaining = Math.round((Number(collection.cashLiability) - Number(remitted)) * 100) / 100;
      if (prior) return { id: prior.id, collectionId, agentId: collection.agentId,
        remainingAmount: remaining, alreadyRecorded: true };
      if (amount > remaining) throw new ConflictException('Remittance exceeds outstanding cash liability');
      const [recorded] = await manager.query(`INSERT INTO public.agent_cod_remittance
        ("collectionId","amount","method","reference","operationKey","recordedByAdminUserId")
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [collectionId, amount, method, reference, input.operationKey, adminUserId]);
      return { id: recorded.id, collectionId, agentId: collection.agentId,
        remainingAmount: Math.round((remaining - amount) * 100) / 100, alreadyRecorded: false };
    });
  }
}
