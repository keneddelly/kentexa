import React from 'react';
import { render, screen } from '@testing-library/react';
import ClassifiedDetail from './ClassifiedDetail';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), defaults: { baseURL: '' } } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));
jest.mock('../components/WishlistHeart', () => () => null);
jest.mock('../components/CommerceCommentSection', () => () => null);

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{23F3}\u{231B}]/u;

beforeEach(() => {
  api.get.mockImplementation((url) => {
    if (url === '/classifieds/4') return Promise.resolve({ data: {
      id: 4, title: 'Sofa ya watu watatu', price: 850000, status: 'active', location: 'Mwanza', category: 'home_garden',
      images: [], createdAt: '2026-10-20T10:00:00Z', seller: { id: 9, name: 'Asha', role: 'buyer' },
    } });
    if (url === '/classifieds/4/contact') return Promise.resolve({ data: { sellerName: 'Asha', sellerPhone: '255713000000' } });
    return Promise.resolve({ data: [] });
  });
});

test('listing page: price, who sells it with contact straight away, no emoji', async () => {
  const { container } = render(<ClassifiedDetail classifiedId={4} onNavigate={jest.fn()} isLoggedIn currentUser={{ id: 1 }} />);
  expect(await screen.findByTestId('cd-price')).toHaveTextContent('TZS 850,000');
  const seller = screen.getByTestId('cd-seller');
  expect(seller).toHaveTextContent('Asha');
  expect(seller).toHaveTextContent('Muuzaji binafsi');
  expect(await screen.findByText('Piga simu · 255713000000')).toBeInTheDocument();
  expect(EMOJI.test(container.textContent)).toBe(false);
});
