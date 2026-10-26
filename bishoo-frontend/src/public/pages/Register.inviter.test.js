import React from 'react';
import { render, screen } from '@testing-library/react';
import api from '../../api/api';
import Register from './Register';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const mockT = (k) => k;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT, i18n: { language: 'sw' } }) }));

beforeEach(() => { window.history.replaceState({}, '', '/?ref=K3F9A1'); });
afterEach(() => { window.history.replaceState({}, '', '/'); });

test("an advertiser's link: registration names who invited them", async () => {
  api.get.mockResolvedValue({ data: { kind: 'advertiser', name: 'Juma Matangazo' } });
  render(<Register onNavigate={jest.fn()} onLoginSuccess={jest.fn()} />);
  expect(await screen.findByText('Umealikwa na Juma Matangazo. Karibu KenteXa!')).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith('/advertisers/invite/K3F9A1');
});

test('an unknown code: a plain welcome, never "invited by an office"', async () => {
  api.get.mockResolvedValue({ data: { kind: null, name: null } });
  render(<Register onNavigate={jest.fn()} onLoginSuccess={jest.fn()} />);
  expect(await screen.findByText('Umealikwa kujiunga na KenteXa. Karibu!')).toBeInTheDocument();
});
