import fs from 'fs';
import path from 'path';
import vm from 'vm';

test('deployed service worker makes API and bearer GETs network-only', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'public', 'service-worker.js'), 'utf8');
  expect(source).toContain("request.headers.has('authorization')");
  expect(source).toContain("url.hostname.includes('api.kentexa.com')");
  expect(source).toContain('event.respondWith(fetch(request))');
  expect(source).not.toContain('kentexa-api-v1');
});

test('only published static assets are cached, never navigation documents', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'public', 'service-worker.js'), 'utf8');
  expect(source).toContain("url.pathname.startsWith('/static/')");
  expect(source).toContain('if (!isStatic) return');
  expect(source).toContain("['script', 'style', 'image', 'font'].includes(request.destination)");
  expect(source).not.toContain("request.mode === 'navigate'");
});

test('manifest provides Kentexa app icons and a scoped standalone launch', () => {
  const publicDir = path.join(process.cwd(), 'public');
  const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'manifest.json'), 'utf8'));
  expect(manifest.short_name).toBe('Kentexa');
  expect(manifest).toMatchObject({ start_url: '/', scope: '/', display: 'standalone' });
  for (const size of ['192x192', '512x512']) {
    const icon = manifest.icons.find(item => item.sizes === size && item.type === 'image/png');
    expect(icon).toBeTruthy();
    const bytes = fs.readFileSync(path.join(publicDir, icon.src));
    expect(bytes.readUInt32BE(16)).toBe(Number(size.split('x')[0]));
    expect(bytes.readUInt32BE(20)).toBe(Number(size.split('x')[1]));
  }
  const maskable = manifest.icons.find(icon => icon.purpose === 'maskable');
  expect(fs.existsSync(path.join(publicDir, maskable.src))).toBe(true);
  expect(fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8')).toContain('apple-touch-icon');
});

test('service worker never handles transaction or navigation fetches as cached content', async () => {
  const handlers = {};
  const cache = { put: jest.fn() };
  const fetch = jest.fn().mockResolvedValue({ ok: true, type: 'basic', clone: () => ({}) });
  vm.runInNewContext(fs.readFileSync(path.join(process.cwd(), 'public', 'service-worker.js'), 'utf8'), {
    self: { location: { origin: 'https://kentexa.com' }, addEventListener: (type, handler) => { handlers[type] = handler; } },
    URL, fetch,
    caches: { match: jest.fn().mockResolvedValue(null), open: jest.fn().mockResolvedValue(cache) },
  });
  const request = (url, destination = 'document', authorization = false) => ({
    method: 'GET', url, destination, headers: { has: key => authorization && key === 'authorization' },
  });
  const dispatch = (r) => {
    const event = { request: r, respondWith: jest.fn() };
    handlers.fetch(event);
    return event;
  };
  for (const url of ['https://kentexa.com/', 'https://kentexa.com/orders/10',
    'https://kentexa.com/api/payments', 'https://kentexa.com/uploads/customer-photo.png']) {
    const event = dispatch(request(url));
    if (url.includes('/api/')) await event.respondWith.mock.calls[0][0];
    else expect(event.respondWith).not.toHaveBeenCalled();
  }
  await dispatch(request('https://kentexa.com/static/js/main.hash.js', 'script', true))
    .respondWith.mock.calls[0][0];
  expect(cache.put).not.toHaveBeenCalled();
  const asset = dispatch(request('https://kentexa.com/static/js/main.hash.js', 'script'));
  await asset.respondWith.mock.calls[0][0];
  await Promise.resolve();
  expect(cache.put).toHaveBeenCalledTimes(1);
});
