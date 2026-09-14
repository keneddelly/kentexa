export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGES_PER_UPLOAD = 5;
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
]);
const SUPPORTED_IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/i;

const blank = value => value === undefined || value === null || String(value).trim() === '';

export const normalizeListingError = (error, fallback) => {
  const data = error?.response?.data;
  const flatten = (value) => {
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    if (Array.isArray(value)) return value.flatMap(flatten);
    if (value && typeof value === 'object') return Object.values(value).flatMap(flatten);
    return [];
  };
  const messages = flatten(data?.message ?? data?.errors ?? data?.error);
  if (messages.length) return [...new Set(messages)].join('; ');
  return fallback;
};

export const emptyLocation = () => ({
  regionId: null, regionName: '', districtId: null, districtName: '', wardId: null, wardName: '',
});

export const locationFromText = (value) => {
  const parts = String(value || '').split(',').map(part => part.trim()).filter(Boolean);
  if (!parts.length) return emptyLocation();
  if (parts.length === 1) return { ...emptyLocation(), regionName: parts[0] };
  if (parts.length === 2) return { ...emptyLocation(), districtName: parts[0], regionName: parts[1] };
  return { ...emptyLocation(), wardName: parts.slice(0, -2).join(', '), districtName: parts.at(-2), regionName: parts.at(-1) };
};

export const validateImageSelection = (files, remainingSlots) => {
  if (!files.length) return null;
  if (files.length > remainingSlots) return 'too_many_total';
  if (files.length > MAX_IMAGES_PER_UPLOAD) return 'too_many_per_upload';
  if (files.some(file =>
    !SUPPORTED_IMAGE_MIME_TYPES.has(String(file.type || '').toLowerCase())
    || !SUPPORTED_IMAGE_EXTENSIONS.test(String(file.name || ''))
  )) return 'unsupported_type';
  if (files.some(file => file.size > MAX_IMAGE_BYTES)) return 'file_too_large';
  return null;
};

const validateImageCount = (imageCount, minImages, maxImages) => {
  if (imageCount < minImages) return { code: 'min_images_required', count: minImages };
  if (Number.isFinite(maxImages) && imageCount > maxImages) return { code: 'too_many_total', count: maxImages };
  return null;
};

const invalidOptionalNumber = (value, { integer = false, min = 0 } = {}) => {
  if (blank(value)) return false;
  const number = Number(value);
  return !Number.isFinite(number) || number < min || (integer && !Number.isInteger(number));
};

export const validateProductListing = ({ form, isDigital, imageCount, minImages, maxImages, requiredAttributes = [] }) => {
  if (!form.name?.trim()) return { code: 'name_required' };
  const price = Number(form.basePrice);
  if (!Number.isFinite(price) || price < 1) return { code: 'positive_price_required' };
  if (!form.category) return { code: 'category_required' };
  if (!isDigital) {
    const stock = Number(form.stock);
    if (!Number.isInteger(stock) || stock < 0) return { code: 'valid_stock_required' };
  }
  const imageError = validateImageCount(imageCount, minImages, maxImages);
  if (imageError) return imageError;
  if (invalidOptionalNumber(form.deliveryFee) || invalidOptionalNumber(form.bodaFee)
    || invalidOptionalNumber(form.weightKg) || invalidOptionalNumber(form.costPrice)
    || invalidOptionalNumber(form.minStockThreshold, { integer: true })) return { code: 'valid_optional_number_required' };
  const missing = requiredAttributes.filter(attr => !String(form.specs?.[attr.key] || '').trim());
  if (missing.length) return { code: 'required_fields_missing', fields: missing.map(attr => attr.label) };
  return null;
};

export const validateClassifiedListing = ({ form, imageCount, minImages, maxImages, requiredAttributes = [] }) => {
  if (!form.title?.trim()) return { code: 'title_required' };
  if (!form.description?.trim()) return { code: 'description_required' };
  const price = Number(form.price);
  if (!Number.isFinite(price) || price < 1) return { code: 'positive_price_required' };
  if (!form.category) return { code: 'category_required' };
  const imageError = validateImageCount(imageCount, minImages, maxImages);
  if (imageError) return imageError;
  const missing = requiredAttributes.filter(attr => !String(form.specs?.[attr.key] || '').trim());
  if (missing.length) return { code: 'required_fields_missing', fields: missing.map(attr => attr.label) };
  if (form.isFlashSale) {
    const flashPrice = Number(form.flashSalePrice);
    const quantity = Number(form.flashSaleQuantity);
    if (!Number.isFinite(flashPrice) || flashPrice <= 0 || flashPrice >= price) return { code: 'valid_flash_price_required' };
    const flashEnd = new Date(form.flashSaleEndsAt);
    if (!form.flashSaleEndsAt || Number.isNaN(flashEnd.getTime()) || flashEnd <= new Date()) return { code: 'valid_flash_end_required' };
    if (!Number.isInteger(quantity) || quantity <= 0) return { code: 'valid_flash_quantity_required' };
  }
  return null;
};

export const createSubmissionLock = () => ({ current: false });

export const runOnce = async (lock, task) => {
  if (lock.current) return { skipped: true };
  lock.current = true;
  try {
    return { skipped: false, value: await task() };
  } finally {
    lock.current = false;
  }
};
