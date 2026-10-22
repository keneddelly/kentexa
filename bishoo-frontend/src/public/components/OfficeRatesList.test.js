import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import OfficeRatesList from './OfficeRatesList';

// The BEI tab used to read perKgFee / baseShippingFee (admin route fields), so every
// office rate showed TZS 0. It now shows the office's own rate fields.
const rates = [
  { destinationCity: 'Mwanza', ratePerKg: 3000, minimumCharge: 4000, estimatedDays: 2 },
  { destinationCity: 'Arusha', ratePerKg: 2500, minimumCharge: 3500, estimatedDays: 1 },
];

test('an office with rates sees its real amounts, not TZS 0', () => {
  render(<OfficeRatesList rates={rates} onEdit={jest.fn()} />);
  for (const s of ['Mwanza', 'TZS 3,000', 'TZS 4,000', 'Arusha', 'TZS 2,500', 'TZS 3,500']) expect(screen.getByText(s)).toBeTruthy();
  expect(screen.queryByText('TZS 0')).toBeNull();
});

test('no rates: the empty note and a button to set them', () => {
  const onEdit = jest.fn();
  render(<OfficeRatesList rates={[]} onEdit={onEdit} />);
  fireEvent.click(screen.getByText('+ Weka Bei Zangu'));
  expect(onEdit).toHaveBeenCalled();
});
