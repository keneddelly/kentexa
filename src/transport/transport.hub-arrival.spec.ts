import { TransportService } from './transport.service';
import { AssignmentStatus } from './entities/transport-assignment.entity';
import { ParcelStatus } from '../super-agents/entities/parcel.entity';

describe('carrier arrival versus receiving-hub custody', () => {
  it('keeps provider-reported arrival in the assignment without marking the parcel at a hub', async () => {
    const service: any = Object.create(TransportService.prototype);
    const findOne = jest.fn();
    const update = jest.fn();
    service.parcelRepo = { findOne, update };
    service.parcelTrackingRepo = { save: jest.fn() };
    await service.syncParcelFromAssignment({ id: 8, parcelRefId: 31 }, AssignmentStatus.ARRIVED);
    expect(findOne).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('does not regress a hub receipt from a delayed carrier departure', async () => {
    const service: any = Object.create(TransportService.prototype);
    const update = jest.fn();
    service.parcelRepo = { findOne: async () => ({ id: 31, status: ParcelStatus.ARRIVED_AT_HUB }), update };
    service.parcelTrackingRepo = { save: jest.fn() };
    await service.syncParcelFromAssignment({ id: 8, parcelRefId: 31 }, AssignmentStatus.DEPARTED);
    expect(update).not.toHaveBeenCalled();
  });
});
