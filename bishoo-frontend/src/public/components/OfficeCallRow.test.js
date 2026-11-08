import React from 'react';
import { render, screen } from '@testing-library/react';
import OfficeCallRow from './OfficeCallRow';
import { officeOffers } from '../pages/SendShipment';

test('each office offer carries its phone and distance, with "Piga ofisi" (owner 2026-11-09: offices compete)', () => {
  const [o] = officeOffers([{ serviceType: 'office', name: 'Ar SAMATTA', price: null,
    fulfillment: { officeOption: { officeId: 7, officeCity: 'Dar es Salaam', phone: '0755 111 222', distanceKm: 1.4 } } }]);
  expect(o).toMatchObject({ officeId: 7, phone: '0755 111 222', distanceKm: 1.4 });
  render(<OfficeCallRow testId="row" phone={o.phone} distanceKm={o.distanceKm} />);
  expect(screen.getByTestId('row')).toHaveTextContent('km 1.4 kutoka kwako');
  expect(screen.getByText('Piga ofisi').closest('a')).toHaveAttribute('href', 'tel:0755111222');
});
