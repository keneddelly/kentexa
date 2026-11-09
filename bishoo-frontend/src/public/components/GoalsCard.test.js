import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import GoalsCard from './GoalsCard';

// Owner 2026-11-09: Kazi lists what the person said they want to do and has not finished.
test('shows unfinished goals; each opens its form; Ficha hides it', () => {
  localStorage.removeItem('kentexa_goals_hidden');
  const onNavigate = jest.fn();
  const { rerender } = render(<GoalsCard currentUser={{ onboardingState: { goals: ['buy', 'sell', 'office'] } }}
    roleOptions={[{ roleType: 'seller', status: 'active' }]} businesses={[]} onNavigate={onNavigate} />);
  expect(screen.queryByTestId('goal-sell')).toBeNull();
  expect(screen.queryByTestId('goal-buy')).toBeNull();
  fireEvent.click(screen.getByTestId('goal-office'));
  expect(onNavigate).toHaveBeenCalledWith('BecomeSuperAgentInfo');
  fireEvent.click(screen.getByText('Ficha'));
  expect(screen.queryByTestId('goals-card')).toBeNull();
  localStorage.removeItem('kentexa_goals_hidden');
  rerender(<GoalsCard currentUser={{ onboardingState: { goals: ['buy'] } }} roleOptions={[]} businesses={[]} onNavigate={onNavigate} />);
  expect(screen.queryByTestId('goals-card')).toBeNull();
});
