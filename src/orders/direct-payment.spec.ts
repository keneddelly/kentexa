import {
  directPaymentOptions, isDirectPaymentOrder, isSameRegion, marketplacePaymentMode,
  normalizeLipaNamba, normalizeLipaNambaName,
} from './direct-payment';

describe('MARKETPLACE_PAYMENT_MODE', () => {
  it('defaults to cod_lipa; only the exact word "online" brings the old process back', () => {
    expect(marketplacePaymentMode({})).toBe('cod_lipa');
    expect(marketplacePaymentMode({ MARKETPLACE_PAYMENT_MODE: '' })).toBe('cod_lipa');
    expect(marketplacePaymentMode({ MARKETPLACE_PAYMENT_MODE: 'cod_lipa' })).toBe('cod_lipa');
    expect(marketplacePaymentMode({ MARKETPLACE_PAYMENT_MODE: 'something' })).toBe('cod_lipa');
    expect(marketplacePaymentMode({ MARKETPLACE_PAYMENT_MODE: ' Online ' })).toBe('online');
  });

  it('only orders stamped cod_lipa are direct payments; old orders (NULL) are not', () => {
    expect(isDirectPaymentOrder({ paymentMode: 'cod_lipa' })).toBe(true);
    expect(isDirectPaymentOrder({ paymentMode: null })).toBe(false);
    expect(isDirectPaymentOrder({})).toBe(false);
    expect(isDirectPaymentOrder(null)).toBe(false);
  });
});

describe('ways to pay in cod_lipa mode', () => {
  const base = { sameCity: true, codEnabled: true, digital: false, sellerHasLipaNamba: true };
  it('same city: COD and Lipa Namba', () => {
    expect(directPaymentOptions(base)).toEqual(['cod', 'lipa_namba']);
  });
  it('other city: Lipa Namba only, never COD', () => {
    expect(directPaymentOptions({ ...base, sameCity: false })).toEqual(['lipa_namba']);
  });
  it('COD stays the seller\'s own per-product choice', () => {
    expect(directPaymentOptions({ ...base, codEnabled: false })).toEqual(['lipa_namba']);
  });
  it('no Lipa Namba on the seller: no Lipa Namba option', () => {
    expect(directPaymentOptions({ ...base, sellerHasLipaNamba: false })).toEqual(['cod']);
    expect(directPaymentOptions({ ...base, sameCity: false, sellerHasLipaNamba: false })).toEqual([]);
  });
  it('digital products: nothing to pay on delivery', () => {
    expect(directPaymentOptions({ ...base, digital: true })).toEqual(['lipa_namba']);
  });
});

describe('same city = same region', () => {
  it('by region id when both are known', () => {
    expect(isSameRegion({ regionId: 2 }, { regionId: 2, regionName: 'Arusha' })).toBe(true);
    expect(isSameRegion({ regionId: 2, regionName: 'Dar es Salaam' }, { regionId: 3, regionName: 'Dar es Salaam' })).toBe(false);
  });
  it('by name otherwise, ignoring case, spaces and a trailing "Region"', () => {
    expect(isSameRegion({ regionName: 'Dar es Salaam' }, { regionName: ' dar es  salaam region ' })).toBe(true);
    expect(isSameRegion({ regionId: 5, regionName: 'Arusha' }, { regionName: 'Mbeya' })).toBe(false);
  });
  it('unknown on either side is NOT the same city (no COD on a guess)', () => {
    expect(isSameRegion({}, { regionId: 2, regionName: 'Arusha' })).toBe(false);
    expect(isSameRegion({ regionId: 2 }, {})).toBe(false);
    expect(isSameRegion({ regionName: '' }, { regionName: '' })).toBe(false);
  });
});

describe('Lipa Namba input', () => {
  it('keeps 5-15 digits, allows spaces and dashes', () => {
    expect(normalizeLipaNamba('123 456 78')).toBe('12345678');
    expect(normalizeLipaNamba('5577-1234')).toBe('55771234');
    expect(normalizeLipaNamba('1234')).toBeNull();
    expect(normalizeLipaNamba('12345abc')).toBeNull();
    expect(normalizeLipaNamba(null)).toBeNull();
  });
  it('registered name: 2-100 characters, spaces tidied', () => {
    expect(normalizeLipaNambaName('  Juma   Shop ')).toBe('Juma Shop');
    expect(normalizeLipaNambaName('J')).toBeNull();
    expect(normalizeLipaNambaName('x'.repeat(101))).toBeNull();
  });
});
