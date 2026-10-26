import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { OfficeHome, OfficeScreenHeader, OfficeMenu, OfficeRow } from './OfficeDashboardShell';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

test('Mwanzo: the two jobs with what waits in each, search and the menu', () => {
  const on = { onPokea: jest.fn(), onTuma: jest.fn(), onMenu: jest.fn(), onInbox: jest.fn(), onSearch: jest.fn() };
  render(<OfficeHome officeName="Ofisi ya Kariakoo" city="Dar es Salaam" pokeaCount={6} tumaCount={9} inboxUnread={2} {...on} />);
  expect(screen.getByTestId('office-pokea').textContent).toMatch(/POKEA.*6zinasubiri kupokelewa/);
  expect(screen.getByTestId('office-tuma').textContent).toMatch(/TUMA.*9zinasubiri kutumwa/);
  fireEvent.click(screen.getByTestId('office-pokea'));
  fireEvent.click(screen.getByTestId('office-tuma'));
  fireEvent.click(screen.getByLabelText('Fungua menyu'));
  expect(on.onPokea).toHaveBeenCalled(); expect(on.onTuma).toHaveBeenCalled(); expect(on.onMenu).toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Tafuta mzigo'), { target: { value: ' KTX 1234 5678 90 ' } });
  fireEvent.click(screen.getByText('Tafuta'));
  expect(on.onSearch).toHaveBeenCalledWith('KTX 1234 5678 90');
  // No emoji anywhere on the screen (quality bar).
  expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
});

test('screen header: back to where you came from, and the count waiting', () => {
  const onBack = jest.fn();
  render(<OfficeScreenHeader kind="tuma" title="TUMA" count={9} onBack={onBack} />);
  expect(screen.getByText('9 zinasubiri')).toBeTruthy();
  fireEvent.click(screen.getByText('Mwanzo'));
  expect(onBack).toHaveBeenCalled();
});

test('menu: every item opens its page; a row shows its count and an alert', () => {
  const open = jest.fn();
  render(<OfficeMenu items={[{ key: 'historia', title: 'Historia', hint: 'x', onClick: open }]} />);
  fireEvent.click(screen.getByTestId('office-menu-historia'));
  expect(open).toHaveBeenCalled();
  render(<OfficeRow testId="r" title="Shehena" count={4} alert onClick={() => {}} />);
  expect(screen.getByTestId('r').textContent).toMatch(/Shehena4/);
});

test('Washirika: own transport and partners, and an invitation from the office phone', async () => {
  const api = require('../../api/api').default;
  api.get.mockResolvedValue({ data: { transport: [{ id: 3, name: 'Abood Bus', relation: 'own', phone: '255700000003' }, { id: 9, name: 'Lori la Juma', relation: 'partner' }] } });
  const OfficePartners = require('./OfficePartners').default;
  render(<OfficePartners officeName="Ofisi ya Kariakoo" />);
  expect((await screen.findByTestId('office-partner-3')).textContent).toMatch(/Abood Bus.*Usafiri wako · 255700000003/);
  expect(screen.getByTestId('office-partner-9').textContent).toMatch(/Mshirika/);
  fireEvent.click(screen.getByTestId('invite-carrier'));
  expect(screen.getByTestId('invite-carrier-send').getAttribute('href')).toMatch(/Ofisi%20ya%20Kariakoo/);
});
