import React from 'react';
import { render, screen } from '@testing-library/react';
import { Spinner, PageLoading, SkeletonGrid } from './Loading';

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{23F3}\u{231B}]/u;

test('loading states are drawn, never an emoji', () => {
  const { container } = render(<><PageLoading label="Inapakia bidhaa" /><SkeletonGrid count={3} /><Spinner label="Inatuma" /></>);
  expect(screen.getByTestId('page-loading')).toHaveTextContent('Inapakia bidhaa');
  expect(screen.getByRole('status', { name: 'Inatuma' })).toBeInTheDocument();
  expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2);
  expect(EMOJI.test(container.textContent)).toBe(false);
});
