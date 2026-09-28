import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import BusinessCommerceEntry from './BusinessCommerceEntry';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
jest.mock('./VerifyIdentityModal', () => ({ __esModule: true, default: ({ onClose, onVerified }) => (
  <div data-testid="verify-modal"><button onClick={onVerified}>verified</button><button onClick={onClose}>close</button></div>
) }));

const entry = (o = {}) => ({ businessId: 7, state: 'available', canApply: true, verification: 'ok', rejectionReason: null, blockedReason: null, ...o });
const workspace = { id: 70, isDefault: true, capabilities: ['commerce'], myAccountRole: { accountRoleId: 501, roleType: 'seller' } };
const roles = [{ accountRoleId: 501, roleType: 'seller', switchable: true }];

let entryQueue;
const mockApi = ({ entries, workspaces = [workspace] } = {}) => {
  entryQueue = [...entries];
  api.get.mockImplementation((path) => {
    if (path === '/business/7/commerce-entry') {
      const next = entryQueue.length > 1 ? entryQueue.shift() : entryQueue[0];
      return next instanceof Error ? Promise.reject(next) : Promise.resolve({ data: next });
    }
    if (path === '/business/7/workspaces') return Promise.resolve({ data: workspaces });
    return Promise.reject(new Error('unexpected GET ' + path));
  });
};
const mountDoor = (props = {}) => render(<BusinessCommerceEntry businessId={7} businessName="Washing Machine TZ" onNavigate={jest.fn()} activeContext={{}} roleOptions={roles} onSwitchAccountRole={jest.fn()} {...props} />);
const postedPaths = () => api.post.mock.calls.map((c) => c[0]);

beforeEach(() => { jest.clearAllMocks(); api.post.mockResolvedValue({ data: {} }); });

test('A. not selling yet: the ONE simple door targets THIS exact Business and the generic engine — never the legacy personal /seller/apply', async () => {
  mockApi({ entries: [entry(), entry({ state: 'pending', canApply: false })] });
  mountDoor();
  const start = await screen.findByTestId('commerce-entry-action-start');
  expect(screen.getByText('business_commerce_entry.title_available')).toBeInTheDocument();
  fireEvent.click(start);
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  expect(api.post).toHaveBeenCalledWith('/business/7/capabilities/commerce/apply', { applicationData: undefined });
  // no client-asserted authority anywhere in the request
  expect(JSON.stringify(api.post.mock.calls)).not.toMatch(/workspaceId|accountRoleId|profileId|userId/);
  expect(postedPaths().some((p) => /seller\/apply|activate-seller/.test(p))).toBe(false);
  // B. after applying, the state is re-read from the server and shows the simple pending state
  expect(await screen.findByText('business_commerce_entry.title_pending')).toBeInTheDocument();
  expect(screen.queryByTestId('commerce-entry-action-start')).toBeNull();
});

test('B. pending: simple "we are confirming" state, NO button, so no duplicate application can be started', async () => {
  mockApi({ entries: [entry({ state: 'pending', canApply: false })] });
  mountDoor();
  expect(await screen.findByText('business_commerce_entry.title_pending')).toBeInTheDocument();
  expect(screen.queryByRole('button')).toBeNull();
  expect(api.post).not.toHaveBeenCalled();
});

test('a duplicate/late submit is answered by the server: ALREADY_PENDING refreshes to pending, no error banner', async () => {
  mockApi({ entries: [entry(), entry({ state: 'pending', canApply: false })] });
  api.post.mockRejectedValue({ response: { data: { code: 'CAPABILITY_APPLICATION_ALREADY_PENDING', message: 'CAPABILITY_APPLICATION_ALREADY_PENDING' } } });
  mountDoor();
  fireEvent.click(await screen.findByTestId('commerce-entry-action-start'));
  expect(await screen.findByText('business_commerce_entry.title_pending')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(document.body.textContent).not.toMatch(/CAPABILITY_|ALREADY_PENDING/);
});

test('G. rejected: reason shown, reapply offered only because the server allowed it; reapply uses the same exact-Business engine call', async () => {
  mockApi({ entries: [entry({ state: 'rejected', canApply: true, rejectionReason: 'Documents unclear' }), entry({ state: 'pending', canApply: false })] });
  mountDoor();
  expect(await screen.findByText('business_commerce_entry.title_rejected')).toBeInTheDocument();
  expect(screen.getByText('Documents unclear')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('commerce-entry-action-reapply'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/business/7/capabilities/commerce/apply', { applicationData: undefined }));
  expect(await screen.findByText('business_commerce_entry.title_pending')).toBeInTheDocument();
});

test('G. rejected but the server says canApply:false => no reapply button (no frontend fallback)', async () => {
  mockApi({ entries: [entry({ state: 'rejected', canApply: false, rejectionReason: 'x' })] });
  mountDoor();
  await screen.findByText('business_commerce_entry.title_rejected');
  expect(screen.queryByTestId('commerce-entry-action-reapply')).toBeNull();
});

test('F. active + hideWhenActive (BusinessHome): the activation door steps aside entirely', async () => {
  mockApi({ entries: [entry({ state: 'active', canApply: false })] });
  const { container } = mountDoor({ hideWhenActive: true });
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/business/7/commerce-entry'));
  await waitFor(() => expect(container).toBeEmptyDOMElement());
  expect(screen.queryByText('business_commerce_entry.title_available')).toBeNull();
});

test('F. active (dashboard): no activation CTA; "Open selling" uses the SAME atomic switch with the server-issued role — never a businessId switch', async () => {
  mockApi({ entries: [entry({ state: 'active', canApply: false })] });
  const onSwitchAccountRole = jest.fn();
  mountDoor({ onSwitchAccountRole });
  expect(await screen.findByText('business_commerce_entry.title_active')).toBeInTheDocument();
  expect(screen.queryByTestId('commerce-entry-action-start')).toBeNull();
  fireEvent.click(await screen.findByTestId('commerce-entry-action-open'));
  expect(onSwitchAccountRole).toHaveBeenCalledWith(501, 'SellerDashboard');
  expect(onSwitchAccountRole).not.toHaveBeenCalledWith(7, expect.anything());
  expect(api.post).not.toHaveBeenCalled();
});

test('F. active and already in that seller context: navigates straight to the dashboard without switching again', async () => {
  mockApi({ entries: [entry({ state: 'active', canApply: false })] });
  const onNavigate = jest.fn(); const onSwitchAccountRole = jest.fn();
  mountDoor({ onNavigate, onSwitchAccountRole, activeContext: { accountRoleId: 501 } });
  fireEvent.click(await screen.findByTestId('commerce-entry-action-open'));
  expect(onNavigate).toHaveBeenCalledWith('SellerDashboard');
  expect(onSwitchAccountRole).not.toHaveBeenCalled();
});

test('H. active per the server but NO switchable role right now => a calm "not ready" note, no way in (never a frontend fallback)', async () => {
  mockApi({ entries: [entry({ state: 'active', canApply: false })] });
  mountDoor({ roleOptions: [{ accountRoleId: 501, roleType: 'seller', switchable: false }] });
  expect(await screen.findByText('business_commerce_entry.desc_active_preparing')).toBeInTheDocument();
  expect(screen.queryByTestId('commerce-entry-action-open')).toBeNull();
});

test.each([
  ['suspended', 'business_commerce_entry.title_suspended'],
  ['revoked', 'business_commerce_entry.title_revoked'],
  ['blocked', 'business_commerce_entry.title_blocked'],
])('H. %s: a useful non-technical message and NO apply/open button', async (state, titleKey) => {
  mockApi({ entries: [entry({ state, canApply: false, blockedReason: 'authority_inconsistent' })] });
  mountDoor();
  expect(await screen.findByText(titleKey)).toBeInTheDocument();
  expect(screen.queryByRole('button')).toBeNull();
  expect(document.body.textContent).not.toMatch(/authority_inconsistent|BusinessCapability|WorkspaceAssignment|AccountRole/);
});

test('a non-owner member is told only the owner can start selling', async () => {
  mockApi({ entries: [entry({ state: 'blocked', canApply: false, blockedReason: 'owner_required' })] });
  mountDoor();
  expect(await screen.findByText('business_commerce_entry.desc_blocked_owner')).toBeInTheDocument();
});

test('identity verification comes first: the identity flow opens, and after it the state is re-read', async () => {
  mockApi({ entries: [entry({ verification: 'required', canApply: false }), entry()] });
  mountDoor();
  expect(await screen.findByText('business_commerce_entry.title_verify')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('commerce-entry-action-verify'));
  expect(screen.getByTestId('verify-modal')).toBeInTheDocument();
  fireEvent.click(screen.getByText('verified'));
  expect(await screen.findByTestId('commerce-entry-action-start')).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

test('a VERIFICATION_REQUIRED refusal at submit time opens the identity flow instead of an error', async () => {
  mockApi({ entries: [entry()] });
  api.post.mockRejectedValue({ response: { data: { code: 'VERIFICATION_REQUIRED' } } });
  mountDoor();
  fireEvent.click(await screen.findByTestId('commerce-entry-action-start'));
  expect(await screen.findByTestId('verify-modal')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).toBeNull();
});

test('an unexpected submit failure shows one generic, non-technical message and keeps the door', async () => {
  mockApi({ entries: [entry()] });
  api.post.mockRejectedValue({ response: { data: { code: 'SOMETHING_NEW', message: 'internal detail' } } });
  mountDoor();
  fireEvent.click(await screen.findByTestId('commerce-entry-action-start'));
  expect(await screen.findByRole('alert')).toHaveTextContent('business_commerce_entry.apply_failed');
  expect(document.body.textContent).not.toMatch(/SOMETHING_NEW|internal detail/);
  expect(screen.getByTestId('commerce-entry-action-start')).toBeInTheDocument();
});

test('state read failure fails closed: a retry, never a guessed door; and the caller is told selling is NOT active', async () => {
  mockApi({ entries: [new Error('network down'), entry()] });
  const onEntryLoaded = jest.fn();
  mountDoor({ onEntryLoaded });
  expect(await screen.findByText('business_commerce_entry.check_failed')).toBeInTheDocument();
  expect(screen.queryByTestId('commerce-entry-action-start')).toBeNull();
  expect(onEntryLoaded).toHaveBeenLastCalledWith(null);
  fireEvent.click(screen.getByText('business_commerce_entry.try_again'));
  expect(await screen.findByTestId('commerce-entry-action-start')).toBeInTheDocument();
  expect(onEntryLoaded).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'available' }));
});

test('I. exact Business isolation: switching the Business prop re-reads THAT Business and never reuses the other one\'s state', async () => {
  api.get.mockImplementation((path) => {
    if (path === '/business/7/commerce-entry') return Promise.resolve({ data: entry({ businessId: 7, state: 'active', canApply: false }) });
    if (path === '/business/8/commerce-entry') return Promise.resolve({ data: entry({ businessId: 8 }) });
    if (path === '/business/7/workspaces') return Promise.resolve({ data: [workspace] });
    return Promise.reject(new Error('unexpected ' + path));
  });
  const { rerender } = mountDoor();
  expect(await screen.findByText('business_commerce_entry.title_active')).toBeInTheDocument();
  rerender(<BusinessCommerceEntry businessId={8} businessName="Bob Electronics" onNavigate={jest.fn()} activeContext={{}} roleOptions={roles} onSwitchAccountRole={jest.fn()} />);
  expect(await screen.findByText('business_commerce_entry.title_available')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('commerce-entry-action-start'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/business/8/capabilities/commerce/apply', { applicationData: undefined }));
  expect(postedPaths()).not.toContain('/business/7/capabilities/commerce/apply');
});

test('the exact Business\'s Commerce tile is reported to the caller: ACTIVE when the current context already IS that role, AVAILABLE otherwise', async () => {
  mockApi({ entries: [entry({ state: 'active', canApply: false })] });
  const onOpenTileResolved = jest.fn();
  mountDoor({ onOpenTileResolved, activeContext: { accountRoleId: 501 } });
  await waitFor(() => expect(onOpenTileResolved).toHaveBeenCalledWith(7, expect.objectContaining({ key: 'commerce', state: 'active', accountRoleId: 501 })));
});

test('a Business change resets the caller first (entry null, no tile) and never leaves the previous Business\'s tile behind', async () => {
  api.get.mockImplementation((path) => {
    if (path === '/business/7/commerce-entry') return Promise.resolve({ data: entry({ businessId: 7, state: 'active', canApply: false }) });
    if (path === '/business/8/commerce-entry') return Promise.resolve({ data: entry({ businessId: 8 }) });
    if (path === '/business/7/workspaces') return Promise.resolve({ data: [workspace] });
    return Promise.reject(new Error('unexpected ' + path));
  });
  const onEntryLoaded = jest.fn(); const onOpenTileResolved = jest.fn();
  const { rerender } = mountDoor({ onEntryLoaded, onOpenTileResolved });
  await waitFor(() => expect(onOpenTileResolved).toHaveBeenCalledWith(7, expect.objectContaining({ key: 'commerce' })));
  onEntryLoaded.mockClear(); onOpenTileResolved.mockClear();
  rerender(<BusinessCommerceEntry businessId={8} businessName="Bob Electronics" onEntryLoaded={onEntryLoaded} onOpenTileResolved={onOpenTileResolved}
    onNavigate={jest.fn()} activeContext={{}} roleOptions={roles} onSwitchAccountRole={jest.fn()} />);
  await waitFor(() => expect(onEntryLoaded).toHaveBeenLastCalledWith(expect.objectContaining({ businessId: 8, state: 'available' })));
  expect(onEntryLoaded.mock.calls[0][0]).toBeNull(); // reset before the new state arrives
  expect(onOpenTileResolved).toHaveBeenCalledWith(8, null);
  expect(onOpenTileResolved.mock.calls.some(([id, tile]) => id === 7 && tile)).toBe(false);
});
