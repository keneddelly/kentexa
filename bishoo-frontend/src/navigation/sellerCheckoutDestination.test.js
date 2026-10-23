import { DESTINATIONS, DESTINATION_KIND, destinationForPage } from './destinationRegistry';

test('the seller checkout link is a public, link-only destination', () => {
  expect(destinationForPage('SellerCheckout-eyJzIjo3fQ.zSkLJ7VO85X3bnH4r630')).toEqual(
    expect.objectContaining({ id: 'SellerCheckout', kind: DESTINATION_KIND.PUBLIC }),
  );
  expect(DESTINATIONS.SellerCheckout).toBeUndefined(); // not a navigable bare page
});

test('anything that is not a token shape is not a destination', () => {
  expect(destinationForPage('SellerCheckout')).toBeNull();
  expect(destinationForPage('SellerCheckout-abc')).toBeNull();
  expect(destinationForPage('SellerCheckout-a.b/c')).toBeNull();
});

test('the short seller link (?so=..., 2026-10-23) is the same public destination', () => {
  expect(destinationForPage('SellerCheckout-2.4d-4e.tz8x2o.1.1.AbCdEfGhIj-_KlMn')).toEqual(
    expect.objectContaining({ id: 'SellerCheckout', kind: DESTINATION_KIND.PUBLIC }),
  );
  // Region and district may be empty.
  expect(destinationForPage('SellerCheckout-2.4d.tz8x2o...AbCdEfGhIj-_KlMn')).toEqual(
    expect.objectContaining({ id: 'SellerCheckout' }),
  );
  expect(destinationForPage('SellerCheckout-2.4d.tz8x2o.1.1.short')).toBeNull();
});
