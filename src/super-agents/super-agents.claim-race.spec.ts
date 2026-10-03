import { ConflictException } from '@nestjs/common';
import { SuperAgentsService } from './super-agents.service';

describe('destination Agent assignment authority', () => {
  it('rejects the legacy open claim before touching a Parcel', async () => {
    const service = Object.create(SuperAgentsService.prototype) as SuperAgentsService;
    await expect(service.claimParcel({ id: 1 } as any, 'KTX-1'))
      .rejects.toThrow(ConflictException);
    await expect(service.getIncomingParcels('Mwanza'))
      .rejects.toThrow(ConflictException);
  });
});
