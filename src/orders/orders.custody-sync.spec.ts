import { OrdersService } from './orders.service';
import { Parcel, ParcelStatus, ParcelTracking } from '../super-agents/entities/parcel.entity';
import { ParcelCustodyEvent } from '../super-agents/entities/parcel-custody-event.entity';

describe('Order completion Parcel projection', () => {
  const order: any = { id: 31, trackingNumber: 'KTX-31', seller: null };
  function setup(custody: any, status = ParcelStatus.OUT_FOR_DELIVERY) {
    const parcel: any = { id: 11, trackingNumber: 'KTX-31', status,
      order: { id: 31 }, buyerRequestedDelivery: true, destinationCity: 'Mwanza' };
    const update = jest.fn();
    const tracking = jest.fn();
    const manager: any = { query: jest.fn(), getRepository: (entity: any) => {
      if (entity === Parcel) return { findOne: async () => parcel, update };
      if (entity === ParcelCustodyEvent) return { findOne: async () => custody };
      if (entity === ParcelTracking) return { insert: tracking };
      throw Error('unexpected repository');
    } };
    const service: any = Object.create(OrdersService.prototype);
    service.parcelRepo = { findOne: async () => parcel };
    service.repo = { manager: { transaction: (fn: any) => fn(manager) } };
    service.commerceProfiles = { findForUserByType: jest.fn() };
    service.activityEvents = { record: jest.fn() };
    return { service, update, tracking };
  }

  it('does not project buyer confirmation over an Agent custody event', async () => {
    const { service, update, tracking } = setup({ eventKind: 'destination_agent_received',
      toCustodianType: 'local_agent', toCustodianId: 7 });
    await service.syncParcelDeliveredForOrder(order);
    expect(update).not.toHaveBeenCalled();
    expect(tracking).not.toHaveBeenCalled();
  });

  it('does not invent handover for a selected last-mile job without custody evidence', async () => {
    const { service, update, tracking } = setup(null, ParcelStatus.ARRIVED_AT_HUB);
    await service.syncParcelDeliveredForOrder(order);
    expect(update).not.toHaveBeenCalled();
    expect(tracking).not.toHaveBeenCalled();
  });
});
