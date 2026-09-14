import { validate } from 'class-validator';
import { CreateClassifiedDto } from './create-classified.dto';
import { updateClassifiedDto } from './update-classified.dto';
import { CreateProductDto } from '../../products/dto/create-product.dto';

describe('listing DTO validation', () => {
  it('rejects blank required classified fields and non-positive prices', async () => {
    const dto = Object.assign(new CreateClassifiedDto(), {
      title: ' ',
      description: 'Useful item',
      price: 0,
      category: 'general',
      location: ' ',
    });

    const properties = (await validate(dto)).map((error) => error.property);
    expect(properties).toEqual(expect.arrayContaining(['title', 'price']));
    expect(properties).not.toContain('location');
  });

  it('accepts flash-sale fields on a partial classified update', async () => {
    const dto = Object.assign(new updateClassifiedDto(), {
      isFlashSale: true,
      flashSalePrice: 400,
      flashSaleEndsAt: '2030-01-01T12:00:00.000Z',
      flashSaleQuantity: 2,
    });

    expect(await validate(dto)).toEqual([]);
  });

  it('rejects a blank product name and zero product price', async () => {
    const dto = Object.assign(new CreateProductDto(), {
      name: ' ',
      basePrice: 0,
      stock: 0,
    });

    const properties = (await validate(dto)).map((error) => error.property);
    expect(properties).toEqual(expect.arrayContaining(['name', 'basePrice']));
  });

  it('preserves optional classified location and rejects malformed image values', async () => {
    const dto = Object.assign(new CreateClassifiedDto(), {
      title: 'Used camera',
      description: 'Works well',
      price: 500,
      category: 'general',
      images: ['not-a-url'],
    });
    const properties = (await validate(dto)).map((error) => error.property);
    expect(properties).toContain('images');
    expect(properties).not.toContain('location');
  });

  it('accepts TZS 1 and rejects sub-unit listing prices', async () => {
    const valid = Object.assign(new CreateProductDto(), { name: 'Cable', basePrice: 1, stock: 0 });
    const invalid = Object.assign(new CreateProductDto(), { name: 'Cable', basePrice: 0.5, stock: 0 });
    expect((await validate(valid)).map(error => error.property)).not.toContain('basePrice');
    expect((await validate(invalid)).map(error => error.property)).toContain('basePrice');
  });

  it('rejects negative and fractional product stock', async () => {
    for (const stock of [-1, 1.5]) {
      const dto = Object.assign(new CreateProductDto(), { name: 'Cable', basePrice: 1, stock });
      expect((await validate(dto)).map(error => error.property)).toContain('stock');
    }
  });
});
