// Phone screenshots of the live site for the Play Store listing (1080 x 2340, portrait),
// plus a check that the addresses the app and shared links depend on answer.
const { chromium } = require('playwright');
const fs = require('fs');

const PROBE = ['/futa-akaunti/', '/', '/uza-tena', '/product/1', '/store/1', '/.well-known/assetlinks.json', '/manifest.json', '/index.html'];
const PAGES = (process.env.SHOT_PAGES || '01-mwanzo=/,02-uza-tena=/?go=/uza-tena,03-bidhaa=/product/1,04-duka=/?go=/@bis,05-tafuta=/?go=/search').split(',').map((p) => [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)]);

(async () => {
  for (const path of PROBE) {
    try {
      const r = await fetch(`https://kentexa.com${path}`, { redirect: 'manual' });
      const body = (await r.text()).slice(0, 80).replace(/\s+/g, ' ');
      console.log('PROBE', path, r.status, 'server=' + r.headers.get('server'), 'type=' + r.headers.get('content-type'), 'loc=' + r.headers.get('location'), '|', body);
    } catch (e) { console.log('PROBE', path, 'error', e.message); }
  }
  fs.mkdirSync(`${__dirname}/out`, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'sw-TZ' });
  await page.addInitScript(() => { try { localStorage.setItem('kentexa_lang', 'sw'); } catch (e) {} });
  for (const [name, url] of PAGES) {
    try {
      await page.goto(`https://kentexa.com${url}`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `${__dirname}/out/${name}.png` });
      console.log('SHOT', name, page.url());
    } catch (e) { console.log('SHOT failed', name, e.message); }
  }
  await browser.close();
})();
