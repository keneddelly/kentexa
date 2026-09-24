import { assertExactSource, PRODUCT_IDS } from './transfer-bis-products';

describe('BiS product reconciliation guard', () => {
  const row = (id: number) => ({ id, name: `Product ${id}`, sellerId: 2, workspaceId: 2, commerceProfileId: 6 });

  it('accepts only the reviewed fourteen products and exact owner/workspace/source profile', () => {
    expect(() => assertExactSource(PRODUCT_IDS.map(row))).not.toThrow();
    expect(() => assertExactSource(PRODUCT_IDS.slice(1).map(row))).toThrow('Source product set');
    expect(() => assertExactSource([...PRODUCT_IDS.map(row), row(999)])).toThrow('Source product set');
    expect(() => assertExactSource(PRODUCT_IDS.map(row).map(r => r.id === 4 ? { ...r, workspaceId: 3 } : r))).toThrow('Source product set');
    expect(() => assertExactSource(PRODUCT_IDS.map(row).map(r => r.id === 4 ? { ...r, sellerId: 5 } : r))).toThrow('Source product set');
  });
});
