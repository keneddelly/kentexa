import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import PageErrorBoundary from './PageErrorBoundary';
import SlowNetworkNotice from './SlowNetworkNotice';
import { reportClientError } from '../../utils/clientErrors';
import { startRequest, finishRequest, SLOW_MS, __resetSlowNetworkForTests } from '../../api/slowNetwork';

jest.mock('../../utils/clientErrors', () => {
  const actual = jest.requireActual('../../utils/clientErrors');
  return { ...actual, reportClientError: jest.fn() };
});

let boom = true;
const Broken = () => { if (boom) throw new Error('kuvunjika'); return <div>Ukurasa uko sawa</div>; };

beforeEach(() => {
  boom = true;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); reportClientError.mockClear(); });

test('a failing page shows Jaribu tena and Rudi Nyumbani, and is reported', () => {
  const onHome = jest.fn();
  render(<PageErrorBoundary page="Home" onHome={onHome}><Broken /></PageErrorBoundary>);
  expect(screen.getByText('Kuna tatizo kwenye ukurasa huu')).toBeInTheDocument();
  expect(reportClientError).toHaveBeenCalledWith(expect.objectContaining({ kind: 'page', page: 'Home' }));

  boom = false;
  fireEvent.click(screen.getByText('Jaribu tena'));
  expect(screen.getByText('Ukurasa uko sawa')).toBeInTheDocument();
});

test('Rudi Nyumbani goes Home; moving to another page starts it fresh', () => {
  const onHome = jest.fn();
  const { rerender } = render(<PageErrorBoundary page="Shop" onHome={onHome}><Broken /></PageErrorBoundary>);
  fireEvent.click(screen.getByText('Rudi Nyumbani'));
  expect(onHome).toHaveBeenCalled();

  rerender(<PageErrorBoundary page="Shop" onHome={onHome}><Broken /></PageErrorBoundary>);
  expect(screen.getByTestId('page-error')).toBeInTheDocument();
  boom = false;
  rerender(<PageErrorBoundary page="Inbox" onHome={onHome}><Broken /></PageErrorBoundary>);
  expect(screen.getByText('Ukurasa uko sawa')).toBeInTheDocument();
});

test('the slow internet notice shows after 20 seconds of loading and leaves when it arrives', () => {
  jest.useFakeTimers();
  __resetSlowNetworkForTests();
  render(<SlowNetworkNotice page="Home" />);
  let id;
  act(() => { id = startRequest('get'); });
  expect(screen.queryByTestId('slow-network')).toBeNull();
  act(() => { jest.advanceTimersByTime(SLOW_MS + 100); });
  expect(screen.getByText(/Mtandao ni dhaifu/)).toBeInTheDocument();
  expect(reportClientError).toHaveBeenCalledWith(expect.objectContaining({ kind: 'slow' }));
  act(() => { finishRequest(id); });
  expect(screen.queryByTestId('slow-network')).toBeNull();
  jest.useRealTimers();
});

test('sending a form does not count as slow loading', () => {
  __resetSlowNetworkForTests();
  expect(startRequest('post')).toBeNull();
});

describe('reportClientError', () => {
  const real = jest.requireActual('../../utils/clientErrors');
  beforeEach(() => {
    real.__resetClientErrorsForTests();
    global.fetch = jest.fn().mockResolvedValue({});
  });

  test('sends the page and error once, without the address query', () => {
    window.history.pushState({}, '', '/store/5?so=private.token');
    real.reportClientError({ kind: 'page', page: 'Store-5', error: new Error('x is undefined') });
    real.reportClientError({ kind: 'page', page: 'Store-5', error: new Error('x is undefined') });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/client-errors$/);
    const body = JSON.parse(opts.body);
    expect(body).toMatchObject({ kind: 'page', page: 'Store-5', path: '/store/5', message: 'x is undefined' });
    expect(opts.body).not.toContain('private.token');
  });

  test('sends at most 10 reports in one visit', () => {
    for (let i = 0; i < 15; i += 1) real.reportClientError({ kind: 'script', message: `kosa ${i}` });
    expect(global.fetch).toHaveBeenCalledTimes(10);
  });
});
