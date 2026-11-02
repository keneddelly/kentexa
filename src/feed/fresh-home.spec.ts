import { CvsService } from './cvs.service';

/**
 * Owner 2026-11-02: "one post staying on homepage forever ... classified moments are kept
 * showing each time even you have already seen them". What the viewer has not seen comes first.
 */
describe('fresh first on Home', () => {
  const build = (seenIds: number[]) => {
    const svc: any = Object.create(CvsService.prototype);
    svc.engageRepo = { query: jest.fn().mockResolvedValue(seenIds.map((id) => ({ id }))) };
    return svc;
  };
  const list = [1, 2, 3, 4, 5].map((id) => ({ id }));

  it('listings already seen go after the unseen ones and are marked', async () => {
    const svc = build([1, 2]);
    const marks = new WeakSet<object>();
    const picked = await svc.freshFirst(9, 'classified', marks, list, 4);
    expect(picked.map((x: any) => x.id)).toEqual([3, 4, 5, 1]);
    expect(marks.has(picked[3])).toBe(true);
    expect(marks.has(picked[0])).toBe(false);
    // seen = a view of the listing itself or of a post linked to it
    expect(svc.engageRepo.query.mock.calls[0][0]).toMatch(/linkedEntityType/);
    expect(svc.engageRepo.query.mock.calls[0][1]).toEqual([9, 'classified', [1, 2, 3, 4, 5]]);
  });

  it('someone not logged in gets the newest, unchanged', async () => {
    const svc = build([]);
    const picked = await svc.freshFirst(null, 'product', new WeakSet(), list, 3);
    expect(picked.map((x: any) => x.id)).toEqual([1, 2, 3]);
    expect(svc.engageRepo.query).not.toHaveBeenCalled();
  });

  it('when the check fails, nothing is hidden', async () => {
    const svc: any = Object.create(CvsService.prototype);
    svc.engageRepo = { query: jest.fn().mockRejectedValue(new Error('down')) };
    expect((await svc.freshFirst(9, 'service', new WeakSet(), list, 2)).map((x: any) => x.id)).toEqual([1, 2]);
  });
});
