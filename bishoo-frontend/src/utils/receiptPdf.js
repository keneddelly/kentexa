// POS receipt as a real PDF file (owner 2026-11-09: "the POS receipt when sent to WhatsApp should go
// like PDF, not text; even the computer receipt should look professional"). Built here in the
// browser, so it also works with no internet (a sale kept on this computer). No library: a small,
// valid PDF with the two built-in fonts (Helvetica and Helvetica-Bold), 80 mm wide, as tall as the
// receipt needs. Text is Latin-1; anything else becomes "?".

const W = 226.77; // 80 mm in points
const M = 14; // side margin
const INK = '0.059 0.078 0.098';
const MUTED = '0.325 0.392 0.443';
const RULE = '0.812 0.851 0.871';

// Character widths (1/1000 em) for ASCII 32..126, from the standard font metrics.
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

export const textWidth = (s, size, bold = false) => {
  const t = bold ? BOLD : HELV;
  let w = 0;
  for (const ch of String(s)) { const c = ch.charCodeAt(0); w += c >= 32 && c <= 126 ? t[c - 32] : 556; }
  return (w * size) / 1000;
};

// A PDF string: Latin-1 only, with ( ) \ and every non-ASCII byte escaped, so the file stays ASCII.
const pdfStr = (s) => {
  let out = '';
  for (const ch of String(s ?? '')) {
    const c = ch.charCodeAt(0);
    if (ch === '(' || ch === ')' || ch === '\\') out += `\\${ch}`;
    else if (c >= 32 && c <= 126) out += ch;
    else if (c >= 160 && c <= 255) out += `\\${c.toString(8).padStart(3, '0')}`;
    else if (ch === '–' || ch === '—') out += '-';
    else out += '?';
  }
  return `(${out})`;
};

const wrap = (text, size, bold, maxW) => {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = []; let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (textWidth(next, size, bold) <= maxW || !cur) cur = next; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
};

const n = (v) => Math.round(Number(v || 0)).toLocaleString('en-US');

export const PAY_LABEL = { cash: 'Taslimu', mpesa: 'M-Pesa', airtel: 'Airtel Money', tigopesa: 'Mixx by Yas', mixx: 'Mixx by Yas', halopesa: 'HaloPesa', mobile_money: 'Pesa kwa simu', bank: 'Benki', card: 'Kadi' };
const payLabel = (m) => PAY_LABEL[String(m || '').toLowerCase()] || String(m || '');

/** The receipt laid out top to bottom as drawing steps; y grows downwards here, flipped at the end. */
export function receiptLayout(r) {
  const ops = []; let y = 18;
  const inner = W - 2 * M;
  const text = (s, x, size, { bold = false, color = INK, align = 'left' } = {}) => {
    const w = textWidth(s, size, bold);
    const left = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    ops.push({ t: 'text', s, x: left, y, size, bold, color });
  };
  const rule = (gap = 7) => { y += gap; ops.push({ t: 'rule', y }); y += gap; };
  const pair = (label, value, { bold = false, size = 9 } = {}) => {
    y += size + 3;
    text(label, M, size, { color: bold ? INK : MUTED, bold });
    text(value, W - M, size, { bold: true, align: 'right' });
  };

  for (const line of wrap(r.shopName || 'Duka', 13, true, inner)) { y += 15; text(line, W / 2, 13, { bold: true, align: 'center' }); }
  if (r.shopPhone) { y += 11; text(r.shopPhone, W / 2, 8.5, { color: MUTED, align: 'center' }); }
  y += 13; text('RISITI YA MAUZO', W / 2, 8, { bold: true, color: MUTED, align: 'center' });
  rule(8);
  pair('Namba ya risiti', r.receiptNumber || '-');
  pair('Tarehe', r.at ? new Date(r.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');
  if (r.cashier) pair('Mhudumu', r.cashier);
  if (r.customer?.name) pair('Mteja', r.customer.name);
  if (r.customer?.phone) pair('Simu ya mteja', r.customer.phone);
  rule();
  y += 9; text('BIDHAA', M, 7.5, { bold: true, color: MUTED }); text('JUMLA', W - M, 7.5, { bold: true, color: MUTED, align: 'right' });
  for (const i of r.items || []) {
    const lineTotal = n(Number(i.unitPrice) * Number(i.quantity));
    const nameLines = wrap(i.name, 9.5, true, inner - textWidth(lineTotal, 9.5, true) - 8);
    for (let k = 0; k < nameLines.length; k += 1) {
      y += k === 0 ? 15 : 12;
      text(nameLines[k], M, 9.5, { bold: true });
      if (k === 0) text(lineTotal, W - M, 9.5, { bold: true, align: 'right' });
    }
    y += 11; text(`${i.quantity} x ${n(i.unitPrice)}`, M, 8.5, { color: MUTED });
  }
  rule(9);
  if (Number(r.discount) > 0) { pair('Jumla ndogo', n(r.subtotal)); pair('Punguzo', `-${n(r.discount)}`); }
  y += 17; text('JUMLA', M, 12, { bold: true }); text(`TZS ${n(r.total)}`, W - M, 12, { bold: true, align: 'right' });
  y += 4;
  for (const p of r.payments || []) pair(payLabel(p.method), n(p.amount));
  if (Number(r.change) > 0) pair('Chenji', n(r.change));
  if (Number(r.balanceDue) > 0) pair('Deni', `TZS ${n(r.balanceDue)}`, { bold: true });
  rule(9);
  for (const line of wrap(`Asante kwa kununua ${r.shopName || ''}.`, 9, false, inner)) { y += 12; text(line, W / 2, 9, { align: 'center' }); }
  y += 12; text('Imetolewa na KenteXa POS', W / 2, 7.5, { color: MUTED, align: 'center' });
  y += 16;
  return { ops, height: Math.ceil(y) };
}

/** The receipt as PDF bytes (a string of ASCII characters). */
export function receiptPdf(r) {
  const { ops, height } = receiptLayout(r);
  const H = height;
  const body = ops.map((o) => {
    const yy = (H - o.y).toFixed(2);
    if (o.t === 'rule') return `${RULE} RG 0.6 w ${M} ${yy} m ${(W - M).toFixed(2)} ${yy} l S`;
    return `${o.color} rg BT /${o.bold ? 'F2' : 'F1'} ${o.size} Tf ${o.x.toFixed(2)} ${yy} Td ${pdfStr(o.s)} Tj ET`;
  }).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>`,
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Title ${pdfStr(`Risiti ${r.receiptNumber || ''}`)} /Producer (KenteXa POS) >>`,
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

export const receiptFileName = (r) => `Risiti-${String(r.receiptNumber || 'mauzo').replace(/[^A-Za-z0-9-]/g, '')}.pdf`;

export function receiptPdfBlob(r) {
  const s = receiptPdf(r);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) bytes[i] = s.charCodeAt(i);
  return new Blob([bytes], { type: 'application/pdf' });
}

/**
 * Send the receipt PDF. On a phone (and computers that can share files) the share sheet opens with
 * the PDF attached, so the cashier picks WhatsApp and the customer. Otherwise the PDF is saved and
 * WhatsApp opens on the customer's chat with a short note to attach it.
 * Returns 'shared' | 'downloaded' | 'cancelled'.
 */
export async function shareReceiptPdf(r, waPhone) {
  const blob = receiptPdfBlob(r);
  const name = receiptFileName(r);
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  if (nav?.share && typeof File !== 'undefined') {
    const file = new File([blob], name, { type: 'application/pdf' });
    if (!nav.canShare || nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: `Risiti ${r.receiptNumber || ''}`, text: `Risiti yako ya ${r.shopName || 'duka'}: TZS ${n(r.total)}. Asante.` });
        return 'shared';
      } catch (e) {
        if (e?.name === 'AbortError') return 'cancelled';
      }
    }
  }
  downloadReceiptPdf(r, blob);
  if (waPhone) {
    const note = `Risiti yako ya ${r.shopName || 'duka'} (${r.receiptNumber || ''}): TZS ${n(r.total)}. PDF ya risiti imeambatishwa. Asante.`;
    window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(note)}`, '_blank', 'noopener');
  }
  return 'downloaded';
}

export function downloadReceiptPdf(r, blob = receiptPdfBlob(r)) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = receiptFileName(r);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
