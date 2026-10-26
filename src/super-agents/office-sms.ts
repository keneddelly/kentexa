/**
 * Every SMS an office's action sends ends with that office's own phone number
 * (owner 2026-10-26: "the SMS that goes out should include their number at the
 * bottom"), so the customer calls the office, not KenteXa. KenteXa is only the
 * network; the office is the business the customer deals with.
 *
 * The line goes just above "Verified by Kentexa" when the text has it, else at the
 * end. Nothing is added when the office has no phone, or when the text already
 * shows that number (e.g. an arrival SMS with "Simu ya Hub").
 */
export interface OfficeContact {
  phone?: string | null;
  user?: { phone?: string | null } | null;
}

const digits = (v: unknown) => String(v ?? '').replace(/[^0-9]/g, '');

/** 255712345678 / +255 712 345 678 / 0712345678 -> "0712 345 678". */
export function localPhone(raw: unknown): string | null {
  let d = digits(raw);
  if (d.startsWith('255') && d.length === 12) d = `0${d.slice(3)}`;
  if (/^0\d{9}$/.test(d)) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  return d.length >= 9 ? d : null;
}

export function withOfficePhone(text: string, office?: OfficeContact | null): string {
  const phone = localPhone(office?.phone || office?.user?.phone);
  if (!phone) return text;
  const core = digits(phone).slice(-9);
  if (core && digits(text).includes(core)) return text;
  const line = `Simu ya ofisi: ${phone}`;
  const mark = text.lastIndexOf('Verified by Kentexa');
  if (mark >= 0) return `${text.slice(0, mark).replace(/\s*$/, '')}\n${line}\n\n${text.slice(mark)}`;
  return `${text.replace(/\s*$/, '')}\n${line}`;
}
