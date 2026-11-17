import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import MySeries from './MySeries';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() } }));
jest.mock('../../admin/components/Sidebar', () => () => null);

// Mfululizo wangu (#410 phase 5, owner 2026-11-17: "should be on").
test('not yet eligible: told what is needed, no create button', async () => {
  api.get.mockImplementation((url) => Promise.resolve({ data: url === '/series/my/status' ? { eligible: false, posts: 1, need: 3 } : [] }));
  await act(async () => { render(<MySeries onNavigate={jest.fn()} isLoggedIn />); });
  expect(screen.getByTestId('my-series-not-yet')).toHaveTextContent('umechapisha 1');
  expect(screen.queryByTestId('my-series-create')).toBeNull();
});

test('an eligible writer creates a series and edits it with the creator routes', async () => {
  api.get.mockImplementation((url) => Promise.resolve({ data:
    url === '/series/my/status' ? { eligible: true, posts: 5, need: 3 }
      : url === '/series/my/all' ? []
        : url === '/series/my/31' ? { id: 31, title: 'Biashara Ndogo', status: 'draft', topics: [], episodeList: [], path: '/series/31' } : [] }));
  api.post.mockImplementation((url) => Promise.resolve({ data: url === '/series/my' ? { id: 31 } : { id: 31, title: 'Biashara Ndogo', status: 'draft', topics: [], episodeList: [] } }));
  await act(async () => { render(<MySeries onNavigate={jest.fn()} isLoggedIn />); });
  fireEvent.change(screen.getByTestId('my-series-title'), { target: { value: 'Biashara Ndogo' } });
  await act(async () => { fireEvent.click(screen.getByTestId('my-series-create')); });
  expect(api.post).toHaveBeenCalledWith('/series/my', { title: 'Biashara Ndogo' });
  expect(api.get).toHaveBeenCalledWith('/series/my/31');
  fireEvent.change(screen.getByTestId('series-add-post'), { target: { value: 'kentexa.com/post/5' } });
  await act(async () => { fireEvent.click(screen.getByTestId('series-add')); });
  expect(api.post).toHaveBeenCalledWith('/series/my/31/episodes', { post: 'kentexa.com/post/5', title: undefined });
});
