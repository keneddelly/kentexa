/**
 * Traffic step 1 (issue #368): a load test of what a signed-out visitor's Home does, to find how
 * many people at once one server can serve. Run with k6 (https://k6.io) against a COPY of
 * KenteXa (a Render preview or staging service with its own database), never against live:
 *
 *   BASE_URL=https://<staging-api> k6 run scripts/load/browse.k6.js
 *
 * It ramps from 10 to 200 visitors over 10 minutes. Watch GET /version/health on the copy while
 * it runs: the point where p95 passes 2 s, or 5xx / 429 appear, is the limit.
 * It refuses to start against kentexa.com unless ALLOW_LIVE=yes (owner's explicit decision).
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = (__ENV.BASE_URL || '').replace(/\/$/, '');
if (!BASE) throw new Error('Set BASE_URL to a staging copy of the API.');
if (/kentexa\.com/i.test(BASE) && __ENV.ALLOW_LIVE !== 'yes') throw new Error('Refusing to load-test live KenteXa.');

export const options = {
  stages: [
    { duration: '2m', target: 10 },
    { duration: '3m', target: 50 },
    { duration: '3m', target: 200 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
  },
};

const HOME = ['/feed/topics', '/feed/moments/stories', '/feed/discover', '/feed/trending', '/feed?filter=for_you&page=1'];

export default function visit() {
  for (const path of HOME) {
    const res = http.get(`${BASE}${path}`, { tags: { name: path.split('?')[0] } });
    check(res, { 'answered': (r) => r.status > 0 && r.status < 500 });
  }
  sleep(3 + Math.random() * 4); // a person reads before scrolling on
  const more = http.get(`${BASE}/feed?filter=for_you&page=2`, { tags: { name: '/feed (page 2)' } });
  check(more, { 'answered': (r) => r.status > 0 && r.status < 500 });
  sleep(5 + Math.random() * 10);
}
