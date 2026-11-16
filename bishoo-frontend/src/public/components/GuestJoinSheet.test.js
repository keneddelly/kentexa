import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import GuestJoinSheet from './GuestJoinSheet';
import { askToJoin } from '../utils/guestJoin';

beforeEach(() => window.localStorage.clear());

test('B: a guest writes first, registers, and the reply and the place are kept', () => {
  const onNavigate = jest.fn();
  render(<GuestJoinSheet onNavigate={onNavigate} />);
  act(() => { askToJoin({ action: 'reply', destination: 'PostDetail-88', people: ['Asha', 'Juma'], others: 7, draft: { postId: 88, body: 'Mimi naona', parentId: 11, replyName: 'Asha' } }); });
  expect(screen.getByTestId('guest-join-people')).toHaveTextContent('Asha, Juma na wengine 7 wanajadili hili');
  expect(screen.getByText('Andika jibu lako, kisha jisajili kulituma')).toBeInTheDocument();
  fireEvent.change(screen.getByTestId('guest-draft'), { target: { value: 'Mimi naona vocha na accessories' } });
  fireEvent.click(screen.getByTestId('guest-join-register'));
  expect(onNavigate).toHaveBeenCalledWith('Register');
  expect(window.localStorage.getItem('kentexa_after_login')).toBe('PostDetail-88');
  expect(JSON.parse(window.localStorage.getItem('kx_guest_draft'))).toEqual(expect.objectContaining({ postId: 88, body: 'Mimi naona vocha na accessories', parentId: 11 }));
  expect(screen.queryByTestId('guest-join')).toBeNull();
});

test('B: other actions: a short invitation, sign in, or keep reading', () => {
  const onNavigate = jest.fn();
  render(<GuestJoinSheet onNavigate={onNavigate} />);
  act(() => { askToJoin({ action: 'join', destination: 'Community-3' }); });
  expect(screen.getByText('Jisajili ili ujiunge na jumuiya hii')).toBeInTheDocument();
  expect(screen.queryByTestId('guest-draft')).toBeNull();
  fireEvent.click(screen.getByTestId('guest-join-later'));
  expect(screen.queryByTestId('guest-join')).toBeNull();
  expect(onNavigate).not.toHaveBeenCalled();
  act(() => { askToJoin({ action: 'like', destination: 'PostDetail-5' }); });
  fireEvent.click(screen.getByTestId('guest-join-login'));
  expect(onNavigate).toHaveBeenCalledWith('PublicLogin');
  expect(window.localStorage.getItem('kentexa_after_login')).toBe('PostDetail-5');
});
