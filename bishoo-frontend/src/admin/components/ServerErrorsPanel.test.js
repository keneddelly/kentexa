import React from 'react';
import { render, screen } from '@testing-library/react';
import ServerErrorsPanel from './ServerErrorsPanel';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

test('lists server errors by feature and says when there are none', async () => {
  api.get.mockResolvedValueOnce({ data: { totalErrors: 3, groups: [
    { feature: 'feed', route: '/feed/moments', method: 'POST', count: 3, firstSeen: '2026-11-28T09:00:00Z',
      lastSeen: '2026-11-28T10:00:00Z', sampleMessage: 'column "topicSuggestions" does not exist' },
  ] } });
  render(<ServerErrorsPanel />);
  expect(await screen.findByTestId('server-errors')).toHaveTextContent('Makosa ya seva: 3');
  expect(screen.getByText('feed')).toBeInTheDocument();
  expect(screen.getByText(/topicSuggestions/)).toBeInTheDocument();
});

test('says so when there are no errors', async () => {
  api.get.mockResolvedValueOnce({ data: { totalErrors: 0, groups: [] } });
  render(<ServerErrorsPanel />);
  expect(await screen.findByTestId('errors-none')).toBeInTheDocument();
});
