// The printed counter receipt: ONE layout for every printer, no per-office
// setting. No paper size is forced; the slip is min(100%, 80mm) wide, so it
// fills a 58mm or 80mm roll and stays a readable slip at the top of A4/Letter.
// Print units (pt/mm) only, never px.

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// "cash" / "mpesa" / "airtel" as stored -> Swahili on paper.
export function paymentMethodSw(method) {
  const m = String(method || '').trim().toLowerCase();
  if (!m) return '';
  if (m === 'cash') return 'Taslimu';
  if (m === 'mpesa' || m === 'm-pesa') return 'Pesa kwa simu (M-Pesa)';
  if (m === 'airtel' || m === 'airtel_money') return 'Pesa kwa simu (Airtel Money)';
  if (m === 'tigopesa' || m === 'mixx') return 'Pesa kwa simu (Mixx by Yas)';
  if (m === 'halopesa') return 'Pesa kwa simu (HaloPesa)';
  if (m === 'mobile_money' || m === 'mobile') return 'Pesa kwa simu';
  return method;
}

const money = (n) => `TZS ${Number(n || 0).toLocaleString('en-US')}`;

export const RECEIPT_CSS = `
  @page { margin: 3mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.25; }
  .slip { width: 100%; max-width: 80mm; margin: 0 auto; padding: 1mm 0; }
  .brand { text-align: center; font-size: 13pt; font-weight: 700; overflow-wrap: anywhere; }
  .brand-sub { text-align: center; font-size: 9pt; margin-top: 0.5mm; }
  .verified { text-align: center; font-size: 9pt; margin: 2mm 0; padding: 1mm 0;
    border-top: 0.3mm dashed #000; border-bottom: 0.3mm dashed #000; }
  .number-label { text-align: center; font-size: 9pt; margin-top: 2mm; }
  /* The number never splits over two lines: 16pt, a little smaller only on a
     58mm roll (10vw = 10% of the printable width). */
  .number { text-align: center; font-size: 16pt; font-size: min(16pt, 10vw); font-weight: 700;
    white-space: nowrap; margin: 0.5mm 0 2mm; }
  .row { display: flex; flex-wrap: wrap; justify-content: space-between; column-gap: 2mm; margin: 0.8mm 0; }
  .l { flex: 0 1 auto; }
  .v { flex: 1 1 auto; font-weight: 700; text-align: right; overflow-wrap: anywhere; }
  hr { border: 0; border-top: 0.3mm dashed #000; margin: 2mm 0; }
  .amount { text-align: center; font-size: 16pt; font-weight: 700; margin: 2mm 0; }
  .footer { text-align: center; font-size: 9pt; margin-top: 2mm; }
  .claim-title { text-align: center; font-size: 10pt; font-weight: 700; }
  .claim-steps { font-size: 9pt; margin: 1mm 0; }
  .claim-code { text-align: center; font-family: 'Courier New', monospace; font-size: 12pt; font-weight: 700;
    word-spacing: 1mm; margin: 1.5mm 0; }
  .claim-note { font-size: 8pt; text-align: center; }
`;

// The claim secret as printed: groups of 4 ("a3f2 9c01 …"). The claim form ignores the spaces.
export const formatClaimSecret = (secret) => (String(secret || '').match(/.{1,4}/g) || []).join(' ');

/**
 * Full HTML document for one receipt. `autoPrint` adds the print call.
 * `claimSecret` is printed only on the FIRST receipt, from the screen that just
 * created the parcel (it is never stored, so a reprint cannot contain it).
 */
export function buildReceiptHtml(receipt, { autoPrint = true, claimSecret = null } = {}) {
  const r = receipt || {};
  const row = (label, value) => (value
    ? `<div class="row"><span class="l">${escapeHtml(label)}</span><span class="v">${escapeHtml(value)}</span></div>`
    : '');
  const office = r.superAgentName || 'Super Agent';
  return `<!DOCTYPE html><html lang="sw"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Risiti - ${escapeHtml(r.parcelReference)}</title>
<style>${RECEIPT_CSS}</style></head><body><div class="slip">
<div class="brand">${escapeHtml(office)}</div>
<div class="brand-sub">${escapeHtml(r.superAgentCity || '')}</div>
<div class="verified">&#10004; Verified by KenteXa</div>
<div class="number-label">Namba ya Mzigo</div>
<div class="number">${escapeHtml(r.parcelReference)}</div>
${row('Namba ya Risiti', r.receiptNumber)}
${row('Tarehe', r.paidAt ? new Date(r.paidAt).toLocaleString('sw-TZ') : '')}
<hr />
${row('Mtumaji', r.senderName)}
${row('Simu ya Mtumaji', r.senderPhone)}
${row('Mpokeaji', r.receiverName)}
${row('Simu ya Mpokeaji', r.receiverPhone)}
${row('Thamani ya Mzigo', r.declaredValue ? money(r.declaredValue) : '')}
<hr />
${row('Njia ya Malipo', paymentMethodSw(r.paymentMethod))}
<div class="amount">${money(r.amountPaid)}</div>
<div class="footer">Malipo yamepokewa. Asante kwa kutumia<br />${escapeHtml(office)}</div>
${claimSecret ? `<hr />
<div class="claim-title">Dai mzigo wako kwenye KenteXa</div>
<div class="claim-steps">Fungua KenteXa &rarr; Mizigo Yangu &rarr; Ongeza mzigo wa dawati. Weka Namba ya Mzigo na namba hii ya siri:</div>
<div class="claim-code">${escapeHtml(formatClaimSecret(claimSecret))}</div>
<div class="claim-note">Usimpe mtu mwingine. Namba ya uthibitisho itatumwa kwa SMS kwenye simu ya mtumaji.</div>` : ''}
</div>${autoPrint ? '<script>window.onload = function () { window.print(); };</script>' : ''}
</body></html>`;
}
