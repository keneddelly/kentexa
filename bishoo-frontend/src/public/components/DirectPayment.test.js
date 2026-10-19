import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { DirectPaymentChoice, DirectPaymentNotice, LipaNambaBox } from './DirectPayment';
import SellerLipaNambaCard from './SellerLipaNambaCard';
import api from '../../api/api';
import sw from '../../locales/sw.json';

jest.mock('react-i18next', () => {
  const texts = require('../../locales/sw.json');
  return { useTranslation: () => ({ t: (key, vars) => {
    const v = key.split('.').reduce((o, k) => (o ? o[k] : undefined), texts) ?? key;
    return String(v).replace(/\{\{(\w+)\}\}/g, (_m, k) => (vars && vars[k] != null ? vars[k] : ''));
  } }) };
});
jest.mock('../../api/api', () => ({ get: jest.fn(), patch: jest.fn() }));

const dp = sw.direct_payment;
// Rendering + an async fetch per test; the default 5 s is too tight on a busy machine.
jest.setTimeout(30000);

test('Lipa Namba box: number, registered name, the exact note, and a copy button', async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  render(<LipaNambaBox number="55771234" name="Juma Shop" />);
  expect(screen.getByText('55771234')).toBeInTheDocument();
  expect(screen.getByText('Juma Shop')).toBeInTheDocument();
  expect(screen.getByText('Lipa kwenye namba hii, kisha utume ujumbe kwa muuzaji.')).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: dp.copy })); });
  expect(writeText).toHaveBeenCalledWith('55771234');
  expect(screen.getByRole('button', { name: dp.copied })).toBeInTheDocument();
});

describe('checkout choice', () => {
  const props = { loading: false, regionChosen: true, digital: false, lipaNambas: [{ number: '55771234', name: 'Juma Shop' }], choice: null, onChoose: jest.fn() };

  test('same city: both ways, the city note, and the number only after choosing Lipa Namba', () => {
    const { rerender } = render(<DirectPaymentChoice {...props} options={['cod', 'lipa_namba']} sameCity />);
    expect(screen.getByTestId('direct-payment-city')).toHaveTextContent(dp.same_city);
    expect(screen.getByTestId('pay-cod')).toBeInTheDocument();
    expect(screen.getByTestId('pay-lipa')).toBeInTheDocument();
    expect(screen.queryByTestId('lipa-namba-box')).toBeNull();
    fireEvent.click(screen.getByTestId('pay-cod'));
    expect(props.onChoose).toHaveBeenCalledWith('cod');
    rerender(<DirectPaymentChoice {...props} options={['cod', 'lipa_namba']} sameCity choice="lipa_namba" />);
    expect(screen.getByTestId('lipa-namba-box')).toHaveTextContent('55771234');
  });

  test('other city: Lipa Namba only, never COD', () => {
    render(<DirectPaymentChoice {...props} options={['lipa_namba']} sameCity={false} />);
    expect(screen.getByTestId('direct-payment-city')).toHaveTextContent(dp.other_city);
    expect(screen.queryByTestId('pay-cod')).toBeNull();
    expect(screen.getByTestId('pay-lipa')).toBeInTheDocument();
  });

  test('no way to pay: a clear message, no options', () => {
    render(<DirectPaymentChoice {...props} options={[]} sameCity={false} />);
    expect(screen.getByRole('alert')).toHaveTextContent(dp.none);
    expect(screen.queryByTestId('pay-lipa')).toBeNull();
  });

  test('no region yet: asks for it', () => {
    render(<DirectPaymentChoice {...props} options={['lipa_namba']} regionChosen={false} sameCity={false} />);
    expect(screen.getByText(dp.choose_region)).toBeInTheDocument();
  });

  test('no region yet and nothing offered: no red alert, only the region note', () => {
    render(<DirectPaymentChoice {...props} options={[]} regionChosen={false} sameCity={false} />);
    expect(screen.getByText(dp.choose_region)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('digital item with nothing offered: the alert shows without a region', () => {
    render(<DirectPaymentChoice {...props} options={[]} regionChosen={false} digital sameCity={false} />);
    expect(screen.getByRole('alert')).toHaveTextContent(dp.none);
  });
});

describe('order notice (My Orders / tracking)', () => {
  beforeEach(() => { api.get.mockResolvedValue({ data: { lipaNamba: { number: '55771234', name: 'Juma Shop' } } }); });

  test('Lipa Namba order: says how to pay and shows the seller number', async () => {
    await act(async () => {
      render(<DirectPaymentNotice order={{ paymentMethod: 'lipa_namba', paymentMode: 'cod_lipa', totalAmount: '25000', status: 'preparing', product: { id: 1 } }} />);
    });
    expect(screen.getByTestId('direct-payment-notice')).toHaveTextContent('Malipo: kwa Lipa Namba ya muuzaji (TZS 25,000)');
    expect(screen.getByTestId('lipa-namba-box')).toHaveTextContent('55771234');
  });

  test('COD order: pay by hand on delivery, no number fetched', async () => {
    api.get.mockClear();
    await act(async () => {
      render(<DirectPaymentNotice order={{ paymentMethod: 'cod', paymentMode: 'cod_lipa', totalAmount: '25000', status: 'preparing', product: { id: 1 } }} />);
    });
    expect(screen.getByTestId('direct-payment-notice')).toHaveTextContent('Malipo: kwa mkono unapopokea (TZS 25,000)');
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe('seller Lipa Namba card', () => {
  test('no number yet: warning + form; saving sends both values', async () => {
    api.patch.mockResolvedValue({ data: { lipaNamba: '55771234', lipaNambaName: 'Juma Shop' } });
    const onSaved = jest.fn();
    render(<SellerLipaNambaCard profile={{ lipaNamba: null }} onSaved={onSaved} />);
    expect(screen.getByText(dp.seller_missing)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(dp.seller_number_label), { target: { value: '5577 1234' } });
    fireEvent.change(screen.getByLabelText(dp.seller_name_label), { target: { value: 'Juma Shop' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: dp.seller_save })); });
    expect(api.patch).toHaveBeenCalledWith('/seller/my-profile/lipa-namba', { lipaNamba: '5577 1234', lipaNambaName: 'Juma Shop' });
    expect(onSaved).toHaveBeenCalledWith({ lipaNamba: '55771234', lipaNambaName: 'Juma Shop' });
  });

  test('server refusal is shown', async () => {
    api.patch.mockRejectedValue({ response: { data: { message: 'Weka Lipa Namba sahihi (tarakimu 5 hadi 15).' } } });
    render(<SellerLipaNambaCard profile={{ lipaNamba: null }} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: dp.seller_save })); });
    expect(screen.getByRole('alert')).toHaveTextContent('Weka Lipa Namba sahihi');
  });

  test('a saved number shows with a Change button', () => {
    render(<SellerLipaNambaCard profile={{ lipaNamba: '55771234', lipaNambaName: 'Juma Shop' }} />);
    expect(screen.getByText('55771234')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: dp.seller_edit })).toBeInTheDocument();
    expect(screen.queryByText(dp.seller_missing)).toBeNull();
  });
});
