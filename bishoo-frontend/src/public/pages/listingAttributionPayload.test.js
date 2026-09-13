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
      'resetForm(); fetchMyClassifieds();',
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
});
