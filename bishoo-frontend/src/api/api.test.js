import api, { configureAuthLifecycle, StaleContextResponseError } from './api';
import { __resetTokenStoreForTests, setAccessToken } from './tokenStore';

let epoch;
let revoked;
const waitForAdapter = async (ready) => {
  for (let i = 0; i < 20 && !ready(); i += 1) await new Promise(resolve => setTimeout(resolve, 0));
  expect(ready()).toBe(true);
};

beforeEach(() => {
  __resetTokenStoreForTests();
  epoch = 0;
  revoked = jest.fn();
  configureAuthLifecycle({ getContextEpoch: () => epoch, onCurrentContextRevoked: revoked });
});

test('stale old-context success is rejected after token replacement', async () => {
  setAccessToken('old');
  let resolve;
  const request = api.get('/slow', { adapter: config => new Promise(r => { resolve = () => r({ data: 'old', status: 200, statusText: 'OK', headers: {}, config }); }) });
  await waitForAdapter(() => typeof resolve === 'function');
  setAccessToken('new');
  epoch += 1;
  resolve();
  await expect(request).rejects.toBeInstanceOf(StaleContextResponseError);
});

test('a stale revoked response cannot clear the new context', async () => {
  setAccessToken('old');
  let reject;
  const request = api.get('/slow-401', { adapter: config => new Promise((_, r) => { reject = () => r({
    config, response: { status: 401, data: { code: 'ROLE_CONTEXT_REVOKED' }, config }, isAxiosError: true,
  }); }) });
  await waitForAdapter(() => typeof reject === 'function');
  setAccessToken('new');
  epoch += 1;
  reject();
  await expect(request).rejects.toBeInstanceOf(StaleContextResponseError);
  expect(revoked).not.toHaveBeenCalled();
});

test('revocation for the current token invokes centralized clearing once', async () => {
  setAccessToken('current');
  const adapter = config => Promise.reject({
    config, response: { status: 401, data: { code: 'ROLE_CONTEXT_REVOKED' }, config }, isAxiosError: true,
  });
  await expect(api.get('/current-401', { adapter })).rejects.toBeTruthy();
  expect(revoked).toHaveBeenCalledTimes(1);
});

test('authenticated requests read the canonical current token', async () => {
  setAccessToken('canonical');
  let authorization;
  await api.get('/capture', { adapter: config => {
    authorization = config.headers.Authorization;
    return Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config });
  } });
  expect(authorization).toBe('Bearer canonical');
});
