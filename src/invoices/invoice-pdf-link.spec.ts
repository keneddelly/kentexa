import { signPdfQuery, verifyPdfQuery, PDF_LINK_TTL_SECONDS } from './invoice-pdf-link';
import { InvoicesController } from './invoices.controller';

const parse = (q: string) => Object.fromEntries(new URLSearchParams(q)) as { e: string; k: string };

describe('signed invoice / receipt PDF links (owner 2026-11-09 audit)', () => {
  const old = process.env.JWT_SECRET;
  beforeAll(() => { process.env.JWT_SECRET = 'test-secret'; });
  afterAll(() => { process.env.JWT_SECRET = old; });

  it('a fresh link opens only its own document', () => {
    const now = Date.now();
    const { e, k } = parse(signPdfQuery('invoice', 'KNT-INV-2026-00001', now));
    expect(verifyPdfQuery('invoice', 'KNT-INV-2026-00001', e, k, now)).toBe(true);
    expect(verifyPdfQuery('invoice', 'KNT-INV-2026-00002', e, k, now)).toBe(false);
    expect(verifyPdfQuery('receipt', 'KNT-INV-2026-00001', e, k, now)).toBe(false);
  });

  it('no link, a made-up link or an old link does not open', () => {
    const now = Date.now();
    const { e, k } = parse(signPdfQuery('receipt', 'R1', now));
    expect(verifyPdfQuery('receipt', 'R1', undefined, undefined, now)).toBe(false);
    expect(verifyPdfQuery('receipt', 'R1', e, 'abc', now)).toBe(false);
    expect(verifyPdfQuery('receipt', 'R1', e, k, now + (PDF_LINK_TTL_SECONDS + 5) * 1000)).toBe(false);
  });

  describe('controller', () => {
    const invoice = { invoiceNumber: 'KNT-INV-2026-00007', buyer: { id: 1 }, order: { seller: { id: 2 } } };
    const service: any = {
      findByInvoiceNumber: jest.fn().mockResolvedValue(invoice),
      findByReceiptNumber: jest.fn().mockResolvedValue({ ...invoice, receiptNumber: 'KNT-RCP-2026-00007' }),
      assertInvoiceOwner: jest.fn((inv, user) => {
        if (inv.buyer.id !== user.id && inv.order.seller.id !== user.id) throw new Error('Forbidden');
      }),
      generateInvoicePDF: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    };
    const ctrl = new InvoicesController(service);

    it('the buyer gets a link; a stranger does not; staff may', async () => {
      const r = await ctrl.invoicePdfLink('KNT-INV-2026-00007', { user: { id: 1 } }, { roleType: 'buyer' } as any);
      expect(r.url).toMatch(/^\/invoices\/number\/KNT-INV-2026-00007\/pdf\?e=\d+&k=/);
      await expect(ctrl.invoicePdfLink('KNT-INV-2026-00007', { user: { id: 9 } }, { roleType: 'buyer' } as any)).rejects.toThrow('Forbidden');
      await expect(ctrl.receiptPdfLink('KNT-RCP-2026-00007', { user: { id: 9 } }, { roleType: 'finance' } as any)).resolves.toHaveProperty('url');
    });

    it('the PDF route refuses a plain link', async () => {
      const res: any = { set: jest.fn(), send: jest.fn(), setHeader: jest.fn(), end: jest.fn() };
      await expect(ctrl.downloadInvoice('KNT-INV-2026-00007', undefined as any, undefined as any, res)).rejects.toThrow();
      expect(service.generateInvoicePDF).not.toHaveBeenCalled();
      const { url } = await ctrl.invoicePdfLink('KNT-INV-2026-00007', { user: { id: 2 } }, { roleType: 'seller' } as any);
      const { e, k } = parse(url.split('?')[1]);
      await ctrl.downloadInvoice('KNT-INV-2026-00007', e, k, res);
      expect(service.generateInvoicePDF).toHaveBeenCalledWith('KNT-INV-2026-00007');
    });
  });
});
