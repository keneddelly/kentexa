import {
  MAX_IMAGE_BYTES,
  createSubmissionLock,
  runOnce,
  validateClassifiedListing,
  validateImageSelection,
  validateProductListing,
  normalizeListingError,
  emptyLocation,
  locationFromText,
} from './listingForm';

const product = { name: 'Camera', basePrice: '1000', stock: '0', category: 'electronics', specs: {} };
const classified = { title: 'Used camera', description: 'Works well', price: '500', category: 'electronics', location: 'Dar es Salaam', specs: {} };

test('validates required fields and positive listing prices', () => {
  expect(validateProductListing({ form: { ...product, name: ' ' }, isDigital: false, imageCount: 2, minImages: 2 })).toEqual({ code: 'name_required' });
  expect(validateProductListing({ form: { ...product, basePrice: '0' }, isDigital: false, imageCount: 2, minImages: 2 })).toEqual({ code: 'positive_price_required' });
  expect(validateProductListing({ form: { ...product, stock: '-1' }, isDigital: false, imageCount: 2, minImages: 2 })).toEqual({ code: 'valid_stock_required' });
  expect(validateClassifiedListing({ form: { ...classified, description: '' }, imageCount: 2, minImages: 2 })).toEqual({ code: 'description_required' });
  expect(validateClassifiedListing({ form: { ...classified, price: '-5' }, imageCount: 2, minImages: 2 })).toEqual({ code: 'positive_price_required' });
  expect(validateClassifiedListing({ form: { ...classified, price: '0.5' }, imageCount: 2, minImages: 2 })).toEqual({ code: 'positive_price_required' });
  expect(validateClassifiedListing({ form: { ...classified, location: ' ' }, imageCount: 2, minImages: 2 })).toBeNull();
});

test('validates flash-sale details', () => {
  expect(validateClassifiedListing({
    form: { ...classified, isFlashSale: true, flashSalePrice: '500', flashSaleEndsAt: 'not-a-date', flashSaleQuantity: '1' },
    imageCount: 2,
    minImages: 2,
  })).toEqual({ code: 'valid_flash_price_required' });
  expect(validateClassifiedListing({
    form: { ...classified, isFlashSale: true, flashSalePrice: '400', flashSaleEndsAt: 'not-a-date', flashSaleQuantity: '1' },
    imageCount: 2,
    minImages: 2,
  })).toEqual({ code: 'valid_flash_end_required' });
});
test('accepts a valid product and classified submission', () => {
  expect(validateProductListing({ form: product, isDigital: false, imageCount: 2, minImages: 2 })).toBeNull();
  expect(validateClassifiedListing({ form: classified, imageCount: 2, minImages: 2 })).toBeNull();
});

test('validates required category attributes and images', () => {
  const attrs = [{ key: 'make', label: 'Make' }];
  expect(validateProductListing({ form: product, isDigital: false, imageCount: 1, minImages: 2 })).toEqual({ code: 'min_images_required', count: 2 });
  expect(validateClassifiedListing({ form: classified, imageCount: 2, minImages: 2, requiredAttributes: attrs })).toEqual({ code: 'required_fields_missing', fields: ['Make'] });
});

test('enforces image minimum and maximum for physical, digital, and classified listings', () => {
  expect(validateProductListing({ form: { ...product, productType: 'digital' }, isDigital: true, imageCount: 0, minImages: 1, maxImages: 5 })).toEqual({ code: 'min_images_required', count: 1 });
  expect(validateProductListing({ form: product, isDigital: false, imageCount: 5, minImages: 2, maxImages: 4 })).toEqual({ code: 'too_many_total', count: 4 });
  expect(validateClassifiedListing({ form: classified, imageCount: 11, minImages: 2, maxImages: 10 })).toEqual({ code: 'too_many_total', count: 10 });
});

test('rejects malformed optional product numbers', () => {
  expect(validateProductListing({ form: { ...product, deliveryFee: 'abc' }, isDigital: false, imageCount: 2, minImages: 2 })).toEqual({ code: 'valid_optional_number_required' });
  expect(validateProductListing({ form: { ...product, minStockThreshold: '1.5' }, isDigital: false, imageCount: 2, minImages: 2 })).toEqual({ code: 'valid_optional_number_required' });
});

test('normalizes API validation arrays and restores string-only locations', () => {
  expect(normalizeListingError({ response: { data: { message: ['price must not be less than 1', 'images must contain valid URLs'] } } }, 'failed'))
    .toBe('price must not be less than 1; images must contain valid URLs');
  expect(normalizeListingError({}, 'failed')).toBe('failed');
  expect(normalizeListingError({ response: { data: { errors: { price: ['must be positive'], images: { 0: 'invalid URL' } } } } }, 'failed'))
    .toBe('must be positive; invalid URL');
  expect(locationFromText('Kariakoo, Ilala, Dar es Salaam')).toEqual({
    ...emptyLocation(), wardName: 'Kariakoo', districtName: 'Ilala', regionName: 'Dar es Salaam',
  });
  expect(locationFromText('')).toEqual(emptyLocation());
});

test('requires every enabled flash-sale field to be valid', () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  expect(validateClassifiedListing({ form: { ...classified, isFlashSale: true, flashSalePrice: '', flashSaleEndsAt: future, flashSaleQuantity: '1' }, imageCount: 2, minImages: 2 }))
    .toEqual({ code: 'valid_flash_price_required' });
  expect(validateClassifiedListing({ form: { ...classified, isFlashSale: true, flashSalePrice: '400', flashSaleEndsAt: future, flashSaleQuantity: '0' }, imageCount: 2, minImages: 2 }))
    .toEqual({ code: 'valid_flash_quantity_required' });
});

test('rejects unsupported, oversized, and oversized batches before upload', () => {
  expect(validateImageSelection([{ name: 'notes.txt', type: 'text/plain', size: 10 }], 5)).toBe('unsupported_type');
  expect(validateImageSelection([{ name: 'vector.svg', type: 'image/svg+xml', size: 10 }], 5)).toBe('unsupported_type');
  expect(validateImageSelection([{ name: 'photo.jpg', type: 'image/jpeg', size: MAX_IMAGE_BYTES + 1 }], 5)).toBe('file_too_large');
  expect(validateImageSelection(Array.from({ length: 6 }, (_, i) => ({ name: `${i}.jpg`, type: 'image/jpeg', size: 10 })), 10)).toBe('too_many_per_upload');
  expect(validateImageSelection([{ name: 'one.jpg', type: 'image/jpeg', size: 10 }], 5)).toBeNull();
  expect(validateImageSelection(Array.from({ length: 5 }, (_, i) => ({ name: `${i}.webp`, type: 'image/webp', size: 10 })), 5)).toBeNull();
});

test('prevents duplicate submission and unlocks after API failure', async () => {
  const lock = createSubmissionLock();
  let release;
  const request = jest.fn(() => new Promise(resolve => { release = resolve; }));
  const first = runOnce(lock, request);
  await expect(runOnce(lock, request)).resolves.toEqual({ skipped: true });
  expect(request).toHaveBeenCalledTimes(1);
  release('created');
  await expect(first).resolves.toEqual({ skipped: false, value: 'created' });
  await expect(runOnce(lock, () => Promise.reject(new Error('API failed')))).rejects.toThrow('API failed');
  await expect(runOnce(lock, () => Promise.resolve('retry'))).resolves.toEqual({ skipped: false, value: 'retry' });
});
