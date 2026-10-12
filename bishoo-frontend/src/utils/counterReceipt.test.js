import {
  CLAIM_CODE_NOTE, SHOW_CLAIM_CODE_NOTE, storableWalkResult, saveLastWalkResult, loadLastWalkResult, clearLastWalkResult,
  walkResultStorageKey, canHandOverToRecipient, canReopenReceipt, historiaMatches,
  displayParcelNumber, otherParcelNumbers,
} from './counterReceipt';

const walkIn = {
  trackingNumber: 'KTX-ORD-41', receiptNumber: 'RCP-0041',
  receipt: { receiptNumber: 'RCP-0041', parcelReference: 'KTX-ORD-41' },
  shipmentClaim: { shipmentId: 5, receiptSecret: 'top-secret-claim' },
};

describe('last walk-in receipt kept in the browser', () => {
  beforeEach(() => sessionStorage.clear());

  test('never keeps the claim secret', () => {
    expect(storableWalkResult(walkIn)).not.toHaveProperty('shipmentClaim');
    saveLastWalkResult(7, walkIn);
    expect(sessionStorage.getItem(walkResultStorageKey(7))).not.toContain('top-secret-claim');
  });

  test('survives a reload until "Mzigo mpya" clears it, per office', () => {
    saveLastWalkResult(7, walkIn);
    expect(loadLastWalkResult(7)).toMatchObject({ trackingNumber: 'KTX-ORD-41', receiptNumber: 'RCP-0041' });
    expect(loadLastWalkResult(8)).toBeNull();
    clearLastWalkResult(7);
    expect(loadLastWalkResult(7)).toBeNull();
  });

  test('ignores broken or empty data', () => {
    sessionStorage.setItem(walkResultStorageKey(7), '{not json');
    expect(loadLastWalkResult(7)).toBeNull();
    expect(storableWalkResult({ receiptNumber: 'x' })).toBeNull();
    sessionStorage.clear();
    saveLastWalkResult(null, walkIn);
    expect(sessionStorage.length).toBe(0);
  });

  test('Release C: the claim-code note is shown wherever the code itself is not', () => {
    expect(SHOW_CLAIM_CODE_NOTE).toBe(true);
    expect(CLAIM_CODE_NOTE).toBe('Namba ya siri ya mteja ya kudai mzigo haiwezi kuonyeshwa tena.');
  });
});

describe('the number shown on the counter', () => {
  const fmt = (w) => `F(${w})`;
  test('customer number first; other numbers small, without repeats', () => {
    const p = { trackingNumber: 'KTX-ORD-1', waybillNumber: 'KTX9815951521', customerNumber: 'KTX 9815 9515 21' };
    expect(displayParcelNumber(p)).toBe('KTX 9815 9515 21');
    expect(otherParcelNumbers(p, () => 'KTX 9815 9515 21')).toEqual(['KTX-ORD-1']);
  });
  test('before the switch: KTX-ORD first, waybill small for staff', () => {
    const p = { trackingNumber: 'KTX-ORD-1', waybillNumber: 'KTX9815951521', customerNumber: 'KTX-ORD-1' };
    expect(displayParcelNumber(p)).toBe('KTX-ORD-1');
    expect(otherParcelNumbers(p, fmt)).toEqual(['F(KTX9815951521)']);
  });
  test('old lists without customerNumber fall back to KTX-ORD', () => {
    expect(displayParcelNumber({ trackingNumber: 'KTX-ORD-9' })).toBe('KTX-ORD-9');
    expect(otherParcelNumbers({ trackingNumber: 'KTX-ORD-9' }, fmt)).toEqual([]);
    expect(displayParcelNumber(null)).toBe('');
  });
});

describe('"Kabidhi kwa mpokeaji" row button', () => {
  const base = { status: 'awaiting_buyer', myRole: 'destination', buyerRequestedDelivery: false };
  test('shown for a parcel waiting for the recipient at this office', () => {
    expect(canHandOverToRecipient(base)).toBe(true);
    expect(canHandOverToRecipient({ ...base, status: 'arrived_at_hub' })).toBe(true);
    expect(canHandOverToRecipient({ ...base, myRole: 'both' })).toBe(true);
  });
  test('not shown at the sending office, for door delivery, or before arrival', () => {
    expect(canHandOverToRecipient({ ...base, myRole: 'origin' })).toBe(false);
    expect(canHandOverToRecipient({ ...base, buyerRequestedDelivery: true })).toBe(false);
    expect(canHandOverToRecipient({ ...base, status: 'in_transit' })).toBe(false);
    expect(canHandOverToRecipient({ ...base, status: 'out_for_delivery' })).toBe(false);
    expect(canHandOverToRecipient(null)).toBe(false);
  });
});

describe('Historia', () => {
  test('receipt button only where this office took the money', () => {
    expect(canReopenReceipt({ myRole: 'origin' })).toBe(true);
    expect(canReopenReceipt({ myRole: 'both' })).toBe(true);
    expect(canReopenReceipt({ myRole: 'destination' })).toBe(false);
  });

  const p = { waybillNumber: 'KTX9584287081', trackingNumber: 'KTX-ORD-41', senderName: 'Juma Hamisi',
    recipientName: 'Asha', senderPhone: '0712345678', buyerPhone: '0755000111' };
  test('search finds waybill, old number, phone and name', () => {
    expect(historiaMatches(p, 'ktx9584287081')).toBe(true);
    expect(historiaMatches(p, 'KTX 958 428 7081')).toBe(true);
    expect(historiaMatches(p, 'ktx-ord-41')).toBe(true);
    expect(historiaMatches(p, '0712345678')).toBe(true);
    expect(historiaMatches(p, 'juma')).toBe(true);
    expect(historiaMatches(p, '  ')).toBe(true);
    expect(historiaMatches(p, 'mwanza')).toBe(false);
    expect(historiaMatches(p, ' - ')).toBe(true); // '-' is in KTX-ORD-41
    expect(historiaMatches({ trackingNumber: 'KTX9' }, '-')).toBe(false);
  });
});
