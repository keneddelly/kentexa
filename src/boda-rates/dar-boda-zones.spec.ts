import 'reflect-metadata';
import { DAR_BODA_ZONES, DEFAULT_DAR_BODA_MATRIX } from './dar-boda-zones';
import { DailyBatchesService } from '../daily-batches/daily-batches.service';
import { OfficeBodaFeeService } from '../super-agents/office-boda-fee.service';

// Checkout and the office price rule must price a Dar boda trip the same way.
describe('Dar boda zone table: one source for checkout and the office price rule', () => {
  const noOverrides = { find: async () => [] };
  const checkout = Object.assign(Object.create(DailyBatchesService.prototype), {
    productRepo: { manager: { getRepository: () => noOverrides } },
  }) as any;
  const office = new OfficeBodaFeeService(noOverrides as any);
  // One address per zone, plus an empty and an unmatched one (the default ranks).
  const addresses: (string | null)[] = [
    ...Object.values(DAR_BODA_ZONES).map((z) => z.keywords[0]),
    null,
    'Somewhere in Dar',
  ];

  it('checkout reads the shared table itself, not a copy', () => {
    expect(new (DailyBatchesService as any)().DAR_ZONES).toBe(DAR_BODA_ZONES);
    expect(new (DailyBatchesService as any)().DEFAULT_FEE_MATRIX).toBe(DEFAULT_DAR_BODA_MATRIX);
  });

  it('every address pair gives the same fee in checkout and in the office price rule', async () => {
    Object.assign(checkout, { DAR_ZONES: DAR_BODA_ZONES, DEFAULT_FEE_MATRIX: DEFAULT_DAR_BODA_MATRIX, runtimeMatrix: null });
    for (const from of addresses) {
      for (const to of addresses) {
        expect([from, to, await office.feeBetween(from, to)]).toEqual([from, to, await checkout.calculateBodaFee(from, to)]);
      }
    }
  });
});
