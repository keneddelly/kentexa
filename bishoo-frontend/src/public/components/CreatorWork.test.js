import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import CreatorWork from './CreatorWork';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

// Personal brand page (owner approved 2026-11-18).
const feed = [
  { id: 1, intent: 'article', title: 'Kwa nini biashara hazipati faida', body: 'Maneno '.repeat(400), createdAt: '2026-11-15', views: 3100 },
  { id: 2, intent: 'discussion', title: 'Swali', body: 'Habari', createdAt: '2026-11-16' },
  { id: 3, intent: 'article', title: 'Lipa Namba: faida na hatari', body: 'Maneno', createdAt: '2026-11-17', views: 40 },
];

beforeEach(() => {
  api.get.mockImplementation((url) => Promise.resolve({ data: url === '/feed/1' ? feed[0] : url === '/series' ? [{ id: 9, title: 'Fedha za duka', episodes: 5 }] : [] }));
});

test('shows the pinned post, the series and only the Makala, newest first', async () => {
  const nav = jest.fn();
  await act(async () => {
    render(<CreatorWork profileId={7} pinnedPostId={1} feed={feed} onNavigate={nav} renderPost={(p) => <div data-testid="pinned-card">{p.title}</div>} />);
  });
  expect(screen.getByTestId('pinned-card')).toHaveTextContent('Kwa nini biashara');
  expect(api.get).toHaveBeenCalledWith('/series', { params: { profileId: 7 } });
  expect(screen.getByText('Fedha za duka')).toBeInTheDocument();
  const rows = screen.getAllByTestId('creator-article');
  expect(rows).toHaveLength(1); // the pinned Makala is not repeated; the discussion is not a Makala
  expect(rows[0]).toHaveTextContent('Lipa Namba');
  fireEvent.click(rows[0]);
  expect(nav).toHaveBeenCalledWith('PostDetail-3');
});

test('the owner gets "Panga ukurasa"', async () => {
  const onManage = jest.fn();
  await act(async () => { render(<CreatorWork profileId={7} feed={[]} onNavigate={jest.fn()} renderPost={() => null} isOwn onManage={onManage} />); });
  fireEvent.click(screen.getByTestId('creator-manage'));
  expect(onManage).toHaveBeenCalled();
});
