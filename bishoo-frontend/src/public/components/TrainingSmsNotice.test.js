import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import TrainingSmsNotice from './TrainingSmsNotice';
import sw from '../../locales/sw.json';

jest.mock('react-i18next', () => {
  const texts = require('../../locales/sw.json');
  return { useTranslation: () => ({ t: (key, vars) => {
    const v = key.split('.').reduce((o, k) => (o ? o[k] : undefined), texts) ?? key;
    return String(v).replace(/\{\{(\w+)\}\}/g, (_m, k) => (vars && vars[k] != null ? vars[k] : ''));
  } }) };
});

test('nothing until a training office response carries an SMS preview', () => {
  render(<TrainingSmsNotice />);
  expect(screen.queryByTestId('training-sms')).toBeNull();
});

test('shows "SMS ingetumwa kwa ..." with the exact text; "Sawa" closes it', () => {
  render(<TrainingSmsNotice />);
  act(() => {
    window.dispatchEvent(new CustomEvent('kentexa:training-sms', { detail: [
      { to: '+255712345678', text: 'KenteXa: Mzigo KTX 9815 9515 21 umepokelewa.' }] }));
  });
  expect(screen.getByText(sw.training_sms.title)).toBeInTheDocument();
  expect(screen.getByText('SMS ingetumwa kwa +255712345678:')).toBeInTheDocument();
  expect(screen.getByText('KenteXa: Mzigo KTX 9815 9515 21 umepokelewa.')).toBeInTheDocument();
  expect(screen.getByTestId('training-sms')).toHaveAttribute('data-keep-open');
  fireEvent.click(screen.getByText(sw.training_sms.close));
  expect(screen.queryByTestId('training-sms')).toBeNull();
});
