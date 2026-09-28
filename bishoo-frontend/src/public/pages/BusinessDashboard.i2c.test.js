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

// Bob's identities: Washing Machine TZ = seller role 9 (business 2), Bob Electronics = seller role 77, Personal = buyer role 1.
const WM_SELLER = { accountRoleId: 9, roleType: 'seller', switchable: true };
const BE_SELLER = { accountRoleId: 77, roleType: 'seller', switchable: true };
const PERSONAL = { accountRoleId: 1, roleType: 'buyer', switchable: true };

test('F. once COMMERCE is active for this Business: no activation CTA and "Open selling" is offered', async () => {
  mockApi(entryFor({ state: 'active', canApply: false }));
  mountDash({ activeContext: { accountRoleId: 9 }, roleOptions: [PERSONAL, WM_SELLER, BE_SELLER] });
  expect(await screen.findByText('business_commerce_entry.title_active')).toBeInTheDocument();
  expect(screen.queryByTestId('commerce-entry-action-start')).toBeNull();
  expect(await screen.findByTestId('commerce-entry-action-open')).toBeInTheDocument();
});

describe('I. Team never opens under the wrong context, even though COMMERCE is active for the displayed Business', () => {
  const openTeam = async () => { await screen.findByTestId('commerce-entry-action-open'); fireEvent.click(screen.getByText('business_dashboard.team_label')); };

  test('already acting as THIS Business\'s Seller role: Team opens directly, with no switch', async () => {
    mockApi(entryFor({ state: 'active', canApply: false }));
    const onNavigate = jest.fn(); const onSwitchAccountRole = jest.fn();
    mountDash({ onNavigate, onSwitchAccountRole, activeContext: { accountRoleId: 9 }, roleOptions: [PERSONAL, WM_SELLER, BE_SELLER] });
    await openTeam();
    expect(onNavigate).toHaveBeenCalledWith('SellerTeam');
    expect(onSwitchAccountRole).not.toHaveBeenCalled();
  });

  test('acting as PERSONAL: Team goes through the exact-Business atomic switch (role 9), never a direct navigation into a seller page', async () => {
    mockApi(entryFor({ state: 'active', canApply: false }));
    const onNavigate = jest.fn(); const onSwitchAccountRole = jest.fn();
    mountDash({ onNavigate, onSwitchAccountRole, activeContext: { accountRoleId: 1 }, roleOptions: [PERSONAL, WM_SELLER, BE_SELLER] });
    await openTeam();
    expect(onSwitchAccountRole).toHaveBeenCalledTimes(1);
    expect(onSwitchAccountRole).toHaveBeenCalledWith(9, 'SellerTeam');
    expect(onNavigate).not.toHaveBeenCalledWith('SellerTeam');
  });

  test('acting as ANOTHER Business (Bob Electronics): switches to Washing Machine TZ\'s role only — never stays in / uses role 77, never navigates directly', async () => {
    mockApi(entryFor({ state: 'active', canApply: false }));
    const onNavigate = jest.fn(); const onSwitchAccountRole = jest.fn();
    mountDash({ onNavigate, onSwitchAccountRole, activeContext: { accountRoleId: 77 }, roleOptions: [PERSONAL, WM_SELLER, BE_SELLER] });
    await openTeam();
    expect(onSwitchAccountRole).toHaveBeenCalledWith(9, 'SellerTeam');
    expect(onSwitchAccountRole).not.toHaveBeenCalledWith(77, expect.anything());
    expect(onNavigate).not.toHaveBeenCalledWith('SellerTeam');
  });

  test('COMMERCE active per the server but the Business role is not switchable right now: Team is inert (no fallback)', async () => {
    mockApi(entryFor({ state: 'active', canApply: false }));
    const onNavigate = jest.fn(); const onSwitchAccountRole = jest.fn();
    mountDash({ onNavigate, onSwitchAccountRole, activeContext: { accountRoleId: 1 }, roleOptions: [PERSONAL, { ...WM_SELLER, switchable: false }] });
    await screen.findByText('business_commerce_entry.desc_active_preparing');
    fireEvent.click(screen.getByText('business_dashboard.team_label'));
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onSwitchAccountRole).not.toHaveBeenCalled();
  });

  test('a stale answer for ANOTHER Business (entry.businessId !== the Business shown) is ignored: Team stays inert', async () => {
    mockApi(entryFor({ businessId: 3, state: 'active', canApply: false }));
    const onNavigate = jest.fn(); const onSwitchAccountRole = jest.fn();
    mountDash({ onNavigate, onSwitchAccountRole, activeContext: { accountRoleId: 9 }, roleOptions: [PERSONAL, WM_SELLER] });
    await screen.findByTestId('commerce-entry-action-open');
    fireEvent.click(screen.getByText('business_dashboard.team_label'));
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onSwitchAccountRole).not.toHaveBeenCalled();
  });

  test('no Team navigation exists that is not gated by the exact Business tile (structural)', () => {
    const src = fs.readFileSync(path.join(__dirname, 'BusinessDashboard.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const navs = src.match(/onNavigate\('SellerTeam'\)/g) || [];
    expect(navs).toHaveLength(1); // only inside handleOpenTeam
    expect(src).toMatch(/if \(!commerceActive \|\| !exactCommerceTile\) return;/);
  });
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
