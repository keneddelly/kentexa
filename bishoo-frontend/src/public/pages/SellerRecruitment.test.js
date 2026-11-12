import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import SellerRecruitment from './SellerRecruitment';

const mockNavigate = jest.fn();
jest.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'sw', resolvedLanguage: 'sw' } }) }));

test('seller landing explains seller value and sends CTA into existing seller application', () => {
  render(<SellerRecruitment onNavigate={mockNavigate} />);
  expect(screen.getByRole('heading', { name: /Fungua soko lako/i })).toBeInTheDocument();
  expect(screen.getByText(/Kentexa haitunzi fedha/i)).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('seller-start'));
  expect(mockNavigate).toHaveBeenCalledWith('BecomeSeller');
});
