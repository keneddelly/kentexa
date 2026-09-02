import {
  __resetTokenStoreForTests, clearAccessToken, getAccessToken,
  getTokenSnapshot, setAccessToken,
} from './tokenStore';

beforeEach(__resetTokenStoreForTests);

test('one canonical token key rotates its generation', () => {
  localStorage.setItem('kentexa_token', 'obsolete');
  setAccessToken('first');
  expect(getAccessToken()).toBe('first');
  expect(localStorage.getItem('kentexa_token')).toBeNull();
  const firstGeneration = getTokenSnapshot().generation;
  setAccessToken('second');
  expect(getTokenSnapshot()).toEqual({ token: 'second', generation: firstGeneration + 1 });
});

test('clearing authority removes both historical token keys', () => {
  setAccessToken('token');
  localStorage.setItem('kentexa_token', 'obsolete');
  clearAccessToken();
  expect(getAccessToken()).toBeNull();
  expect(localStorage.getItem('kentexa_token')).toBeNull();
});
