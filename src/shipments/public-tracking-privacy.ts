/**
 * L5 (owner 2026-10-14): public tracking -- anyone holding a waybill or
 * tracking number, logged in or not -- never shows a person's name or phone.
 * Names become initials only ("Juma Ally Said" -> "J. A. S."); phones are
 * never part of a public tracking answer. The sender, the receiver and the
 * offices handling a parcel see full details on their own logged-in pages
 * (my shipments, receipts, office dashboards), not through these routes.
 */
export function publicInitials(name: string | null | undefined): string | null {
  const words = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (!words.length) return null;
  return words
    .slice(0, 3)
    .map((w) => `${(w.match(/[\p{L}\p{N}]/u) as RegExpMatchArray)[0].toUpperCase()}.`)
    .join(' ');
}
