import { ConflictException } from '@nestjs/common';
import { agentCodSplit, settleManualAgentCod } from './agent-cod-settlement';
import { COD_HANDLING_FEE_PERCENT, COD_HANDLING_FEE_KENTEXA_SHARE_PERCENT } from '../cod/cod-policy.config';
import { codRiderSms } from '../shipments/pickup-tasks.service';

describe('COD collected by an Agent on a seller shipment', () => {
  it('the handling fee and its split are the hub path\'s exact formula', () => {
    for (const amount of [0, 1, 80000, 123457, 9_999_999]) {
      const handlingFee = Math.round(amount * COD_HANDLING_FEE_PERCENT) / 100;
      const kentexaShare = Math.round(handlingFee * COD_HANDLING_FEE_KENTEXA_SHARE_PERCENT) / 100;
      expect(agentCodSplit(amount)).toEqual({
        handlingFee, kentexaShare, agentShare: Math.round((handlingFee - kentexaShare) * 100) / 100,
      });
    }
  });

  const manager = (collected = false) => {
    const calls: Array<{ sql: string; params: any[] }> = [];
    return {
      calls,
      query: jest.fn(async (sql: string, params: any[] = []) => {
        calls.push({ sql, params });
        if (sql.startsWith('SELECT "codBalanceCollected"')) return [{ codBalanceCollected: collected }];
        return [];
      }),
    };
  };

  it('records the collection (Agent owes only KenteXa\'s share), the earnings, the receipt, and completes the Order', async () => {
    const m = manager();
    const recordInvoice = jest.fn(async () => ({}));
    const split = await settleManualAgentCod(m, {
      order: { id: 900, source: 'seller_shipment', totalAmount: 100000 }, parcelId: 50, custodyEventId: 12,
      agent: { id: 9, deliveryCommission: 3000 }, expectedAmount: 80000, recordInvoice, now: new Date('2026-10-22T10:00:00Z'),
    });
    expect(split).toEqual(agentCodSplit(80000));
    const insert = m.calls.find((c) => c.sql.includes('INSERT INTO public.agent_cod_collection'))!;
    expect(insert.params).toEqual([900, 50, 12, 9, 80000, split.kentexaShare, split.handlingFee, split.kentexaShare, split.agentShare, 'seller_shipment']);
    // The boda fee (3,000) is the rider's delivery earning; the agent share is the COD handling share.
    expect(m.calls.some((c) => c.sql.includes('"totalEarningsDeliveries"+$1') && c.params[0] === 3000)).toBe(true);
    expect(m.calls.some((c) => c.sql.includes('"totalEarnings"="totalEarnings"+$1') && c.params[0] === 3000 + split.agentShare)).toBe(true);
    expect(recordInvoice).toHaveBeenCalledWith(m);
    const order = m.calls.find((c) => c.sql.startsWith('UPDATE public."order"'))!;
    expect(order.params).toEqual([true, 9, new Date('2026-10-22T10:00:00Z'), 'paid', 'delivered', new Date('2026-10-22T10:00:00Z'), 900]);
  });

  it('a balance already collected is never collected twice', async () => {
    const m = manager(true);
    await expect(settleManualAgentCod(m, {
      order: { id: 900, source: 'seller_shipment', totalAmount: 100000 }, parcelId: 50, custodyEventId: 12,
      agent: { id: 9 }, expectedAmount: 80000, recordInvoice: jest.fn(),
    })).rejects.toThrow(ConflictException);
    expect(m.calls.some((c) => c.sql.includes('INSERT'))).toBe(false);
  });
});

describe('COD text 2 (the rider and the delivery code)', () => {
  it('names the rider, their phone and the code; one plain SMS', () => {
    const text = codRiderSms('Juma Hamisi', '0712345678', '482913', 'KTX-SHP-1234');
    expect(text).toBe('KenteXa: Boda Juma Hamisi, simu 0712345678, ataleta mzigo wako KTX-SHP-1234. Namba ya kupokea: 482913. Mpe boda ukipokea mzigo tu.');
    const long = codRiderSms('Abdulrahman Mohamedali Kassimu Salehe', '+255712345678', '482913', 'Mzigo: 2610-12345678');
    expect(long.length).toBeLessThanOrEqual(160);
    expect(long).not.toMatch(/Umelipa/);
  });
});
