// Invoice and receipt PDFs open through a short signed link (owner 2026-11-09 security audit):
// the app asks the server for a 15-minute link, which it gives only to the buyer, the seller or
// KenteXa staff, then opens it. A plain link to the PDF no longer works.
import api from '../api/api';
import { API_BASE_URL } from '../api/baseUrl';

export const pdfLinkPath = (kind, number) =>
  kind === 'receipt'
    ? `/invoices/receipt/${encodeURIComponent(number)}/pdf-link`
    : `/invoices/number/${encodeURIComponent(number)}/pdf-link`;

export async function openDocumentPdf(kind, number) {
  // Open the tab inside the click so the browser does not block it, then point it at the PDF.
  const tab = typeof window !== 'undefined' ? window.open('', '_blank') : null;
  try {
    const { data } = await api.get(pdfLinkPath(kind, number));
    const url = `${API_BASE_URL}${data.url}`;
    if (tab) tab.location.href = url;
    else window.location.assign(url);
  } catch (e) {
    if (tab) tab.close();
    throw e;
  }
}
