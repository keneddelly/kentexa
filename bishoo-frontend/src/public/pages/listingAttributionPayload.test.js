import fs from 'fs';
import path from 'path';

const source = (file) =>
  fs.readFileSync(path.join(__dirname, file), 'utf8');

const submitBlock = (text, start, end) => {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return text.slice(from, to);
};

describe('listing creation attribution payload contract', () => {
  it('Product create sends no client-selected commerceProfileId or workspaceId', () => {
    const block = submitBlock(
      source('SellerProducts.js'),
      'const payload = {',
      'resetForm(); fetchMyProducts();',
    );
    expect(block).toContain("api.post('/products', payload)");
    expect(block).not.toContain('commerceProfileId:');
    expect(block).not.toContain('workspaceId:');
  });

  it('Classified create sends no client-selected commerceProfileId or workspaceId', () => {
    const block = submitBlock(
      source('SellerClassifieds.js'),
      'const payload = {',
      'fetchMyClassifieds();',
    );
    expect(block).toContain("api.post('/classifieds', payload)");
    expect(block).not.toContain('commerceProfileId:');
    expect(block).not.toContain('workspaceId:');
  });

  it('existing Product and Classified edit endpoints still receive only their normal payloads', () => {
    const product = source('SellerProducts.js');
    const classified = source('SellerClassifieds.js');
    expect(product).toContain('api.patch(`/products/${editProduct.id}`, payload)');
    expect(classified).toContain('api.patch(`/classifieds/${editItem.id}`, payload)');
  });

  it.each(['SellerProducts.js', 'SellerClassifieds.js'])(
    '%s rejects partial uploads, resets the file input, and synchronizes removals',
    (file) => {
      const text = source(file);
      expect(text).toContain("if (urls.length !== files.length) throw new Error('Incomplete image upload')");
      expect(text).toContain("finally { setUploading(false); e.target.value = ''; }");
      expect(text).toContain('setImagePreviews(prev => prev.filter((_, idx) => idx !== i))');
      expect(text).toContain('images: prev.images.filter((_, idx) => idx !== i)');
      expect(text).toContain('disabled={uploading || saving}');
    },
  );

  it('keeps taxonomy suggestions bounded and restores the current availability property', () => {
    const product = source('SellerProducts.js');
    const classified = source('SellerClassifieds.js');
    expect(product).toContain('product.isAvailable ?? true');
    expect(product).toContain('CATEGORIES[res.data.category].subcategories[res.data.subcategory]');
    expect(classified).toContain('CATEGORIES[res.data.category].subcategories[res.data.subcategory]');
  });

  it.each(['SellerProducts.js', 'SellerClassifieds.js'])(
    '%s exposes saving state and confirms draft cancellation',
    (file) => {
      const text = source(file);
      expect(text).toContain('setSaving(true)');
      expect(text).toContain('setSaving(false)');
      expect(text).toContain('window.confirm');
      expect(text).toContain('listing_validation.discard_changes');
    },
  );
});
