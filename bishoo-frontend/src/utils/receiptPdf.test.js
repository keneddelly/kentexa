import { receiptPdf, receiptLayout, textWidth, shareReceiptPdf, receiptFileName } from './receiptPdf';

const sale = {
  shopName: 'BIS Store', receiptNumber: 'R-9', at: '2026-11-09T12:00:00Z', cashier: 'Dativa', customer: { name: 'Neema', phone: '0755111222' },
  items: [{ name: 'Sukari 1kg', quantity: 2, unitPrice: 3200 }, { name: 'Mafuta (lita 3)', quantity: 1, unitPrice: 18500 }],
  subtotal: 24900, discount: 400, total: 24500, payments: [{ method: 'cash', amount: 20000 }, { method: 'mpesa', amount: 4500 }], change: 0, balanceDue: 0,
};

// Owner 2026-11-09: the POS receipt goes to WhatsApp as a PDF, and looks professional.
test('a valid one-page PDF with the shop, items, total and payments', () => {
  const pdf = receiptPdf(sale);
  expect(pdf.startsWith('%PDF-1.4')).toBe(true);
  expect(pdf.trim().endsWith('%%EOF')).toBe(true);
  expect(pdf).toContain('/BaseFont /Helvetica-Bold');
  for (const s of ['(BIS Store)', '(Sukari 1kg)', '(Mafuta \\(lita 3\\))', '(TZS 24,500)', '(M-Pesa)', '(Punguzo)', '(Dativa)']) expect(pdf).toContain(s);
  // xref offsets point at the objects
  const xref = Number(pdf.match(/startxref\n(\d+)/)[1]);
  expect(pdf.slice(xref, xref + 4)).toBe('xref');
  const first = Number(pdf.match(/0000000000 65535 f \n(\d{10})/)[1]);
  expect(pdf.slice(first, first + 7)).toBe('1 0 obj');
  expect(/[^\x00-\x7f]/.test(pdf)).toBe(false);
});

test('amounts are right-aligned inside the slip; long names wrap', () => {
  const { ops } = receiptLayout({ ...sale, items: [{ name: 'Mafuta ya kupikia Korie 3 lita dumu kubwa toleo maalum', quantity: 1, unitPrice: 18500 }] });
  const total = ops.find((o) => o.s === 'TZS 24,500');
  expect(total.x + textWidth(total.s, total.size, true)).toBeCloseTo(226.77 - 14, 1);
  expect(ops.filter((o) => o.bold && o.size === 9.5 && o.s !== '18,500').length).toBeGreaterThan(1);
});

test('phone: the share sheet gets the PDF file; computer without sharing: the PDF is saved and WhatsApp opens', async () => {
  const share = jest.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { share, canShare: () => true });
  expect(await shareReceiptPdf(sale, '255755111222')).toBe('shared');
  const file = share.mock.calls[0][0].files[0];
  expect(file.name).toBe(receiptFileName(sale));
  expect(file.type).toBe('application/pdf');

  delete navigator.share; delete navigator.canShare;
  global.URL.createObjectURL = jest.fn(() => 'blob:x'); global.URL.revokeObjectURL = jest.fn();
  const open = jest.spyOn(window, 'open').mockReturnValue(null);
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  expect(await shareReceiptPdf(sale, '255755111222')).toBe('downloaded');
  expect(click).toHaveBeenCalled();
  expect(open.mock.calls[0][0]).toMatch(/^https:\/\/wa\.me\/255755111222\?text=/);
  open.mockRestore(); click.mockRestore();
});
