import { AirtelService } from './airtel/airtel.service';
import { VodacomService } from './vodacom/vodacom.service';
import { MockAgentService } from './mock/mock-agent.service';

/**
 * S0 Decision 2: any provider without an established, verified query
 * contract must fail closed — never fabricate a status from a callback
 * body. Airtel/Vodacom have no verified contract in this codebase; Mock has
 * no real transaction store to verify against at all.
 */
describe('providers with no verified query contract fail closed', () => {
  it('AirtelService.verifyPayment is always NOT_SUPPORTED', async () => {
    const result = await new AirtelService().verifyPayment('anything');
    expect(result).toEqual({ status: 'NOT_SUPPORTED', amountMinor: null, currency: null, providerReference: null });
  });

  it('VodacomService.verifyPayment is always NOT_SUPPORTED', async () => {
    const result = await new VodacomService().verifyPayment('anything');
    expect(result).toEqual({ status: 'NOT_SUPPORTED', amountMinor: null, currency: null, providerReference: null });
  });

  it('MockAgentService.verifyPayment is always NOT_SUPPORTED (mock never authorises its own payment)', async () => {
    const result = await new MockAgentService().verifyPayment('anything');
    expect(result).toEqual({ status: 'NOT_SUPPORTED', amountMinor: null, currency: null, providerReference: null });
  });
});
