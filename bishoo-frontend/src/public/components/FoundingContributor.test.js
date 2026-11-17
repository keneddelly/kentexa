import React from 'react';
import { act, render, screen } from '@testing-library/react';
import FoundingContributor from './FoundingContributor';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

test('shows the label only when the person has it, and never says verified', async () => {
  api.get.mockResolvedValue({ data: { founding: true } });
  await act(async () => { render(<FoundingContributor ownerUserId={5} />); });
  expect(api.get).toHaveBeenCalledWith('/writer-outreach/founding/5');
  expect(screen.getByTestId('founding-contributor')).toHaveTextContent('Mchangiaji Mwanzilishi');
  expect(screen.getByTestId('founding-contributor').textContent).not.toMatch(/verified|thibitish/i);
});

test('nothing when the person does not have it', async () => {
  api.get.mockResolvedValue({ data: { founding: false } });
  await act(async () => { render(<FoundingContributor ownerUserId={6} />); });
  expect(screen.queryByTestId('founding-contributor')).toBeNull();
});
