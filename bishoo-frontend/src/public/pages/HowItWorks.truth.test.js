import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import HowItWorks from './HowItWorks';

jest.mock('react-i18next', () => {
  const texts = require('../../locales/sw.json');
  return { useTranslation: () => ({ t: (key, vars) => {
    const v = key.split('.').reduce((o, k) => (o ? o[k] : undefined), texts) ?? key;
    return String(v).replace(/\{\{(\w+)\}\}/g, (_m, k) => (vars && vars[k] != null ? vars[k] : ''));
  } }) };
});

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{23F3}\u{231B}]/u;

test('the buyer is told the truth: pay the seller directly, KenteXa holds no money, no escrow promise', () => {
  const { container } = render(<HowItWorks onNavigate={jest.fn()} />);
  const text = container.textContent;
  expect(text).toMatch(/KenteXa haishikilii pesa yako/);
  expect(screen.getByText('Lipa Namba ya muuzaji')).toBeInTheDocument();
  expect(screen.getByText('Lipa ukipokea')).toBeInTheDocument();
  expect(text).not.toMatch(/escrow|maelfu ya Watanzania|Marejesho kamili|maduka yote yanapitiwa|Wakala wa KenteXa/i);
  expect(EMOJI.test(text)).toBe(false);
});
