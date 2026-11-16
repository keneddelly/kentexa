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

test('KenteXa text style (#374 E): a caption title is the bold start, the text is tidied', () => {
  sizes(40, 40);
  render(<ExpandableText lead="Wafanya biashara Kariakoo" text="hivi ni  biashara gani ?" />);
  expect(screen.getByTestId('post-lead')).toHaveTextContent('Wafanya biashara Kariakoo');
  expect(screen.getByTestId('post-text').textContent).toBe('Wafanya biashara Kariakoo: Hivi ni biashara gani?');
});

test('KenteXa text style (#374 E): raw keeps the text exactly as typed', () => {
  sizes(40, 40);
  render(<ExpandableText raw text="hivi ni  biashara" />);
  expect(screen.getByTestId('post-text').textContent).toBe('hivi ni  biashara');
});
