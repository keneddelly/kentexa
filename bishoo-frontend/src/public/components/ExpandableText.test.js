import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ExpandableText from './ExpandableText';

const sizes = (scroll, client) => {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => scroll });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => client });
};

test('long text: full text kept, clamped, "Soma zaidi" opens it', () => {
  sizes(200, 80);
  const text = 'Mzigo mpya umefika leo. '.repeat(30).trim();
  render(<ExpandableText text={text} lines={3} />);
  const el = screen.getByTestId('post-text');
  expect(el.textContent).toBe(text);                 // never cut with "..."
  expect(el.style.WebkitLineClamp).toBe('3');
  fireEvent.click(screen.getByTestId('read-more'));
  expect(screen.getByTestId('post-text').style.WebkitLineClamp).toBe('');
  expect(screen.queryByTestId('read-more')).toBeNull();
});

test('short text: no "Soma zaidi"', () => {
  sizes(40, 40);
  render(<ExpandableText text="Karibu" />);
  expect(screen.queryByTestId('read-more')).toBeNull();
});
