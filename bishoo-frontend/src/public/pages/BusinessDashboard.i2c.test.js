import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import BusinessDashboard from './BusinessDashboard';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key, i18n: { language: 'en' } }) }));

const business = { id: 2, legalName: 'Washing Machine TZ', tradingName: 'Washing Machine TZ', status: 'active' };
const entryFor = (o) => ({ businessId: 2, state: 'available', canApply: true, verification: 'ok', rejectionReason: null, blockedReason: null, ...o });
// hasSeller:true is exactly the masquerade: the OWNER has an unrelated personal Seller.
const mockApi = (entry) => api.get.mockImplementation((p) => {
  if (p === '/business/mine') return Promise.resolve({ data: business });
  if (p === '/business/2/dashboard') return Promise.resolve({ data: { business, hasSeller: true, followersCount: 0, rating: 0, reviewsCount: 0 } });
  if (p === '/business/2/today') return Promise.reject(new Error('n/a'));
  if (p === '/business/2/commerce-entry') return Promise.resolve({ data: entry });
  if (p === '/business/2/workspaces') return Promise.resolve({ data: [{ id: 20, isDefault: true, capabilities: ['commerce'], myAccountRole: { accountRoleId: 9, roleType: 'seller' } }] });
  return Promise.reject(new Error('unexpected GET ' + p));
});
const mountDash = (props = {}) => render(
  <BusinessDashboard isLoggedIn onNavigate={props.onNavigate || jest.fn()} activeContext={{}}
    roleOptions={[{ accountRoleId: 9, roleType: 'seller', switchable: true }]} onSwitchAccountRole={jest.fn()} {...props} />,
);

beforeEach(() => { jest.clearAllMocks(); api.post.mockResolvedValue({ data: {} }); });

test('C/E. a personal legacy Seller (dashboard.hasSeller=true) does NOT make this Business look like it is selling: the Start-selling door shows and Team stays locked', async () => {
  mockApi(entryFor({}));
  const onNavigate = jest.fn();
  mountDash({ onNavigate });
  expect(await screen.findByTestId('commerce-entry-action-start')).toBeInTheDocument();
  fireEvent.click(screen.getByText('business_dashboard.team_label'));
  expect(onNavigate).not.toHaveBeenCalled();
});

test('the door targets the exact Business shown and never the legacy personal Seller application', async () => {
  mockApi(entryFor({}));
  const onNavigate = jest.fn();
  mountDash({ onNavigate });
  fireEvent.click(await screen.findByTestId('commerce-entry-action-start'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/business/2/capabilities/commerce/apply', { applicationData: undefined }));
  expect(api.post.mock.calls.map((c) => c[0]).some((u) => /seller\/apply|activate-seller/.test(u))).toBe(false);
  expect(onNavigate.mock.calls.flat()).not.toContain('BecomeSeller');
});

test('locked tiles never route to BecomeSeller (Leads, Team) while selling is not active', async () => {
  mockApi(entryFor({ state: 'pending', canApply: false }));
  const onNavigate = jest.fn();
  mountDash({ onNavigate });
  await screen.findByText('business_commerce_entry.title_pending');
  fireEvent.click(screen.getByText('business_dashboard.leads_label'));
  fireEvent.click(screen.getByText('business_dashboard.team_label'));
  expect(onNavigate).not.toHaveBeenCalled();
});

test('F. once COMMERCE is active for this Business: no activation CTA, Team unlocks, and "Open selling" is offered', async () => {
  mockApi(entryFor({ state: 'active', canApply: false }));
  const onNavigate = jest.fn();
  mountDash({ onNavigate });
  expect(await screen.findByText('business_commerce_entry.title_active')).toBeInTheDocument();
  expect(screen.queryByTestId('commerce-entry-action-start')).toBeNull();
  fireEvent.click(screen.getByText('business_dashboard.team_label'));
  expect(onNavigate).toHaveBeenCalledWith('SellerTeam');
});

test('H. if the server state cannot be read, selling-only rows stay locked (unknown is never treated as active)', async () => {
  api.get.mockImplementation((p) => {
    if (p === '/business/mine') return Promise.resolve({ data: business });
    if (p === '/business/2/dashboard') return Promise.resolve({ data: { business, hasSeller: true } });
    return Promise.reject(new Error('down'));
  });
  const onNavigate = jest.fn();
  mountDash({ onNavigate });
  expect(await screen.findByText('business_commerce_entry.check_failed')).toBeInTheDocument();
  fireEvent.click(screen.getByText('business_dashboard.team_label'));
  expect(onNavigate).not.toHaveBeenCalled();
});

describe('structural guard: no Business selling CTA can reach the legacy personal Seller path', () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const read = (rel) => strip(fs.readFileSync(path.join(__dirname, rel), 'utf8'));
  test.each([
    '../pages/BusinessDashboard.js', '../pages/BusinessHome.js', '../components/BusinessCommerceEntry.js', '../../context/commerceEntry.js',
  ])('%s never references BecomeSeller, /seller/apply, activate-seller or the legacy hasSeller flag', (rel) => {
    const src = read(rel);
    expect(src).not.toMatch(/BecomeSeller/);
    expect(src).not.toMatch(/seller\/apply/);
    expect(src).not.toMatch(/activate-seller/);
    expect(src).not.toMatch(/hasSeller/);
  });
  test('the door sends no client-asserted authority (only the route businessId)', () => {
    const src = read('../components/BusinessCommerceEntry.js');
    expect(src).not.toMatch(/workspaceId\s*[:=]|accountRoleId\s*[:=]|profileId|userId/);
    const apiSrc = fs.readFileSync(path.join(__dirname, '../../api/business.js'), 'utf8');
    expect(apiSrc).toMatch(/commerce-entry/);
  });
});
