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
