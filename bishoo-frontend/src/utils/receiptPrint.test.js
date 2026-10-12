import { buildReceiptHtml, paymentMethodSw, RECEIPT_CSS } from './receiptPrint';

const receipt = {
  receiptNumber: 'KNT-RCP-2026-00123', parcelReference: 'KTX 9815 9515 21', orderReference: 'KTX-ORD-129',
  senderName: 'Juma Hamisi', senderPhone: '0712000111', receiverName: 'Amina Hassan', receiverPhone: '0787000222',
  declaredValue: 200000, amountPaid: 15000, paymentMethod: 'cash',
  superAgentName: 'Kariakoo Parcel Office', superAgentCity: 'Dar es Salaam', paidAt: '2026-10-12T07:00:00Z',
};

describe('payment method on paper, in Swahili', () => {
  test('cash and mobile money', () => {
    expect(paymentMethodSw('cash')).toBe('Taslimu');
    expect(paymentMethodSw('mpesa')).toBe('Pesa kwa simu (M-Pesa)');
    expect(paymentMethodSw('airtel')).toBe('Pesa kwa simu (Airtel Money)');
    expect(paymentMethodSw('mobile_money')).toBe('Pesa kwa simu');
    expect(paymentMethodSw('')).toBe('');
  });
});

describe('one universal receipt for every printer', () => {
  test('no forced paper size; slip is min(100%, 80mm); print units only', () => {
    expect(RECEIPT_CSS).not.toMatch(/@page\s*\{[^}]*size/);
    expect(RECEIPT_CSS).toMatch(/\.slip \{ width: 100%; max-width: 80mm;/);
    expect(RECEIPT_CSS).not.toMatch(/\d+px/);
    expect(RECEIPT_CSS).toMatch(/body \{[^}]*font-size: 11pt/);
    expect(RECEIPT_CSS).toMatch(/\.number \{[^}]*font-size: 16pt;[^}]*font-weight: 700/);
    expect(RECEIPT_CSS).toMatch(/\.number \{[^}]*white-space: nowrap/);
  });

  test('the one customer number is printed large; the staff KTX-ORD is not printed', () => {
    const html = buildReceiptHtml(receipt, { autoPrint: false });
    expect(html).toContain('<div class="number-label">Namba ya Mzigo</div>');
    expect(html).toContain('<div class="number">KTX 9815 9515 21</div>');
    expect(html).not.toContain('KTX-ORD-129');
    expect(html).toContain('Taslimu');
    expect(html).not.toMatch(/>cash</);
    expect(html).not.toContain('window.print');
  });

  test('names are escaped', () => {
    const html = buildReceiptHtml({ ...receipt, senderName: '<b>x</b>' }, { autoPrint: false });
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});
