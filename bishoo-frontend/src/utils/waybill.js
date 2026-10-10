// Waybill numbers (step 2) — same rules as the backend's src/shipments/waybill.ts.
// Stored form KTX + 10 digits (9 random + 1 check digit), printed "KTX 4829 1037 52".

const WAYBILL_PATTERN = /^KTX\d{10}$/;

export const luhnCheckDigit = (body) => {
  let total = 0;
  let double = true;
  for (let i = body.length - 1; i >= 0; i--) {
    let digit = Number(body[i]);
    if (double) { digit *= 2; if (digit > 9) digit -= 9; }
    total += digit;
    double = !double;
  }
  return (10 - (total % 10)) % 10;
};

// What a person typed -> the stored waybill, or null if it is not one.
export const normalizeWaybill = (raw) => {
  if (typeof raw !== 'string') return null;
  let value = raw.toUpperCase().replace(/[\s-]/g, '');
  if (/^\d{10}$/.test(value)) value = 'KTX' + value;
  if (!WAYBILL_PATTERN.test(value)) return null;
  const digits = value.slice(3);
  return luhnCheckDigit(digits.slice(0, 9)) === Number(digits[9]) ? value : null;
};

export const formatWaybill = (value) => {
  if (!value || !WAYBILL_PATTERN.test(value)) return value || '';
  return `KTX ${value.slice(3, 7)} ${value.slice(7, 11)} ${value.slice(11)}`;
};
