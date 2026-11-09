import api from '../api/api';
import { openDocumentPdf, pdfLinkPath } from './documentPdf';

jest.mock('../api/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../api/baseUrl', () => ({ API_BASE_URL: 'https://api.test' }));

test('asks the server for a signed link, then opens it (owner 2026-11-09 audit)', async () => {
  const tab = { location: { href: '' }, close: jest.fn() };
  const open = jest.spyOn(window, 'open').mockReturnValue(tab);
  api.get.mockResolvedValue({ data: { url: '/invoices/number/KNT-INV-2026-00001/pdf?e=1&k=x' } });
  await openDocumentPdf('invoice', 'KNT-INV-2026-00001');
  expect(api.get).toHaveBeenCalledWith('/invoices/number/KNT-INV-2026-00001/pdf-link');
  expect(tab.location.href).toBe('https://api.test/invoices/number/KNT-INV-2026-00001/pdf?e=1&k=x');
  expect(pdfLinkPath('receipt', 'KNT-RCP-2026-00002')).toBe('/invoices/receipt/KNT-RCP-2026-00002/pdf-link');
  open.mockRestore();
});

test('not allowed: the empty tab is closed and the error goes back', async () => {
  const tab = { location: { href: '' }, close: jest.fn() };
  const open = jest.spyOn(window, 'open').mockReturnValue(tab);
  api.get.mockRejectedValue(new Error('403'));
  await expect(openDocumentPdf('receipt', 'R1')).rejects.toThrow('403');
  expect(tab.close).toHaveBeenCalled();
  open.mockRestore();
});
