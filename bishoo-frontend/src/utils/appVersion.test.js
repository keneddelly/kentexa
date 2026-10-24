import { fetchLatestMainBundle, isNewVersion, isSafeToReload, mainBundleIn, runningMainBundle } from './appVersion';

describe('which website version is running / published', () => {
  test('reads the code file name from the front page and from the running page', () => {
    expect(mainBundleIn('<script defer src="/static/js/main.2af576c6.js"></script>')).toBe('/static/js/main.2af576c6.js');
    expect(mainBundleIn('<html>no bundle</html>')).toBeNull();
    document.head.innerHTML = '<script src="/static/js/main.3e0ad7b8.js"></script>';
    expect(runningMainBundle(document)).toBe('/static/js/main.3e0ad7b8.js');
    document.head.innerHTML = '<script src="/static/js/bundle.js"></script>';
    expect(runningMainBundle(document)).toBeNull(); // local development: feature off
  });

  test('new only when both are known and differ', () => {
    expect(isNewVersion('/static/js/main.aaa.js', '/static/js/main.bbb.js')).toBe(true);
    expect(isNewVersion('/static/js/main.aaa.js', '/static/js/main.aaa.js')).toBe(false);
    expect(isNewVersion('/static/js/main.aaa.js', null)).toBe(false);
    expect(isNewVersion(null, '/static/js/main.bbb.js')).toBe(false);
  });

  test('asks the site without any cache and never throws', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true, text: async () => '<script src="/static/js/main.abc123.js">' }));
    await expect(fetchLatestMainBundle(fetchImpl)).resolves.toBe('/static/js/main.abc123.js');
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ cache: 'no-store' });
    await expect(fetchLatestMainBundle(async () => { throw new Error('offline'); })).resolves.toBeNull();
    await expect(fetchLatestMainBundle(async () => ({ ok: false }))).resolves.toBeNull();
  });
});

describe('safe to reload = nothing would be lost', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  test('empty forms, buttons, choices and checkboxes are safe', () => {
    document.body.innerHTML = '<input value="" /><select><option selected>x</option></select><input type="checkbox" checked /><button>Ok</button>';
    expect(isSafeToReload(document)).toBe(true);
  });

  test('any typed text blocks the reload (walk-in form half filled)', () => {
    document.body.innerHTML = '<input placeholder="Juma Hamisi" /><textarea></textarea>';
    document.querySelector('input').value = 'Juma';
    expect(isSafeToReload(document)).toBe(false);
    document.querySelector('input').value = '';
    document.querySelector('textarea').value = 'Nguo';
    expect(isSafeToReload(document)).toBe(false);
  });

  test('a screen marked keep-open blocks it (receipt with the one-time claim code)', () => {
    document.body.innerHTML = '<div data-keep-open>4DEE MXZC HEBK</div>';
    expect(isSafeToReload(document)).toBe(false);
  });

  test('read-only or disabled fields and the banner itself do not block', () => {
    document.body.innerHTML = '<input readonly value="x" /><input disabled value="y" /><div data-reload-safe><input value="z" /></div>';
    expect(isSafeToReload(document)).toBe(true);
  });
});

describe('reopening the same screen after an automatic update', () => {
  const {
    rememberPageForUpdate, takeResumePage, RESUME_MAX_AGE_MS, alreadyTriedUpdate, markUpdateTried,
  } = require('./appVersion');
  const store = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  };

  test('the open page, its details and role come back once', () => {
    const s = store();
    expect(rememberPageForUpdate({ page: 'SendShipment', navParams: { from: 'x' }, roleType: 'super_agent' }, s, 1000)).toBe(true);
    expect(takeResumePage(s, 2000)).toEqual({ page: 'SendShipment', navParams: { from: 'x' }, roleType: 'super_agent' });
    expect(takeResumePage(s, 2000)).toBeNull();
  });

  test('too old: not reopened', () => {
    const s = store();
    rememberPageForUpdate({ page: 'SellerOrders' }, s, 0);
    expect(takeResumePage(s, RESUME_MAX_AGE_MS + 1)).toBeNull();
  });

  test('details that cannot be kept: the page is not kept either', () => {
    const s = store();
    const loop = {}; loop.self = loop;
    expect(rememberPageForUpdate({ page: 'X', navParams: loop }, s, 0)).toBe(false);
    expect(takeResumePage(s, 0)).toBeNull();
  });

  test('no storage (private mode): nothing breaks', () => {
    const broken = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); }, removeItem: () => {} };
    expect(rememberPageForUpdate({ page: 'Home' }, broken)).toBe(false);
    expect(takeResumePage(broken)).toBeNull();
    expect(() => markUpdateTried('/static/js/main.1.js', broken)).not.toThrow();
    expect(alreadyTriedUpdate('/static/js/main.1.js', broken)).toBe(false);
  });

  test('a tried version is remembered', () => {
    const s = store();
    expect(alreadyTriedUpdate('/static/js/main.1.js', s)).toBe(false);
    markUpdateTried('/static/js/main.1.js', s);
    expect(alreadyTriedUpdate('/static/js/main.1.js', s)).toBe(true);
    expect(alreadyTriedUpdate('/static/js/main.2.js', s)).toBe(false);
  });
});
