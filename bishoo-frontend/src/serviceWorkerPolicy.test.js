import fs from 'fs';
import path from 'path';

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
