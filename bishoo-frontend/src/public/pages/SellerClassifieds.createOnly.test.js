import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SellerClassifieds from './SellerClassifieds';
import api from '../../api/api';

jest.mock('../../api/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('../components/LocationPicker', () => () => null);
jest.mock('../components/VerifyIdentityModal', () => () => null);

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation(url => {
    if (url === '/categories') return Promise.resolve({ data: [
      { key: 'general', label: 'General', icon: '📦', mediaRules: { minImages: 0, maxImages: 10 },
        subcategories: [{ key: 'other', label: 'Other', attributes: [] }] },
    ] });
    if (url === '/classifieds/user/mine') return Promise.resolve({ data: [] });
    if (url === '/auth/profile') return Promise.resolve({ data: { phone: '0700' } });
    return Promise.resolve({ data: {} });
  });
});

const fillValidForm = () => {
  fireEvent.change(screen.getByPlaceholderText('seller_classifieds.title_placeholder'), {
    target: { value: 'Personal bicycle' },
  });
  fireEvent.change(screen.getByPlaceholderText('seller_classifieds.description_placeholder'), {
    target: { value: 'A maintained personal bicycle.' },
  });
  fireEvent.change(screen.getByPlaceholderText('seller_classifieds.price_placeholder'), {
    target: { value: '100000' },
  });
};

test('create-only opens immediately and a clean cancel uses canonical back navigation', () => {
  const onNavigate = jest.fn();
  render(<SellerClassifieds createOnly listingMode="personal" isLoggedIn userRole="buyer" onNavigate={onNavigate} />);
  expect(screen.getByText('seller_classifieds.modal_new_title')).toBeInTheDocument();
  fireEvent.click(screen.getByText('seller_classifieds.cancel_button'));
  expect(onNavigate).toHaveBeenCalledWith('back');
  expect(onNavigate).not.toHaveBeenCalledWith('Home');
});

test('dirty create-only cancel preserves the unsaved-change confirmation', () => {
  const onNavigate = jest.fn();
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
  render(<SellerClassifieds createOnly listingMode="personal" isLoggedIn userRole="buyer" onNavigate={onNavigate} />);
  fireEvent.change(screen.getByPlaceholderText('seller_classifieds.title_placeholder'), { target: { value: 'Draft' } });
  fireEvent.click(screen.getByText('seller_classifieds.cancel_button'));
  expect(confirm).toHaveBeenCalledWith('listing_validation.discard_changes');
  expect(onNavigate).not.toHaveBeenCalled();
  confirm.mockRestore();
});

test('successful Personal create omits every authority key and opens canonical detail', async () => {
  api.post.mockResolvedValue({ data: { id: 77 } });
  const onNavigate = jest.fn();
  render(<SellerClassifieds createOnly listingMode="personal" isLoggedIn userRole="buyer" onNavigate={onNavigate} />);
  await screen.findByText('seller_classifieds.photos_label');
  fillValidForm();
  fireEvent.click(screen.getByText('seller_classifieds.post_listing_button'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/classifieds', expect.any(Object)));
  const payload = api.post.mock.calls.find(([url]) => url === '/classifieds')[1];
  ['commerceProfileId','workspaceId','sellerId','sellerProfileId','accountRoleId','businessId','ownerId']
    .forEach(key => expect(key in payload).toBe(false));
  expect(onNavigate).toHaveBeenCalledWith('ClassifiedDetail-77');
});

test('create-only retains validation and synchronous duplicate-submit protection', async () => {
  let resolveCreate;
  api.post.mockImplementation(url => url === '/classifieds'
    ? new Promise(resolve => { resolveCreate = resolve; })
    : Promise.resolve({ data: {} }));
  const onNavigate = jest.fn();
  render(<SellerClassifieds createOnly listingMode="personal" isLoggedIn userRole="buyer" onNavigate={onNavigate} />);
  fireEvent.click(screen.getByText('seller_classifieds.post_listing_button'));
  expect(screen.getByText(/listing_validation.title_required/)).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalledWith('/classifieds', expect.anything());
  await screen.findByText('seller_classifieds.photos_label');
  fillValidForm();
  const submit = screen.getByText('seller_classifieds.post_listing_button');
  fireEvent.click(submit);
  fireEvent.click(submit);
  expect(api.post.mock.calls.filter(([url]) => url === '/classifieds')).toHaveLength(1);
  resolveCreate({ data: { id: 78 } });
  await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('ClassifiedDetail-78'));
});
