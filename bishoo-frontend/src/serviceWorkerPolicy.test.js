import fs from 'fs';
import path from 'path';

test('deployed service worker makes API and bearer GETs network-only', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'public', 'service-worker.js'), 'utf8');
  expect(source).toContain("request.headers.has('authorization')");
  expect(source).toContain("url.hostname.includes('api.kentexa.com')");
  expect(source).toContain('event.respondWith(fetch(request))');
  expect(source).not.toContain('kentexa-api-v1');
});
