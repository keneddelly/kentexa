import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SellerClassifieds from './SellerClassifieds';
import api from '../../api/api';
jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('../components/BackBar', () => () => null);
jest.mock('../components/LocationPicker', () => () => null);
const categories = [
  { key: 'general', label: 'General', subcategories: [{ key: 'other', label: 'Other', attributes: [] }] },
  { key: 'electronics', label: 'Electronics', subcategories: [{ key: 'phones', label: 'Phones', attributes: [
    { key: 'condition', label: 'Condition', type: 'select', allowedValues: ['New','Used','Fair'] },
    { key: 'battery', label: 'Battery', type: 'number' },
  ] }] },
  { key: 'food', label: 'Food', subcategories: [{ key: 'fresh_food', label: 'Fresh Food', attributes: [{ key: 'weight', label: 'Weight', type: 'number' }] }] },
];
test('one condition for goods, none for meat; changing category clears stale condition and hides optional questions', async () => {
  api.get.mockImplementation(url => Promise.resolve({ data: url === '/categories' ? categories : {} }));
  const { container } = render(<SellerClassifieds createOnly isLoggedIn onNavigate={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('Electronics')).toBeInTheDocument());
  const category = Array.from(container.querySelectorAll('select')).find(s => s.value === 'general');
  fireEvent.change(category, { target: { value: 'electronics' } });
  expect(screen.getAllByText('Condition')).toHaveLength(1);
  expect(screen.queryByText('Battery')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('listing_form.optional_details'));
  expect(screen.getByText('Battery')).toBeInTheDocument();
  fireEvent.change(screen.getByText('Fair').closest('select'), { target: { value: 'Fair' } });
  fireEvent.change(category, { target: { value: 'food' } });
  expect(screen.queryByText('Condition')).not.toBeInTheDocument();
  expect(screen.queryByText('Weight')).not.toBeInTheDocument();
  fireEvent.change(category, { target: { value: 'electronics' } });
  expect(screen.getByText('Fair').closest('select').value).toBe('');
});
