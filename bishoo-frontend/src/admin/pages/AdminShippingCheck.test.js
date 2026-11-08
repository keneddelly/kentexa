import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AdminShippingCheck from './AdminShippingCheck';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn(async () => ({ data: [] })) } }));
jest.mock('../components/Sidebar', () => () => null);

test('"Kwa nini hakuna?" shows each agent and office with the reason (owner 2026-11-08)', async () => {
  api.post.mockResolvedValue({ data: {
    found: [], notes: ['Weka thamani ya mzigo'], radiusKm: { agent: 25, office: 30 },
    agents: [{ id: 1, name: 'Amimu', city: 'Dar es Salaam', ok: true, hasBase: false, reasons: [], note: 'Atapata kazi, lakini lazima aweke kituo chake kabla ya kukubali' }],
    offices: [{ id: 7, name: 'Arusha Matta', city: 'Dar es Salaam', ok: false, chargeMode: 'value', routes: [], reasons: ['Haijaweka mkoa wowote inaotuma ("Bei zangu")'] }],
  } });
  render(<AdminShippingCheck activePage="AdminShippingCheck" onNavigate={jest.fn()} onLogout={jest.fn()} />);
  fireEvent.click(screen.getByTestId('check-run'));
  expect(await screen.findByTestId('check-agent-1')).toHaveTextContent('lazima aweke kituo');
  expect(screen.getByTestId('check-office-7')).toHaveTextContent('Haijaweka mkoa wowote');
  expect(screen.getByTestId('check-found')).toHaveTextContent('hakuna kitu');
  expect(api.post).toHaveBeenCalledWith('/transport/service-offers/explain', expect.objectContaining({ fromCity: 'Dar es Salaam', pickup: 'door' }));
});
