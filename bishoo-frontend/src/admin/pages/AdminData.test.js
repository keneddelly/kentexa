import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminData, { PAGE_DATASET } from './AdminData';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

// Owner 2026-11-09: every kind of KenteXa data reachable from the admin.
test('a reported Moment: who wrote it, who reported it; hide it', async () => {
  api.get.mockResolvedValue({ data: { key: 'reports', title: 'Moments zilizoripotiwa', rows: [
    { id: 5, postId: 9, postTitle: 'Simu bei nafuu', authorId: 40, authorName: 'Baraka', reporterId: 41, reporterName: 'Asha', reason: 'spam', status: 'open', createdAt: '2026-11-09T08:00:00Z' },
  ] } });
  api.post.mockResolvedValue({ data: { decision: 'hide' } });
  const onNavigate = jest.fn();
  render(<AdminData dataset={PAGE_DATASET.AdminReports} activePage="AdminReports" onNavigate={onNavigate} onLogout={jest.fn()} />);
  expect(await screen.findByTestId('row-5')).toHaveTextContent('Simu bei nafuu');
  fireEvent.click(screen.getByText('Asha'));
  expect(onNavigate).toHaveBeenCalledWith('AdminPerson', { userId: 41 });
  fireEvent.click(screen.getByTestId('hide-5'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin-intelligence/reports/5/review', { decision: 'hide' }));
});

test('words filter the list on the server', async () => {
  api.get.mockResolvedValue({ data: { key: 'office_prices', title: 'Bei za ofisi', rows: [
    { id: 1, officeName: 'Ar SAMATTA', originCity: 'Dar es Salaam', destinationCity: 'Arusha', ratePerKg: 1500, minimumCharge: 10000, estimatedDays: 2, isActive: true },
  ] } });
  render(<AdminData dataset="office_prices" activePage="AdminOfficePrices" onNavigate={jest.fn()} onLogout={jest.fn()} />);
  expect(await screen.findByTestId('row-1')).toHaveTextContent('TZS 10,000');
  fireEvent.change(screen.getByLabelText('Tafuta'), { target: { value: 'Arusha' } });
  await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/admin-intelligence/data/office_prices', { params: { q: 'Arusha' } }));
});
