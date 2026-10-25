import 'reflect-metadata';
import { ShipmentsService } from './shipments.service';

// One order, one parcel, one waybill: a marketplace order already has its Parcel from
// checkout. When the seller ships it through the engine, activation joins that Parcel to
// the Shipment instead of making a second one.
describe('createParcelForConfirmedShipment with a marketplace order', () => {
  const svc: any = Object.create(ShipmentsService.prototype);
  const shipment: any = {
    id: 88, orderId: 9, requestedByUserId: 7, journeySelectionId: 31, originHubSource: 'selected', originHubId: 4, destinationHubId: 6,
    originCity: 'Dar es Salaam', destinationCity: 'Mbeya', weightKg: 2, priceQuoted: '12000', trackingNumber: 'KTX-SHP-88',
  };
  const repo = (waiting: any) => ({
    findOne: jest.fn(async ({ where }: any) => (where.shipment && where.shipment.id ? null : waiting)),
    save: jest.fn(async (x: any) => ({ ...x })),
    create: jest.fn((x: any) => x),
  });

  it('the order\'s waiting Parcel joins the Shipment and keeps its waybill and tracking number', async () => {
    const waiting = { id: 70, trackingNumber: 'KTX-ORD-9', waybillNumber: 'KTX0000000018', status: 'pending', estimatedShippingFee: 0 };
    const parcels = repo(waiting);
    const saved = await svc.createParcelForConfirmedShipment(shipment, parcels);
    expect(parcels.create).not.toHaveBeenCalled();
    expect(saved).toMatchObject({
      id: 70, trackingNumber: 'KTX-ORD-9', waybillNumber: 'KTX0000000018', shipment: { id: 88 }, journeySelectionId: 31,
      superAgent: { id: 4 }, destinationSuperAgent: { id: 6 }, estimatedShippingFee: 12000,
    });
  });

  it('no waiting Parcel (a seller\'s POS sale): a new one is made, carrying the order', async () => {
    const parcels = repo(null);
    const saved = await svc.createParcelForConfirmedShipment(shipment, parcels);
    expect(parcels.create).toHaveBeenCalledWith(expect.objectContaining({ order: { id: 9 }, source: 'seller_shipment', shipment: { id: 88 } }));
    expect(saved.trackingNumber).toBeDefined();
  });
});
