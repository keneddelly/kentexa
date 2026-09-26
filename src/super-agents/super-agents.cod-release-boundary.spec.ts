import { BadRequestException } from '@nestjs/common';
import { ParcelStatus } from './entities/parcel.entity';
import { SuperAgentsService } from './super-agents.service';

describe('generic hub status cannot declare terminal delivery', () => {
  const user = { id: 7 } as any;
  const trackingNumber = 'KTX-31';

  for (const status of [ParcelStatus.OUT_FOR_DELIVERY, ParcelStatus.DELIVERED]) {
    it(`rejects ${status} before reading or writing parcel, order, tracking, or COD money`, async () => {
      const service = Object.create(SuperAgentsService.prototype) as SuperAgentsService;
      const parcelRepo = { findOne: jest.fn(), update: jest.fn(), increment: jest.fn() };
      const orderRepo = { update: jest.fn() };
      const trackingRepo = { save: jest.fn(), insert: jest.fn() };
      const orderRelease = { releaseSellerProceeds: jest.fn() };
      const dataSource = { transaction: jest.fn() };
      Object.assign(service, { parcelRepo, orderRepo, trackingRepo, orderRelease, dataSource });

      await expect(service.updateParcelStatus(user, trackingNumber, {
        status, city: 'Dar', codBalanceCollected: 5000,
      })).rejects.toThrow(BadRequestException);
      expect(parcelRepo.findOne).not.toHaveBeenCalled();
      expect(parcelRepo.update).not.toHaveBeenCalled();
      expect(parcelRepo.increment).not.toHaveBeenCalled();
      expect(orderRepo.update).not.toHaveBeenCalled();
      expect(trackingRepo.save).not.toHaveBeenCalled();
      expect(trackingRepo.insert).not.toHaveBeenCalled();
      expect(orderRelease.releaseSellerProceeds).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  }
});
