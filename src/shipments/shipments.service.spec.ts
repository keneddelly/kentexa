import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ShipmentsService } from './shipments.service';
import { ShipmentStatus, ShipmentHandoffOption } from './entities/shipment.entity';
import { ParcelStatus } from '../super-agents/entities/parcel.entity';

describe('ShipmentsService', () => {
  let shipmentRepo: any;
  let routeRepo: any;
  let parcelRepo: any;
  let superAgentRepo: any;
  let transportService: any;
  let tzLocation: any;
  let service: ShipmentsService;

  beforeEach(() => {
    shipmentRepo = {
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn((v) => v),
      update: jest.fn(),
      find: jest.fn(),
    };
    routeRepo = { findOne: jest.fn() };
    parcelRepo = {
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn((v) => v),
    };
    superAgentRepo = { findOne: jest.fn() };
    transportService = {
      assertEligibleProvider: jest.fn(),
      reserveCapacity: jest.fn(),
      releaseCapacity: jest.fn(),
      findAvailableForRoute: jest.fn(),
    };
    tzLocation = { search: jest.fn() };

    service = new ShipmentsService(
      shipmentRepo,
      routeRepo,
      parcelRepo,
      superAgentRepo,
      transportService,
      tzLocation,
    );
  });

  // ── Provider validation ────────────────────────────────────────────────
  describe('confirmShipment — provider validation', () => {
    const baseShipment = {
      id: 1,
      requestedByUserId: 7,
      status: ShipmentStatus.PENDING,
      providerId: null,
      availabilityId: null,
      routeId: null,
      weightKg: 2,
      originCity: 'Dar es Salaam',
      destinationCity: 'Mwanza',
    };

    it('rejects confirmation when the selected provider does not exist / is ineligible', async () => {
      shipmentRepo.findOne.mockResolvedValue({ ...baseShipment });
      transportService.assertEligibleProvider.mockRejectedValue(
        new BadRequestException('Msafirishaji huyu hajahakikiwa au hafanyi kazi kwa sasa'),
      );

      await expect(
        service.confirmShipment(7, 1, { providerId: 99 }),
      ).rejects.toThrow(BadRequestException);

      expect(transportService.assertEligibleProvider).toHaveBeenCalledWith(99);
      // Must fail BEFORE any write to the shipment row.
      expect(shipmentRepo.update).not.toHaveBeenCalled();
      expect(parcelRepo.save).not.toHaveBeenCalled();
    });

    it('proceeds to confirm when the provider is eligible', async () => {
      shipmentRepo.findOne
        .mockResolvedValueOnce({ ...baseShipment })
        .mockResolvedValueOnce({ ...baseShipment, status: ShipmentStatus.CONFIRMED, providerId: 5 });
      transportService.assertEligibleProvider.mockResolvedValue({ id: 5 });
      parcelRepo.findOne.mockResolvedValue(null);
      superAgentRepo.findOne.mockResolvedValue(null);
      parcelRepo.save.mockImplementation((v: any) => Promise.resolve({ ...v, id: 500 }));

      const result = await service.confirmShipment(7, 1, { providerId: 5 });

      expect(transportService.assertEligibleProvider).toHaveBeenCalledWith(5);
      expect(shipmentRepo.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ status: ShipmentStatus.CONFIRMED, providerId: 5 }),
      );
      expect(result.parcel).toBeDefined();
    });

    it('still enforces ownership before touching the provider', async () => {
      shipmentRepo.findOne.mockResolvedValue({ ...baseShipment, requestedByUserId: 999 });

      await expect(service.confirmShipment(7, 1, { providerId: 5 })).rejects.toThrow(
        ForbiddenException,
      );
      expect(transportService.assertEligibleProvider).not.toHaveBeenCalled();
    });
  });

  // ── Parcel creation idempotency / concurrency ──────────────────────────
  // Together these two tests prove "at most one Parcel per Shipment" holds
  // under concurrency: whichever request sees an existing row skips the
  // insert entirely, and whichever request loses the DB unique-index race
  // recovers to the winner's row instead of creating a second Parcel or
  // surfacing a raw database error.
  describe('ensureParcelForShipment (private, exercised via confirmShipment internals)', () => {
    const shipment = {
      id: 10,
      originCity: 'Dar es Salaam',
      destinationCity: 'Arusha',
      weightKg: 3,
      itemDescription: 'Books',
      priceQuoted: 15000,
      senderName: null,
      senderPhone: null,
      receiverName: 'Asha',
      receiverPhone: '0700000000',
    };

    it('returns the existing Parcel without creating a new one when one already exists', async () => {
      const existing = { id: 501, trackingNumber: 'KTX-PCL-501' };
      parcelRepo.findOne.mockResolvedValue(existing);

      const result = await (service as any).ensureParcelForShipment(shipment);

      expect(result).toBe(existing);
      expect(parcelRepo.save).not.toHaveBeenCalled();
      expect(superAgentRepo.findOne).not.toHaveBeenCalled();
    });

    it('recovers deterministically when a concurrent request wins the UQ_parcel_shipmentId race (23505)', async () => {
      const winner = { id: 777, trackingNumber: 'KTX-PCL-777' };
      parcelRepo.findOne
        .mockResolvedValueOnce(null) // fast-path check: no existing parcel yet
        .mockResolvedValueOnce(winner); // recovery re-fetch after 23505
      superAgentRepo.findOne.mockResolvedValue(null);
      const conflict = Object.assign(
        new Error('duplicate key value violates unique constraint "UQ_parcel_shipmentId"'),
        { code: '23505' },
      );
      parcelRepo.save.mockRejectedValueOnce(conflict);

      const result = await (service as any).ensureParcelForShipment(shipment);

      expect(result).toBe(winner);
      expect(parcelRepo.save).toHaveBeenCalledTimes(1); // never retried into a second insert
    });

    it('rethrows a non-unique-violation error rather than masking it', async () => {
      parcelRepo.findOne.mockResolvedValue(null);
      superAgentRepo.findOne.mockResolvedValue(null);
      const dbError = new Error('connection terminated unexpectedly');
      parcelRepo.save.mockRejectedValue(dbError);

      await expect((service as any).ensureParcelForShipment(shipment)).rejects.toThrow(
        'connection terminated unexpectedly',
      );
    });
  });

  // ── Public tracking projection ─────────────────────────────────────────
  describe('trackShipment — public field contract', () => {
    it('returns only the allow-listed fields, excluding every internal id and phone number', async () => {
      shipmentRepo.findOne.mockResolvedValue({
        id: 55, // internal id — must NOT appear in output
        requestedByUserId: 7, // must NOT appear
        senderName: 'Kened', // must NOT appear
        senderPhone: '0711111111', // must NOT appear
        receiverName: 'Asha', // MUST appear
        receiverPhone: '0722222222', // must NOT appear
        originCity: 'Dar es Salaam',
        originRegionId: 3, // must NOT appear
        originWard: 'Kariakoo', // must NOT appear
        originWardId: 12, // must NOT appear
        destinationCity: 'Mwanza',
        destinationRegionId: 9, // must NOT appear
        destinationWard: 'Ilemela', // must NOT appear
        destinationWardId: 44, // must NOT appear
        itemDescription: 'Books',
        weightKg: 2,
        routeId: 8, // must NOT appear
        availabilityId: 21, // must NOT appear
        providerId: 6, // must NOT appear
        pickupOption: ShipmentHandoffOption.AGENT,
        deliveryOption: ShipmentHandoffOption.DOOR,
        priceQuoted: 15000, // must NOT appear
        status: ShipmentStatus.CONFIRMED,
        trackingNumber: 'KTX-SHP-55',
        collectedAt: null,
        deliveredAt: null,
        completedAt: null,
        createdAt: new Date('2026-09-01T00:00:00Z'),
        updatedAt: new Date('2026-09-02T00:00:00Z'), // must NOT appear
      });
      parcelRepo.findOne.mockResolvedValue({ trackingNumber: 'KTX-PCL-900' });

      const result = await service.trackShipment('KTX-SHP-55');

      expect(Object.keys(result).sort()).toEqual(
        [
          'trackingNumber',
          'status',
          'originCity',
          'destinationCity',
          'itemDescription',
          'weightKg',
          'pickupOption',
          'deliveryOption',
          'receiverName',
          'collectedAt',
          'deliveredAt',
          'completedAt',
          'createdAt',
          'parcelTrackingNumber',
        ].sort(),
      );
      expect(result).not.toHaveProperty('id');
      expect(result).not.toHaveProperty('requestedByUserId');
      expect(result).not.toHaveProperty('senderName');
      expect(result).not.toHaveProperty('senderPhone');
      expect(result).not.toHaveProperty('receiverPhone');
      expect(result).not.toHaveProperty('routeId');
      expect(result).not.toHaveProperty('availabilityId');
      expect(result).not.toHaveProperty('providerId');
      expect(result).not.toHaveProperty('originRegionId');
      expect(result).not.toHaveProperty('originWardId');
      expect(result).not.toHaveProperty('destinationRegionId');
      expect(result).not.toHaveProperty('destinationWardId');
      expect(result).not.toHaveProperty('priceQuoted');
      expect(result).not.toHaveProperty('updatedAt');
      expect(result.receiverName).toBe('Asha');
      expect(result.parcelTrackingNumber).toBe('KTX-PCL-900');
    });

    it('throws NotFoundException for an unknown tracking number', async () => {
      shipmentRepo.findOne.mockResolvedValue(null);
      await expect(service.trackShipment('KTX-SHP-999999')).rejects.toThrow(NotFoundException);
    });

    it('returns parcelTrackingNumber null when no Parcel exists yet (still-personal, unconfirmed shipment)', async () => {
      shipmentRepo.findOne.mockResolvedValue({
        trackingNumber: 'KTX-SHP-1',
        status: ShipmentStatus.PENDING,
        originCity: 'Dar es Salaam',
        destinationCity: 'Mwanza',
        itemDescription: 'Books',
        weightKg: 1,
        pickupOption: ShipmentHandoffOption.AGENT,
        deliveryOption: ShipmentHandoffOption.AGENT,
        receiverName: 'Asha',
        collectedAt: null,
        deliveredAt: null,
        completedAt: null,
        createdAt: new Date(),
      });
      parcelRepo.findOne.mockResolvedValue(null);

      const result = await service.trackShipment('KTX-SHP-1');
      expect(result.parcelTrackingNumber).toBeNull();
    });
  });
});
