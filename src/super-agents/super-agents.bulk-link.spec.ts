import { SuperAgentsService } from './super-agents.service';
import { BulkShipment, BulkShipmentStatus } from './entities/bulk-shipment.entity';
import { Parcel, ParcelStatus } from './entities/parcel.entity';

describe('bulk shipment parcel linking', () => {
  const hub: any = { id: 3, businessName: 'Origin Hub' };
  const shipment: any = { id: 5, status: BulkShipmentStatus.OPEN,
    superAgent: hub, destinationCity: 'Mwanza', lastMileContactName: 'Partner' };
  const candidates: any[] = [
    { id: 11, trackingNumber: 'KTX-11', destinationCity: 'Mwanza',
      status: ParcelStatus.READY_FOR_DISPATCH, weightKg: 2 },
    { id: 12, trackingNumber: 'KTX-12', destinationCity: 'Dar',
      status: ParcelStatus.READY_FOR_DISPATCH, weightKg: 1 },
    { id: 13, trackingNumber: 'KTX-13', destinationCity: 'Mwanza',
      status: ParcelStatus.DISPATCHED, weightKg: 1 },
  ];
  let changes: string[];
  let service: any;

  beforeEach(() => {
    changes = [];
    shipment.status = BulkShipmentStatus.OPEN;
    const bulkRepo = {
      findOne: async () => shipment,
      increment: async (_criteria: any, field: string, amount: number) => { changes.push(`${field}:${amount}`); },
    };
    let reads = 0;
    const parcelRepo = {
      find: async () => {
        reads += 1;
        return reads === 1 ? candidates : candidates.filter(p => p.status !== ParcelStatus.DISPATCHED);
      },
      update: async (_criteria: any, value: any) => { changes.push(`linked:${value.bulkShipmentId}`); },
    };
    const manager: any = { query: async () => [], getRepository: (entity: any) =>
      entity === BulkShipment ? bulkRepo : entity === Parcel ? parcelRepo : null };
    service = Object.create(SuperAgentsService.prototype);
    service.dataSource = { transaction: (fn: any) => fn(manager) };
    service.smsService = { sendSms: async () => true };
  });

  it('refuses to add parcels once dispatch won the shipment lock', async () => {
    shipment.status = BulkShipmentStatus.DISPATCHED;
    await expect(service.linkParcelsAndNotifyBuyers(hub, shipment, ['KTX-11'], null))
      .rejects.toThrow('no longer open');
    expect(changes).toEqual([]);
  });

  it('links only parcels still eligible for this destination', async () => {
    const result = await service.linkParcelsAndNotifyBuyers(hub, shipment,
      ['KTX-11', 'KTX-12', 'KTX-13'], null);
    expect(result.linkedCount).toBe(1);
    expect(result.notFound).toEqual(['KTX-12', 'KTX-13']);
    expect(changes).toEqual(['linked:5', 'totalParcels:1', 'totalWeightKg:2']);
  });
});
