import 'reflect-metadata';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { BusinessController } from './business.controller';
import { JwtAuthGuard } from '../auth/auth.guard';

/**
 * I2C — wiring of GET /business/:businessId/commerce-entry: authenticated, the
 * businessId comes from the route only, the caller from the session, and the
 * whole decision is delegated to the capability engine (no ids from a body).
 */
describe('BusinessController.getCommerceEntry (I2C)', () => {
  const build = () => {
    const capabilityApplications: any = { getCommerceEntryState: jest.fn().mockResolvedValue({ state: 'available' }) };
    const controller = new (BusinessController as any)(
      {}, {}, {}, {}, {}, { isEnabled: () => false }, capabilityApplications,
    ) as BusinessController;
    return { controller, capabilityApplications };
  };

  it('is a GET on :businessId/commerce-entry behind the class-level JWT guard', () => {
    const handler = BusinessController.prototype.getCommerceEntry;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(':businessId/commerce-entry');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(GUARDS_METADATA, BusinessController)).toContain(JwtAuthGuard);
  });

  it('delegates with the route businessId and the authenticated user only', async () => {
    const { controller, capabilityApplications } = build();
    const req = { user: { id: 9 } };
    await expect(controller.getCommerceEntry(7, req as any)).resolves.toEqual({ state: 'available' });
    expect(capabilityApplications.getCommerceEntryState).toHaveBeenCalledWith(7, req.user);
  });

  it('declares no @Body / no client-supplied authority parameter', () => {
    expect(BusinessController.prototype.getCommerceEntry.length).toBe(2); // (businessId, req)
  });
});
