import { NotFoundException } from '@nestjs/common';
import { ParcelJourneyService } from './parcel-journey.service';

describe('L9 shipment requester logistics visibility', () => {
  const assignmentService: any = {};
  it('allows buyer active context only for a parcel from their own Shipment', async () => {
    const dataSource: any = {
      query: jest.fn()
        .mockResolvedValueOnce([{ '?column?': 1 }])
        .mockResolvedValueOnce([]),
    };
    const svc = new ParcelJourneyService(dataSource, assignmentService);

    await expect(svc.assertParcelOperationalVisibility(42, 'buyer', 42, 7)).resolves.toBeUndefined();
    await expect(svc.assertParcelOperationalVisibility(99, 'buyer', 99, 7)).rejects.toBeInstanceOf(NotFoundException);

    expect(dataSource.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('s."requestedByUserId" = $2'),
      [7, 42],
    );
  });
});
