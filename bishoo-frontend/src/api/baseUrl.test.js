// A local run with no REACT_APP_API_URL must never talk to the live API.
const load = () => {
  let value;
  jest.isolateModules(() => { value = require('./baseUrl').API_BASE_URL; });
  return value;
};

describe('API_BASE_URL', () => {
  const original = process.env.REACT_APP_API_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.REACT_APP_API_URL;
    else process.env.REACT_APP_API_URL = original;
  });

  test('falls back to this computer, never the live site', () => {
    delete process.env.REACT_APP_API_URL;
    expect(load()).toBe('http://localhost:3001');
  });

  test('uses the address the host provides', () => {
    process.env.REACT_APP_API_URL = 'https://bishoo-backend.onrender.com';
    expect(load()).toBe('https://bishoo-backend.onrender.com');
  });
});
