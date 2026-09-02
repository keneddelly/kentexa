import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ContextEpochBoundary from './ContextEpochBoundary';

const OperationalPage = () => {
  const [state, setState] = useState('clean');
  return <button onClick={() => setState('transport-state')}>{state}</button>;
};

test('a successful context epoch change discards old operational page state', () => {
  const view = render(<ContextEpochBoundary contextEpoch={1}><OperationalPage /></ContextEpochBoundary>);
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByRole('button')).toHaveTextContent('transport-state');
  view.rerender(<ContextEpochBoundary contextEpoch={2}><OperationalPage /></ContextEpochBoundary>);
  expect(screen.getByRole('button')).toHaveTextContent('clean');
});

test('the same epoch preserves account-wide parent state', () => {
  const Parent = ({ epoch }) => {
    const [language] = useState('sw');
    return <><span>{language}</span><ContextEpochBoundary contextEpoch={epoch}><OperationalPage /></ContextEpochBoundary></>;
  };
  const view = render(<Parent epoch={1} />);
  view.rerender(<Parent epoch={2} />);
  expect(screen.getByText('sw')).toBeInTheDocument();
});
