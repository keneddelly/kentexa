import { inflateSync } from 'zlib';
import { InvoicesService, isManualPaymentMethod } from './invoices.service';
import { InvoiceStatus } from './entities/invoice.entity';

/**
 * The Super Agent counter records mobile money as 'mpesa' / 'airtel'. The receipt must
 * treat them as manual payments (collected at the counter, only recorded in KenteXa),
 * never as "Kentexa Online" / "verified by Kentexa Payment System".
 */

// pdfkit writes each text run as hex glyph strings inside deflated content streams.
function pdfText(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  let text = '';
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    let content: string;
    try { content = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { continue; }
    for (const run of content.match(/\[(?:[^\]]*)\]\s*TJ/g) || []) {
      for (const hex of run.match(/<([0-9a-fA-F]+)>/g) || []) text += Buffer.from(hex.slice(1, -1), 'hex').toString('latin1');
      text += ' ';
    }
  }
  return text.replace(/\s+/g, ' ');
}

async function receiptFor(paymentMethod: string): Promise<string> {
  const invoice: any = {
    id: 1, invoiceNumber: 'INV-2026-000001', receiptNumber: 'RCP-2026-000001', status: InvoiceStatus.PAID,
    amount: 8000, paymentMethod, paidAt: new Date('2026-10-21T10:00:00Z'), transactionReference: null,
    order: { id: 5, seller: { name: 'Ofisi ya Ubungo' } }, buyerName: 'Asha', buyerPhone: '255712345678',
  };
  const service: any = Object.create(InvoicesService.prototype);
  service.invoiceRepo = { findOne: jest.fn(async () => invoice) };
  return pdfText(await service.generateReceiptPDF('RCP-2026-000001'));
}

describe('Receipt: counter mobile money is a manual payment', () => {
  it.each(['mpesa', 'airtel'])('%s receipt says External / Offline, collected directly, never Kentexa Online', async (method) => {
    const text = await receiptFor(method);
    expect(text).toContain('External / Offline');
    expect(text).toContain('collected directly by the seller');
    expect(text).not.toContain('Kentexa Online');
    expect(text).not.toContain('Payment verified by Kentexa Payment System');
  });

  it('a real gateway payment still says Kentexa Online (the check reads the receipt correctly)', async () => {
    const text = await receiptFor('selcom');
    expect(text).toContain('Kentexa Online');
    expect(text).not.toContain('External / Offline');
  });

  it('the manual list: mpesa and airtel (any case) plus the existing cash / mobile_money / bank / other', () => {
    for (const m of ['mpesa', 'airtel', 'MPesa', 'Airtel', ' MPESA ', 'cash', 'mobile_money', 'bank', 'other']) {
      expect(isManualPaymentMethod(m)).toBe(true);
    }
    for (const m of ['selcom', 'vodacom', 'mock', 'clickpesa', '', null, undefined]) {
      expect(isManualPaymentMethod(m as any)).toBe(false);
    }
  });
});
